import { useState, useEffect, useMemo, type ReactNode } from "react";
import type { PortfolioData, CurrencySymbol, ExchangeRates } from "../types";
import { loadPortfolio } from "../data/portfolioLoader";
import { getCurrentHoldings, getFormerHoldings } from "../data/holdingAggregator";
import { fetchExchangeRates } from "../api/exchangeRates";
import { PortfolioContext, type PortfolioState } from "./usePortfolio";

const DEFAULT_RATES: ExchangeRates = {
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

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<string | undefined>(
    undefined
  );
  const [displayCurrency, setDisplayCurrency] = useState<CurrencySymbol>("$");
  const [rates, setRates] = useState<ExchangeRates>(DEFAULT_RATES);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    loadPortfolio()
      .then(setPortfolio)
      .catch((err: unknown) => {
        console.error(err);
        setLoadError(err instanceof Error ? err.message : String(err));
      });
  }, []);

  useEffect(() => {
    fetchExchangeRates().then(setRates).catch(() => {});
  }, []);

  const currentHoldings = useMemo(
    () => portfolio ? getCurrentHoldings(portfolio.accounts, selectedAccount) : [],
    [portfolio, selectedAccount]
  );

  const formerHoldings = useMemo(
    () => portfolio ? getFormerHoldings(portfolio.accounts, selectedAccount) : [],
    [portfolio, selectedAccount]
  );

  const allCurrencies = useMemo<CurrencySymbol[]>(
    () => ["€", "$", "RON"] as CurrencySymbol[],
    []
  );

  if (loadError) {
    return (
      <div className="p-6 text-sm text-red-400">
        <h1 className="text-lg font-semibold mb-2">Could not load portfolio</h1>
        <pre className="whitespace-pre-wrap">{loadError}</pre>
      </div>
    );
  }

  if (!portfolio) {
    return <div>Loading portfolio...</div>;
  }

  const value: PortfolioState = {
    portfolio,
    selectedAccount,
    setSelectedAccount,
    displayCurrency,
    setDisplayCurrency,
    rates,
    currentHoldings,
    formerHoldings,
    allCurrencies,
  };

  return (
    <PortfolioContext.Provider value={value}>
      {children}
    </PortfolioContext.Provider>
  );
}
