import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import type {
  PortfolioData,
  CurrencySymbol,
  ExchangeRates,
  Holding,
} from "../types";
import { loadPortfolio } from "../data/portfolioLoader";
import { getCurrentHoldings, getFormerHoldings } from "../data/holdingAggregator";
import { fetchExchangeRates } from "../api/exchangeRates";

interface PortfolioState {
  portfolio: PortfolioData;
  selectedAccount: string | undefined;
  setSelectedAccount: (name: string | undefined) => void;
  displayCurrency: CurrencySymbol;
  setDisplayCurrency: (c: CurrencySymbol) => void;
  rates: ExchangeRates;
  currentHoldings: Holding[];
  formerHoldings: Holding[];
  allCurrencies: CurrencySymbol[];
}

const PortfolioContext = createContext<PortfolioState | null>(null);

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
  const portfolio = useMemo(() => loadPortfolio(), []);
  const [selectedAccount, setSelectedAccount] = useState<string | undefined>(
    undefined
  );
  const [displayCurrency, setDisplayCurrency] = useState<CurrencySymbol>("$");
  const [rates, setRates] = useState<ExchangeRates>(DEFAULT_RATES);

  useEffect(() => {
    fetchExchangeRates().then(setRates).catch(() => {});
  }, []);

  const currentHoldings = useMemo(
    () => getCurrentHoldings(portfolio.accounts, selectedAccount),
    [portfolio.accounts, selectedAccount]
  );

  const formerHoldings = useMemo(
    () => getFormerHoldings(portfolio.accounts, selectedAccount),
    [portfolio.accounts, selectedAccount]
  );

  const allCurrencies = useMemo<CurrencySymbol[]>(
    () => ["€", "$", "RON"] as CurrencySymbol[],
    []
  );

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

export function usePortfolio(): PortfolioState {
  const ctx = useContext(PortfolioContext);
  if (!ctx) throw new Error("usePortfolio must be used within PortfolioProvider");
  return ctx;
}
