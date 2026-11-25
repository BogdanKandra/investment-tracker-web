import { CURRENCY_SYMBOLS, type ExchangeRates } from "../types";
import { currencyLabel } from "../utils/currency";

/**
 * Built-in rates (units per 1 USD, roughly mid-2024), used until live rates
 * load and whenever the rates API is unreachable. The UI flags when these
 * are in use, since they go stale.
 */
export const FALLBACK_RATES: ExchangeRates = {
  $: 1,
  "€": 0.92,
  RON: 4.57,
  DKK: 6.87,
};

export interface RatesResult {
  rates: ExchangeRates;
  source: "live" | "fallback";
  /** Date the rates apply to (YYYY-MM-DD), when known. */
  asOf: string | null;
}

const RATES_URL = "https://api.exchangerate-api.com/v4/latest/USD";

/**
 * Fetches current rates for every supported currency. Never throws: on any
 * failure, or if a currency is missing from the response, it returns the
 * fallback rates with source "fallback".
 */
export async function fetchExchangeRates(): Promise<RatesResult> {
  const fallback: RatesResult = {
    rates: FALLBACK_RATES,
    source: "fallback",
    asOf: null,
  };
  try {
    const res = await fetch(RATES_URL);
    if (!res.ok) return fallback;
    const data: { date?: unknown; rates?: Record<string, unknown> } =
      await res.json();

    const rates = {} as ExchangeRates;
    for (const c of CURRENCY_SYMBOLS) {
      const v = data.rates?.[currencyLabel(c)];
      if (typeof v !== "number" || !(v > 0)) return fallback;
      rates[c] = v;
    }
    return {
      rates,
      source: "live",
      asOf: typeof data.date === "string" ? data.date : null,
    };
  } catch {
    return fallback;
  }
}
