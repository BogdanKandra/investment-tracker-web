import { vi } from "vitest";
import { SAMPLE_PRICES } from "./samplePortfolio";

/** Units per 1 USD returned by the mocked rates API (1 $ = 4.5 RON). */
export const MOCK_RATES_PER_USD = { USD: 1, EUR: 0.9, RON: 4.5, DKK: 9 };

interface MockFetchOptions {
  prices?: Record<string, number>;
  /** Make the exchange-rate API fail. */
  ratesDown?: boolean;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Replaces global fetch with a fake that serves the Yahoo chart API (latest
 * price and a short daily history) and the exchange-rate API. Returns the
 * mock so tests can inspect calls.
 */
export function mockFetch({
  prices = SAMPLE_PRICES,
  ratesDown = false,
}: MockFetchOptions = {}) {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.includes("exchangerate-api.com")) {
      if (ratesDown) return json({}, 503);
      return json({ date: "2026-11-24", rates: MOCK_RATES_PER_USD });
    }

    const m = /\/api\/yahoo\/v8\/finance\/chart\/([^?]+)/.exec(url);
    if (m) {
      const symbol = decodeURIComponent(m[1]!);
      const price = prices[symbol];
      if (price === undefined) return json({}, 404);
      const day = 86400;
      const start = Date.UTC(2026, 9, 1) / 1000;
      const timestamp = [start, start + day, start + 2 * day];
      const close = [price * 0.98, price * 0.99, price];
      return json({
        chart: {
          result: [
            {
              meta: { regularMarketPrice: price, currency: "USD" },
              timestamp,
              indicators: {
                quote: [{ open: close, high: close, low: close, close }],
              },
            },
          ],
        },
      });
    }

    return json({ error: `unmocked URL ${url}` }, 404);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}
