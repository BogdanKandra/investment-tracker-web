import { convertCurrency } from "../../utils/currency";
import { parseDate, toIsoDate } from "../../utils/dates";
import type { Account, CurrencySymbol, ExchangeRates } from "../../types";
import type { ResolvedBenchmark } from "./benchmarks";

export type ShareLedgerEntry = { date: string; cumShares: number };

export function computePortfolioValueAt(
  timeKey: string,
  syms: string[],
  priceHistories: Map<string, Array<{ time: string; close: number }>>,
  ledger: Map<string, ShareLedgerEntry[]>,
  symbolCurrencies: Map<string, CurrencySymbol>,
  displayCurrency: CurrencySymbol,
  rates: ExchangeRates,
  requireAllHeldPrices = true
): number | null {
  let total = 0;
  for (const sym of syms) {
    const shares = getSharesAt(ledger.get(sym) ?? [], timeKey);
    if (shares <= 0) continue;
    const history = priceHistories.get(sym);
    if (!history) {
      if (requireAllHeldPrices) return null;
      continue;
    }
    const price = getLastKnownClose(history, timeKey);
    if (price == null) {
      if (requireAllHeldPrices) return null;
      continue;
    }
    const currency = symbolCurrencies.get(sym)!;
    total += convertCurrency(shares * price, currency, displayCurrency, rates);
  }
  return total > 0 ? +total.toFixed(2) : null;
}

export function findComparisonStart(
  sortedKeys: string[],
  syms: string[],
  priceHistories: Map<string, Array<{ time: string; close: number }>>,
  ledger: Map<string, ShareLedgerEntry[]>,
  symbolCurrencies: Map<string, CurrencySymbol>,
  displayCurrency: CurrencySymbol,
  rates: ExchangeRates,
  benchmarks: ResolvedBenchmark[]
): { time: string; value: number } | null {
  for (const timeKey of sortedKeys) {
    const value = computePortfolioValueAt(
      timeKey,
      syms,
      priceHistories,
      ledger,
      symbolCurrencies,
      displayCurrency,
      rates,
      true
    );
    if (value == null) continue;

    const benchmarksReady = benchmarks.every(
      (bench) => getLastKnownClose(bench.history, timeKey) != null
    );
    if (!benchmarksReady) continue;

    return { time: timeKey, value };
  }
  return null;
}

export function buildShareLedger(
  accounts: Account[]
): Map<string, ShareLedgerEntry[]> {
  const increments = new Map<string, Array<{ date: string; delta: number }>>();

  for (const acct of accounts) {
    for (const tx of acct.transactions) {
      if (tx.type !== "Buy" && tx.type !== "Sell") continue;
      if (!tx.symbol || tx.shares == null) continue;
      const isoDate = toIsoDate(parseDate(tx.date));
      const arr = increments.get(tx.symbol) ?? [];
      arr.push({
        date: isoDate,
        delta: tx.type === "Buy" ? tx.shares : -tx.shares,
      });
      increments.set(tx.symbol, arr);
    }
  }

  const ledger = new Map<string, ShareLedgerEntry[]>();
  for (const [symbol, entries] of increments) {
    entries.sort((a, b) => a.date.localeCompare(b.date));
    let cum = 0;
    ledger.set(
      symbol,
      entries.map((e) => {
        cum += e.delta;
        return { date: e.date, cumShares: Math.max(0, +cum.toFixed(8)) };
      })
    );
  }

  return ledger;
}

export function getSharesAt(
  entries: ShareLedgerEntry[],
  targetDate: string
): number {
  let result = 0;
  for (const e of entries) {
    if (e.date <= targetDate) result = e.cumShares;
    else break;
  }
  return result;
}

export function getLastKnownClose(
  history: Array<{ time: string; close: number }>,
  targetDate: string
): number | undefined {
  let result: number | undefined;
  for (const e of history) {
    if (e.time <= targetDate) result = e.close;
    else break;
  }
  return result;
}

/** Scale portfolio baseline by benchmark price return (ratio is currency-neutral). */
export function scaledBenchmarkValue(
  close: number | undefined,
  startClose: number,
  baselineAmount: number
): number | null {
  if (close == null || startClose <= 0 || baselineAmount <= 0) return null;
  return +(baselineAmount * (close / startClose)).toFixed(2);
}
