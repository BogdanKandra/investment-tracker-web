import type { CurrencySymbol, OhlcData, TimeRange } from "../types";
import { timeRangeToDays, toIsoDate } from "../utils/dates";

/**
 * Same-origin path proxied by Vite to query1.finance.yahoo.com (avoids CORS).
 * The proxy exists only in `vite dev` / `vite preview` (see vite.config.ts).
 */
function yahooChartUrl(symbol: string, search: string): string {
  return `/api/yahoo/v8/finance/chart/${encodeURIComponent(symbol)}?${search}`;
}

/**
 * Yahoo intervals: 1m, 2m, 5m, 15m, 30m, 60m, 90m, 1h, 1d, 5d, 1wk, 1mo, 3mo
 * Yahoo ranges: 1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, 10y, ytd, max
 */
interface YahooParams {
  range: string;
  interval: string;
  intraday: boolean;
}

function yahooRange(range: TimeRange): YahooParams {
  const map: Record<TimeRange, YahooParams> = {
    "1D": { range: "1d", interval: "5m", intraday: true },
    "1W": { range: "5d", interval: "30m", intraday: true },
    "2W": { range: "1mo", interval: "1h", intraday: true },
    "1M": { range: "1mo", interval: "1d", intraday: false },
    "2M": { range: "3mo", interval: "1d", intraday: false },
    "3M": { range: "3mo", interval: "1d", intraday: false },
    "6M": { range: "6mo", interval: "1d", intraday: false },
    "1Y": { range: "1y", interval: "1d", intraday: false },
    "2Y": { range: "2y", interval: "1wk", intraday: false },
    "3Y": { range: "5y", interval: "1wk", intraday: false },
    "5Y": { range: "5y", interval: "1wk", intraday: false },
    ALL: { range: "max", interval: "1mo", intraday: false },
  };
  return map[range];
}

function trimToRange(data: OhlcData[], range: TimeRange): OhlcData[] {
  const days = timeRangeToDays(range);
  if (days == null || data.length === 0) return data;

  const now = Date.now();
  const cutoff = now - days * 24 * 60 * 60 * 1000;

  return data.filter((d) => {
    const t =
      typeof d.time === "number" ? d.time * 1000 : new Date(d.time).getTime();
    return t >= cutoff;
  });
}

/** The first chart result of a Yahoo response, or null if missing. */
async function fetchChartResult(url: string) {
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = await res.json();
  return json?.chart?.result?.[0] ?? null;
}

/** UTC calendar date (YYYY-MM-DD) of a Unix timestamp in seconds. */
function utcIsoDate(seconds: number): string {
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

/** Closing prices of a Yahoo chart result, skipping empty bars. */
function parseCloses(result: {
  timestamp?: number[];
  indicators?: { quote?: Array<{ close?: (number | null)[] }> };
}): Array<{ time: string; close: number }> {
  const timestamps = result.timestamp ?? [];
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  const data: Array<{ time: string; close: number }> = [];
  for (let i = 0; i < timestamps.length; i++) {
    const c = closes[i];
    if (c == null) continue;
    data.push({ time: utcIsoDate(timestamps[i]!), close: c });
  }
  return data;
}

/**
 * OHLC bars for a symbol over a time range. Returns null when Yahoo can't be
 * reached or returns no data, so the chart can say so instead of drawing
 * made-up prices.
 */
export async function fetchHistoricalData(
  symbol: string,
  range: TimeRange
): Promise<OhlcData[] | null> {
  const { range: yRange, interval, intraday } = yahooRange(range);
  const url = yahooChartUrl(symbol, `range=${yRange}&interval=${interval}`);

  try {
    const result = await fetchChartResult(url);
    if (!result) return null;

    const timestamps: number[] = result.timestamp ?? [];
    const quote = result.indicators?.quote?.[0];
    if (!quote) return null;

    const data: OhlcData[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const ts = timestamps[i]!;
      const o = quote.open?.[i];
      const h = quote.high?.[i];
      const l = quote.low?.[i];
      const c = quote.close?.[i];
      if (o == null || h == null || l == null || c == null) continue;

      data.push({
        // Intraday bars keep their timestamp; daily bars use the local date.
        time: intraday ? ts : toIsoDate(new Date(ts * 1000)),
        open: o,
        high: h,
        low: l,
        close: c,
        volume: quote.volume?.[i] ?? undefined,
      });
    }

    return trimToRange(data, range);
  } catch {
    return null;
  }
}

/** Latest market price for a symbol, or null if unavailable. */
export async function fetchCurrentPrice(
  symbol: string
): Promise<number | null> {
  const url = yahooChartUrl(symbol, "range=1d&interval=1d");

  try {
    const result = await fetchChartResult(url);
    return result?.meta?.regularMarketPrice ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch the full price history (closing prices) for a symbol at the given interval.
 * Uses Yahoo Finance range=max so data spans from the earliest available date to today.
 * Returns an ascending-sorted array of { time: YYYY-MM-DD, close }.
 * Returns an empty array on failure so callers can degrade gracefully.
 */
export async function fetchHistoricalCloses(
  symbol: string,
  interval: "1d" | "1wk" | "1mo" | "3mo"
): Promise<Array<{ time: string; close: number }>> {
  const url = yahooChartUrl(symbol, `range=max&interval=${interval}`);

  try {
    const result = await fetchChartResult(url);
    return result ? parseCloses(result) : [];
  } catch {
    return [];
  }
}

function yahooCurrencyToSymbol(currency: string | undefined): CurrencySymbol {
  switch (currency?.toUpperCase()) {
    case "USD":
      return "$";
    case "EUR":
      return "€";
    case "RON":
      return "RON";
    case "DKK":
      return "DKK";
    default:
      return "€";
  }
}

export interface BenchmarkCloseHistory {
  symbol: string;
  currency: CurrencySymbol;
  data: Array<{ time: string; close: number }>;
}

/**
 * Try Yahoo symbol candidates in order; return the first with price history.
 */
export async function fetchBenchmarkCloses(
  symbolCandidates: string[],
  interval: "1d" | "1wk" | "1mo" | "3mo" = "1wk"
): Promise<BenchmarkCloseHistory | null> {
  for (const symbol of symbolCandidates) {
    const url = yahooChartUrl(symbol, `range=max&interval=${interval}`);

    try {
      const result = await fetchChartResult(url);
      if (!result) continue;
      const data = parseCloses(result);
      if (data.length > 0) {
        return {
          symbol,
          currency: yahooCurrencyToSymbol(result.meta?.currency),
          data,
        };
      }
    } catch {
      continue;
    }
  }

  return null;
}
