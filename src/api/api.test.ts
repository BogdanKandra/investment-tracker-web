import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { fetchExchangeRates, FALLBACK_RATES } from "./exchangeRates";
import {
  fetchBenchmarkCloses,
  fetchCurrentPrice,
  fetchHistoricalCloses,
  fetchHistoricalData,
} from "./marketData";
import { getCachedPrice, loadPrices, symbolsToFetch } from "./priceCache";
import { useCurrentPrices } from "../hooks/useCurrentPrices";
import { MOCK_RATES_PER_USD, mockFetch } from "../test/mockFetch";

describe("fetchExchangeRates", () => {
  it("returns live rates per USD with their date", async () => {
    mockFetch();
    await expect(fetchExchangeRates()).resolves.toEqual({
      rates: {
        $: MOCK_RATES_PER_USD.USD,
        "€": MOCK_RATES_PER_USD.EUR,
        RON: MOCK_RATES_PER_USD.RON,
        DKK: MOCK_RATES_PER_USD.DKK,
      },
      source: "live",
      asOf: "2026-11-24",
    });
  });

  it("falls back to built-in rates when the API fails", async () => {
    mockFetch({ ratesDown: true });
    await expect(fetchExchangeRates()).resolves.toEqual({
      rates: FALLBACK_RATES,
      source: "fallback",
      asOf: null,
    });
  });

  it("falls back when a currency is missing from the response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ rates: { EUR: 0.9, RON: 4.5 } }))
    );
    expect((await fetchExchangeRates()).source).toBe("fallback");
  });

  it("falls back when the request throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("offline");
      })
    );
    expect((await fetchExchangeRates()).source).toBe("fallback");
  });
});

describe("marketData", () => {
  it("reads the latest price, or null when unavailable", async () => {
    mockFetch({ prices: { AAA: 150 } });
    await expect(fetchCurrentPrice("AAA")).resolves.toBe(150);
    await expect(fetchCurrentPrice("NOPE")).resolves.toBeNull();
  });

  it("parses daily closes as UTC dates", async () => {
    mockFetch({ prices: { AAA: 100 } });
    await expect(fetchHistoricalCloses("AAA", "1d")).resolves.toEqual([
      { time: "2026-10-01", close: 98 },
      { time: "2026-10-02", close: 99 },
      { time: "2026-10-03", close: 100 },
    ]);
    await expect(fetchHistoricalCloses("NOPE", "1d")).resolves.toEqual([]);
  });

  it("returns null instead of made-up data when history is unavailable", async () => {
    mockFetch({ prices: {} });
    await expect(fetchHistoricalData("NOPE", "ALL")).resolves.toBeNull();
  });

  it("returns OHLC bars when history is available", async () => {
    mockFetch({ prices: { AAA: 100 } });
    const bars = await fetchHistoricalData("AAA", "ALL");
    expect(bars).toHaveLength(3);
    expect(bars![2]).toMatchObject({ time: "2026-10-03", close: 100 });
  });

  it("tries benchmark symbols in order until one has data", async () => {
    mockFetch({ prices: { SECOND: 50 } });
    const r = await fetchBenchmarkCloses(["FIRST", "SECOND"]);
    expect(r?.symbol).toBe("SECOND");
    expect(r?.currency).toBe("$");
    expect(r?.data).toHaveLength(3);
    await expect(fetchBenchmarkCloses(["NONE"])).resolves.toBeNull();
  });
});

describe("price cache", () => {
  it("fetches each symbol once and serves later requests from the cache", async () => {
    const fetchMock = mockFetch({ prices: { AAA: 150 } });
    await loadPrices(["AAA", "NOPE"]);
    expect(getCachedPrice("AAA")?.price).toBe(150);
    expect(getCachedPrice("NOPE")?.price).toBeNull(); // failure is cached
    expect(symbolsToFetch(["AAA", "NOPE", "NEW"])).toEqual(["NEW"]);

    await loadPrices(["AAA"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("deduplicates concurrent requests for the same symbol", async () => {
    const fetchMock = mockFetch({ prices: { AAA: 150 } });
    await Promise.all([loadPrices(["AAA"]), loadPrices(["AAA"])]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("expires entries after five minutes", async () => {
    mockFetch({ prices: { AAA: 150 } });
    await loadPrices(["AAA"]);
    const later = Date.now() + 5 * 60 * 1000 + 1;
    expect(getCachedPrice("AAA", later)).toBeUndefined();
    expect(symbolsToFetch(["AAA"], later)).toEqual(["AAA"]);
  });
});

describe("useCurrentPrices", () => {
  it("reports loading, then prices and missing symbols", async () => {
    mockFetch({ prices: { AAA: 150 } });
    const { result } = renderHook(() => useCurrentPrices(["AAA", "NOPE"]));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.prices.get("AAA")).toBe(150);
    expect(result.current.missing).toEqual(["NOPE"]);
  });

  it("shares the cache between components", async () => {
    const fetchMock = mockFetch({ prices: { AAA: 150 } });
    const first = renderHook(() => useCurrentPrices(["AAA"]));
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    const second = renderHook(() => useCurrentPrices(["AAA"]));
    expect(second.result.current.prices.get("AAA")).toBe(150);
    expect(second.result.current.loading).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fetches only the newly requested symbols when the list grows", async () => {
    const fetchMock = mockFetch({ prices: { AAA: 150, BBB: 60 } });
    const { result, rerender } = renderHook(
      ({ symbols }) => useCurrentPrices(symbols),
      { initialProps: { symbols: ["AAA"] } }
    );
    await waitFor(() => expect(result.current.prices.size).toBe(1));
    await act(async () => rerender({ symbols: ["AAA", "BBB"] }));
    await waitFor(() => expect(result.current.prices.get("BBB")).toBe(60));
    const urls = fetchMock.mock.calls.map(([u]) => String(u));
    expect(urls.filter((u) => u.includes("/chart/AAA"))).toHaveLength(1);
    expect(urls.filter((u) => u.includes("/chart/BBB"))).toHaveLength(1);
  });

  it("handles an empty list without fetching", () => {
    const fetchMock = mockFetch();
    const { result } = renderHook(() => useCurrentPrices([]));
    expect(result.current).toEqual({
      prices: new Map(),
      loading: false,
      missing: [],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
