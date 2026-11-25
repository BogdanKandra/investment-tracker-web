import type { CurrencySymbol, ExchangeRates } from "../types";

const CURRENCY_LABELS: Record<CurrencySymbol, string> = {
  $: "USD",
  "€": "EUR",
  RON: "RON",
  DKK: "DKK",
};

export function currencyLabel(c: CurrencySymbol): string {
  return CURRENCY_LABELS[c] ?? c;
}

export function formatCurrency(
  value: number,
  currency: CurrencySymbol
): string {
  const code = currencyLabel(currency);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: code,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function convertCurrency(
  amount: number,
  from: CurrencySymbol,
  to: CurrencySymbol,
  rates: ExchangeRates
): number {
  if (from === to) return amount;
  const perUsdFrom = rates[from];
  const perUsdTo = rates[to];
  // Unknown rate: leave the amount unconverted rather than produce NaN.
  if (!perUsdFrom || !perUsdTo) return amount;
  return (amount / perUsdFrom) * perUsdTo;
}
