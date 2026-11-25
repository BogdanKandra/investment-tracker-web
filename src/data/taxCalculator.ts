import type {
  Account,
  CurrencySymbol,
  ExchangeRates,
  SecurityTransaction,
} from "../types";
import { parseDate } from "../utils/dates";
import { matchFifo } from "./fifoCalculator";
import { convertCurrency, currencyLabel } from "../utils/currency";

/**
 * History of the Romanian minimum gross wage (salariul de bază minim brut pe
 * țară), in RON. Each entry applies from `effectiveFrom` until the next entry.
 * Keep entries sorted ascending by date. Mid-year raises go here too.
 */
export const ROMANIAN_MINIMUM_WAGE_HISTORY: ReadonlyArray<{
  effectiveFrom: string; // ISO date, YYYY-MM-DD
  amount: number;
}> = [
  { effectiveFrom: "2023-10-01", amount: 3300 }, // HG 900/2023
  { effectiveFrom: "2024-07-01", amount: 3700 }, // HG 598/2024
  { effectiveFrom: "2025-01-01", amount: 4050 }, // HG 1506/2024
  { effectiveFrom: "2026-07-01", amount: 4325 }, // HG 146/2026
];

/**
 * Minimum gross wage in force on the given ISO date (YYYY-MM-DD), or
 * undefined if the date is before the first recorded entry.
 */
export function getMinimumWageAt(isoDate: string): number | undefined {
  let wage: number | undefined;
  for (const entry of ROMANIAN_MINIMUM_WAGE_HISTORY) {
    if (entry.effectiveFrom > isoDate) break;
    wage = entry.amount;
  }
  return wage;
}

/**
 * Minimum wage used for the CASS brackets on income earned in `incomeYear`.
 * Per Codul fiscal art. 135^1 alin. (3), the brackets use the minimum wage in
 * force on 1 January of the year the income was earned. Raises later in that
 * year (e.g. 1 July 2026) do not change that year's brackets.
 */
export function getCassMinimumWage(incomeYear: number): number | undefined {
  return getMinimumWageAt(`${incomeYear}-01-01`);
}

/**
 * First income year whose CASS wage is known, i.e. the first year whose
 * 1 January is covered by the history (the year after the first entry, unless
 * that entry starts exactly on 1 January).
 */
export const FIRST_CASS_INCOME_YEAR = (() => {
  const first = ROMANIAN_MINIMUM_WAGE_HISTORY[0]!.effectiveFrom;
  const year = Number(first.slice(0, 4));
  return first.endsWith("-01-01") ? year : year + 1;
})();

/**
 * Romanian dividend tax rate by year.
 * Applied to gross dividends from foreign sources when filing taxes.
 */
export const DIVIDEND_TAX: Record<number, number> = {
  2024: 0.08,
  2025: 0.10,
  2026: 0.16,
};

/**
 * Average yearly exchange rates to RON for dividend tax calculations.
 * Key format: "CURRENCY_YEAR" e.g. "USD_2024" means average USD→RON for 2024.
 */
export const AVERAGE_YEARLY_RATES_TO_RON: Record<string, number> = {
  USD_2024: 4.5984,
  USD_2025: 4.4705,
  EUR_2024: 4.9746,
  EUR_2025: 5.0415,
  DKK_2024: 0.6669,
  DKK_2025: 0.6755,
};

const ISO_ALPHA2_TO_COUNTRY: Record<string, string> = {
  US: "USA",
  GB: "United Kingdom",
  IE: "Ireland",
  FR: "France",
  DE: "Germany",
  NL: "Netherlands",
  BE: "Belgium",
  LU: "Luxembourg",
  CH: "Switzerland",
  SE: "Sweden",
  DK: "Denmark",
  NO: "Norway",
  FI: "Finland",
  IT: "Italy",
  ES: "Spain",
  PT: "Portugal",
  AT: "Austria",
  CA: "Canada",
  AU: "Australia",
  JP: "Japan",
  CN: "China",
  HK: "Hong Kong",
  KR: "South Korea",
  TW: "Taiwan",
  SG: "Singapore",
  BR: "Brazil",
  IN: "India",
  RO: "Romania",
  GR: "Greece",
  PL: "Poland",
  CZ: "Czech Republic",
  IL: "Israel",
  ZA: "South Africa",
  MX: "Mexico",
};

/**
 * Derive the country of origin for a security.
 * Priority:
 *  1. Explicit `country` field (populated by scripts/populate-countries.ts)
 *  2. ISIN prefix (first 2 chars = ISO 3166-1 alpha-2 country code)
 *  3. Symbol exchange suffix (.RO, .PA, .DE, .AS)
 *  4. Currency-based fallback ($ → USA)
 */
export function getCountryFromSymbol(
  symbol: string,
  currency: CurrencySymbol,
  isin?: string,
  country?: string
): string {
  if (country) return country;

  if (isin && isin.length >= 2) {
    const code = isin.substring(0, 2).toUpperCase();
    const resolved = ISO_ALPHA2_TO_COUNTRY[code];
    if (resolved) return resolved;
  }

  if (symbol.endsWith(".RO")) return "Romania";
  if (symbol.endsWith(".PA")) return "France";
  if (symbol.endsWith(".DE")) return "Germany";
  if (symbol.endsWith(".AS")) return "Netherlands";
  if (currency === "$") return "USA";
  return "Other";
}

/**
 * Converts an amount to RON for tax purposes in `year`: uses the yearly
 * average rate from AVERAGE_YEARLY_RATES_TO_RON when recorded, otherwise
 * falls back to the given (live) rates.
 */
export function toRonAtYearlyRate(
  amount: number,
  currency: CurrencySymbol,
  year: number,
  rates: ExchangeRates
): number {
  if (currency === "RON") return amount;
  const yearlyRate =
    AVERAGE_YEARLY_RATES_TO_RON[`${currencyLabel(currency)}_${year}`];
  if (yearlyRate) return amount * yearlyRate;
  return convertCurrency(amount, currency, "RON", rates);
}

/** W-8BEN: US dividend withholding without and with the tax treaty. */
export const W8BEN_PRE_TREATY_RATE = 0.3;
export const W8BEN_POST_TREATY_RATE = 0.1;

export const DEFAULT_CASS_PROPORTION = 0.1;

export interface SellPnL {
  date: string;
  year: number;
  account: string;
  symbol: string;
  name: string;
  shares: number;
  sellPrice: number;
  sellValue: number;
  costBasis: number;
  /** Income tax withheld by the broker on this sell. */
  taxWithheld: number;
  grossProfit: number;
  netProfit: number;
  currency: CurrencySymbol;
  sellValueRon: number;
  costBasisRon: number;
  taxWithheldRon: number;
  grossProfitRon: number;
  netProfitRon: number;
}

/**
 * Walks all accounts with FIFO lot tracking (per account + symbol) and returns
 * a record for every sell transaction with its realised gross/net profit.
 */
export function computeSellPnL(
  accounts: Account[],
  rates: ExchangeRates
): SellPnL[] {
  const results: SellPnL[] = [];

  for (const account of accounts) {
    const bySymbol = new Map<string, SecurityTransaction[]>();
    for (const tx of account.transactions) {
      if (tx.type !== "Buy" && tx.type !== "Sell") continue;
      const arr = bySymbol.get(tx.symbol) ?? [];
      arr.push(tx);
      bySymbol.set(tx.symbol, arr);
    }

    for (const [, txs] of bySymbol) {
      for (const { tx, costBasis } of matchFifo(txs).sells) {
        const sellValue = tx.shares * tx.price;
        const grossProfit = sellValue - costBasis;
        const netProfit = grossProfit - tx.taxWithheld;

        results.push({
          date: tx.date,
          year: parseDate(tx.date).getFullYear(),
          account: account.account_name,
          symbol: tx.symbol,
          name: tx.name,
          shares: tx.shares,
          sellPrice: tx.price,
          sellValue,
          costBasis,
          taxWithheld: tx.taxWithheld,
          grossProfit,
          netProfit,
          currency: tx.currency,
          sellValueRon: convertCurrency(sellValue, tx.currency, "RON", rates),
          costBasisRon: convertCurrency(costBasis, tx.currency, "RON", rates),
          taxWithheldRon: convertCurrency(tx.taxWithheld, tx.currency, "RON", rates),
          grossProfitRon: convertCurrency(grossProfit, tx.currency, "RON", rates),
          netProfitRon: convertCurrency(netProfit, tx.currency, "RON", rates),
        });
      }
    }
  }

  results.sort(
    (a, b) => parseDate(b.date).getTime() - parseDate(a.date).getTime()
  );
  return results;
}

/**
 * Compute the cumulated taxable income (in RON) for a given calendar year:
 *  - net dividends received that year (gross value - tax withheld)
 *  - net interest received that year (amount - tax withheld)
 *  - net profit of each profitable sell transaction of that year
 *    (only sells with grossProfit > 0 are included).
 */
export interface YearlyIncomeBreakdown {
  year: number;
  dividendsNetRon: number;
  interestNetRon: number;
  sellsNetRon: number;
  totalRon: number;
  profitableSellCount: number;
  dividendCount: number;
  interestCount: number;
}

export function computeYearlyIncome(
  accounts: Account[],
  sells: SellPnL[],
  year: number,
  rates: ExchangeRates
): YearlyIncomeBreakdown {
  let dividendsNetRon = 0;
  let dividendCount = 0;
  let interestNetRon = 0;
  let interestCount = 0;

  const toRon = (amount: number, currency: CurrencySymbol): number =>
    toRonAtYearlyRate(amount, currency, year, rates);

  for (const account of accounts) {
    for (const tx of account.transactions) {
      if (tx.type === "Dividend") {
        if (parseDate(tx.date).getFullYear() !== year) continue;
        const gross = tx.shares * tx.price;
        const net = gross - tx.taxWithheld;
        dividendsNetRon += toRon(net, tx.currency);
        dividendCount += 1;
      } else if (tx.type === "Interest") {
        if (parseDate(tx.date).getFullYear() !== year) continue;
        const net = tx.amount - tx.taxWithheld;
        interestNetRon += toRon(net, tx.currency);
        interestCount += 1;
      }
    }
  }

  let sellsNetRon = 0;
  let profitableSellCount = 0;
  for (const s of sells) {
    if (s.year !== year) continue;
    if (s.grossProfit <= 0) continue;
    sellsNetRon += s.netProfitRon;
    profitableSellCount += 1;
  }

  return {
    year,
    dividendsNetRon,
    interestNetRon,
    sellsNetRon,
    totalRon: dividendsNetRon + interestNetRon + sellsNetRon,
    profitableSellCount,
    dividendCount,
    interestCount,
  };
}

export type CassBracket = "below6" | "6to12" | "12to24" | "above24";

export interface CassResult {
  income: number;
  minimumWage: number;
  proportion: number;
  sixWages: number;
  twelveWages: number;
  twentyFourWages: number;
  bracket: CassBracket;
  tax: number;
}

/**
 * Implements the Romanian CASS tiering for capital/dividend income.
 * income + minimumWage must be in the same currency (RON).
 */
export function computeCassTax(
  income: number,
  minimumWage: number,
  proportion: number
): CassResult {
  const sixWages = 6 * minimumWage;
  const twelveWages = 12 * minimumWage;
  const twentyFourWages = 24 * minimumWage;

  let tax = 0;
  let bracket: CassBracket = "below6";

  if (income >= twentyFourWages) {
    tax = proportion * twentyFourWages;
    bracket = "above24";
  } else if (income >= twelveWages) {
    tax = proportion * twelveWages;
    bracket = "12to24";
  } else if (income >= sixWages) {
    tax = proportion * sixWages;
    bracket = "6to12";
  }

  return {
    income,
    minimumWage,
    proportion,
    sixWages,
    twelveWages,
    twentyFourWages,
    bracket,
    tax,
  };
}

/**
 * List of every calendar year with at least one transaction (any type).
 * Sorted ascending.
 */
export function collectTransactionYears(accounts: Account[]): number[] {
  const years = new Set<number>();
  for (const account of accounts) {
    for (const tx of account.transactions) {
      years.add(parseDate(tx.date).getFullYear());
    }
  }
  return Array.from(years).sort((a, b) => a - b);
}
