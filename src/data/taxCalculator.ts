import type { Account, CurrencySymbol, ExchangeRates, Transaction } from "../types";
import { parseDate } from "../utils/dates";
import { convertCurrency } from "../utils/currency";

/**
 * Minimum gross wage in Romania by year (RON).
 * Used both to show the evolution and to pick the prior-year wage when
 * computing CASS tax for a given year.
 */
export const ROMANIAN_MINIMUM_WAGE: Record<number, number> = {
  2023: 3300,
  2024: 3700,
  2025: 4050,
  2026: 4325,
};

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
  fee: number;
  grossProfit: number;
  netProfit: number;
  currency: CurrencySymbol;
  sellValueRon: number;
  costBasisRon: number;
  feeRon: number;
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
    const bySymbol = new Map<string, Transaction[]>();
    for (const tx of account.transactions) {
      if (tx.type !== "Buy" && tx.type !== "Sell") continue;
      const arr = bySymbol.get(tx.symbol) ?? [];
      arr.push(tx);
      bySymbol.set(tx.symbol, arr);
    }

    for (const [, txs] of bySymbol) {
      const sorted = [...txs].sort(
        (a, b) => parseDate(a.date).getTime() - parseDate(b.date).getTime()
      );
      const lots: { shares: number; price: number }[] = [];

      for (const tx of sorted) {
        if (tx.type === "Buy") {
          lots.push({ shares: tx.shares, price: tx.price });
          continue;
        }

        let remaining = tx.shares;
        let costBasis = 0;
        while (remaining > 1e-9 && lots.length > 0) {
          const lot = lots[0]!;
          const take = Math.min(lot.shares, remaining);
          costBasis += take * lot.price;
          lot.shares -= take;
          remaining -= take;
          if (lot.shares <= 1e-9) lots.shift();
        }

        const sellValue = tx.shares * tx.price;
        const grossProfit = sellValue - costBasis;
        const netProfit = grossProfit - tx.fee;

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
          fee: tx.fee,
          grossProfit,
          netProfit,
          currency: tx.currency,
          sellValueRon: convertCurrency(sellValue, tx.currency, "RON", rates),
          costBasisRon: convertCurrency(costBasis, tx.currency, "RON", rates),
          feeRon: convertCurrency(tx.fee, tx.currency, "RON", rates),
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
 *  - net dividends received that year (gross value - withholding tax fee)
 *  - net profit of each profitable sell transaction of that year
 *    (only sells with grossProfit > 0 are included).
 */
export interface YearlyIncomeBreakdown {
  year: number;
  dividendsNetRon: number;
  sellsNetRon: number;
  totalRon: number;
  profitableSellCount: number;
  dividendCount: number;
}

export function computeYearlyIncome(
  accounts: Account[],
  sells: SellPnL[],
  year: number,
  rates: ExchangeRates
): YearlyIncomeBreakdown {
  let dividendsNetRon = 0;
  let dividendCount = 0;

  for (const account of accounts) {
    for (const tx of account.transactions) {
      if (tx.type !== "Dividend") continue;
      if (parseDate(tx.date).getFullYear() !== year) continue;
      const gross = tx.shares * tx.price;
      const net = gross - tx.fee;
      dividendsNetRon += convertCurrency(net, tx.currency, "RON", rates);
      dividendCount += 1;
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
    sellsNetRon,
    totalRon: dividendsNetRon + sellsNetRon,
    profitableSellCount,
    dividendCount,
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
