import type { OhlcData, TimeRange } from "../types";
import { timeRangeToDays } from "../utils/dates";

const CORS_PROXY = "https://corsproxy.io/?url=";

/**
 * Build a Yahoo Finance chart API URL for a given symbol and range.
 * Yahoo intervals: 1m, 2m, 5m, 15m, 30m, 60m, 90m, 1h, 1d, 5d, 1wk, 1mo, 3mo
 * Yahoo ranges: 1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, 10y, ytd, max
 */
function yahooRange(range: TimeRange): { range: string; interval: string } {
  const map: Record<TimeRange, { range: string; interval: string }> = {
    "1D": { range: "1d", interval: "5m" },
    "1W": { range: "5d", interval: "30m" },
    "2W": { range: "1mo", interval: "1h" },
    "1M": { range: "1mo", interval: "1d" },
    "2M": { range: "3mo", interval: "1d" },
    "3M": { range: "3mo", interval: "1d" },
    "6M": { range: "6mo", interval: "1d" },
    "1Y": { range: "1y", interval: "1d" },
    "3Y": { range: "5y", interval: "1wk" },
    "5Y": { range: "5y", interval: "1wk" },
    ALL: { range: "max", interval: "1mo" },
  };
  return map[range];
}

export async function fetchHistoricalData(
  symbol: string,
  range: TimeRange
): Promise<OhlcData[]> {
  const { range: yRange, interval } = yahooRange(range);
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
    return data;
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

/** Generate mock price data when the API is unavailable */
function generateMockData(range: TimeRange): OhlcData[] {
  const days = timeRangeToDays(range) ?? 365;
  const data: OhlcData[] = [];
  let price = 100 + Math.random() * 200;
  const now = new Date();

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
  return data;
}
