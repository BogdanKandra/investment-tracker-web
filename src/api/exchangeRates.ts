import type { ExchangeRates } from "../types";

const FALLBACK: ExchangeRates = {
  USD_EUR: 0.92,
  USD_RON: 4.57,
  USD_DKK: 6.87,
  EUR_RON: 4.97,
  EUR_USD: 1.09,
  EUR_DKK: 7.46,
  RON_USD: 0.22,
  RON_EUR: 0.20,
  RON_DKK: 1.50,
  DKK_USD: 0.146,
  DKK_EUR: 0.134,
  DKK_RON: 0.67,
};

export async function fetchExchangeRates(): Promise<ExchangeRates> {
  try {
    const res = await fetch(
      "https://api.exchangerate-api.com/v4/latest/USD"
    );
    if (!res.ok) return FALLBACK;
    const data = await res.json();
    const eur = data.rates?.EUR ?? FALLBACK.USD_EUR;
    const ron = data.rates?.RON ?? FALLBACK.USD_RON;
    const dkk = data.rates?.DKK ?? FALLBACK.USD_DKK;
    return {
      USD_EUR: eur,
      USD_RON: ron,
      USD_DKK: dkk,
      EUR_RON: ron / eur,
      EUR_USD: 1 / eur,
      EUR_DKK: dkk / eur,
      RON_USD: 1 / ron,
      RON_EUR: eur / ron,
      RON_DKK: dkk / ron,
      DKK_USD: 1 / dkk,
      DKK_EUR: eur / dkk,
      DKK_RON: ron / dkk,
    };
  } catch {
    return FALLBACK;
  }
}
