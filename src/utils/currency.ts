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

  const key = `${currencyLabel(from)}_${currencyLabel(to)}` as keyof ExchangeRates;
  const rate = rates[key];
  if (rate) return amount * rate;

  const reverseKey = `${currencyLabel(to)}_${currencyLabel(from)}` as keyof ExchangeRates;
  const reverseRate = rates[reverseKey];
  if (reverseRate) return amount / reverseRate;

  return amount;
}
