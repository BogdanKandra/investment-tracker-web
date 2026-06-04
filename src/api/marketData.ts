import type { OhlcData, TimeRange } from "../types";
import { timeRangeToDays } from "../utils/dates";

const CORS_PROXY = "https://corsproxy.io/?url=";

/**
 * Build a Yahoo Finance chart API URL for a given symbol and range.
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
    const t = typeof d.time === "number"
      ? d.time * 1000
      : new Date(d.time).getTime();
    return t >= cutoff;
  });
}

export async function fetchHistoricalData(
  symbol: string,
  range: TimeRange
): Promise<OhlcData[]> {
  const { range: yRange, interval, intraday } = yahooRange(range);
  const url = `${CORS_PROXY}${encodeURIComponent(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${yRange}&interval=${interval}`
  )}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return generateMockData(range);
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return generateMockData(range);

    const timestamps: number[] = result.timestamp ?? [];
    const quote = result.indicators?.quote?.[0];
    if (!quote) return generateMockData(range);

    const data: OhlcData[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const ts = timestamps[i]!;
      const o = quote.open?.[i];
      const h = quote.high?.[i];
      const l = quote.low?.[i];
      const c = quote.close?.[i];
      if (o == null || h == null || l == null || c == null) continue;

      if (intraday) {
        data.push({
          time: ts,
          open: o,
          high: h,
          low: l,
          close: c,
          volume: quote.volume?.[i] ?? undefined,
        });
      } else {
        const d = new Date(ts * 1000);
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        data.push({
          time: dateStr,
          open: o,
          high: h,
          low: l,
          close: c,
          volume: quote.volume?.[i] ?? undefined,
        });
      }
    }

    return trimToRange(data, range);
  } catch {
    return generateMockData(range);
  }
}

export async function fetchCurrentPrice(
  symbol: string
): Promise<number | null> {
  const url = `${CORS_PROXY}${encodeURIComponent(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`
  )}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const meta = json?.chart?.result?.[0]?.meta;
    return meta?.regularMarketPrice ?? null;
  } catch {
    return null;
  }
}

export async function fetchCurrentPrices(
  symbols: string[]
): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  const batches: Promise<void>[] = [];

  for (const symbol of symbols) {
    batches.push(
      fetchCurrentPrice(symbol).then((price) => {
        if (price != null) prices.set(symbol, price);
      })
    );
  }

  await Promise.allSettled(batches);
  return prices;
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
  const url = `${CORS_PROXY}${encodeURIComponent(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=max&interval=${interval}`
  )}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return [];

    const timestamps: number[] = result.timestamp ?? [];
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];

    const data: Array<{ time: string; close: number }> = [];
    for (let i = 0; i < timestamps.length; i++) {
      const c = closes[i];
      if (c == null) continue;
      const d = new Date(timestamps[i]! * 1000);
      data.push({
        time: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`,
        close: c,
      });
    }

    return data;
  } catch {
    return [];
  }
}

/** Generate mock price data when the API is unavailable */
function generateMockData(range: TimeRange): OhlcData[] {
  const { intraday } = yahooRange(range);
  const days = timeRangeToDays(range) ?? 365;
  const data: OhlcData[] = [];
  let price = 100 + Math.random() * 200;
  const now = Date.now();

  if (intraday) {
    const intervalMinutes = range === "1D" ? 5 : range === "1W" ? 30 : 60;
    const totalBars = Math.floor((days * 24 * 60) / intervalMinutes);
    const startTs = Math.floor(now / 1000) - totalBars * intervalMinutes * 60;

    for (let i = 0; i < totalBars; i++) {
      const change = (Math.random() - 0.48) * 3;
      price = Math.max(10, price + change);
      const open = price;
      const close = price + (Math.random() - 0.5) * 2;
      const high = Math.max(open, close) + Math.random() * 2;
      const low = Math.min(open, close) - Math.random() * 2;

      data.push({
        time: startTs + i * intervalMinutes * 60,
        open: +open.toFixed(2),
        high: +high.toFixed(2),
        low: +Math.max(1, low).toFixed(2),
        close: +close.toFixed(2),
      });
    }
  } else {
    for (let i = days; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const change = (Math.random() - 0.48) * 3;
      price = Math.max(10, price + change);
      const open = price;
      const close = price + (Math.random() - 0.5) * 2;
      const high = Math.max(open, close) + Math.random() * 2;
      const low = Math.min(open, close) - Math.random() * 2;

      data.push({
        time: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
        open: +open.toFixed(2),
        high: +high.toFixed(2),
        low: +Math.max(1, low).toFixed(2),
        close: +close.toFixed(2),
      });
    }
  }

  return data;
}
