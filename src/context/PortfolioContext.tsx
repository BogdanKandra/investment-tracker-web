import { useState, useEffect, useMemo, type ReactNode } from "react";
import type {
  PortfolioData,
  CurrencySymbol,
  ExchangeRates,
  RatesStatus,
} from "../types";
import { loadPortfolio } from "../data/portfolioLoader";
import {
  getCurrentHoldings,
  getFormerHoldings,
} from "../data/holdingAggregator";
import { fetchExchangeRates, FALLBACK_RATES } from "../api/exchangeRates";
import { PortfolioContext, type PortfolioState } from "./usePortfolio";

/** Currencies offered in the display-currency selector. */
const DISPLAY_CURRENCIES: CurrencySymbol[] = ["€", "$", "RON", "DKK"];

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<string | undefined>(
    undefined
  );
  const [displayCurrency, setDisplayCurrency] = useState<CurrencySymbol>("$");
  const [rates, setRates] = useState<ExchangeRates>(FALLBACK_RATES);
  const [ratesStatus, setRatesStatus] = useState<RatesStatus>({
    source: "loading",
    asOf: null,
  });
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
    // fetchExchangeRates never rejects; it reports fallback use instead.
    fetchExchangeRates().then((r) => {
      setRates(r.rates);
      setRatesStatus({ source: r.source, asOf: r.asOf });
    });
  }, []);

  const filteredAccounts = useMemo(
    () =>
      !portfolio
        ? []
        : selectedAccount
          ? portfolio.accounts.filter((a) => a.account_name === selectedAccount)
          : portfolio.accounts,
    [portfolio, selectedAccount]
  );

  const currentHoldings = useMemo(
    () =>
      portfolio ? getCurrentHoldings(portfolio.accounts, selectedAccount) : [],
    [portfolio, selectedAccount]
  );

  const formerHoldings = useMemo(
    () =>
      portfolio ? getFormerHoldings(portfolio.accounts, selectedAccount) : [],
    [portfolio, selectedAccount]
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
    filteredAccounts,
    displayCurrency,
    setDisplayCurrency,
    rates,
    ratesStatus,
    currentHoldings,
    formerHoldings,
    allCurrencies: DISPLAY_CURRENCIES,
  };

  return (
    <PortfolioContext.Provider value={value}>
      {children}
    </PortfolioContext.Provider>
  );
}
