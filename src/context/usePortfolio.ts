import { createContext, useContext } from "react";
import type {
  Account,
  PortfolioData,
  CurrencySymbol,
  ExchangeRates,
  Holding,
  RatesStatus,
} from "../types";

// Kept apart from PortfolioContext.tsx so that file exports only a component,
// which React Fast Refresh needs to hot-reload it without a full page reload.

export interface PortfolioState {
  portfolio: PortfolioData;
  selectedAccount: string | undefined;
  setSelectedAccount: (name: string | undefined) => void;
  /** The selected account, or all accounts when none is selected. */
  filteredAccounts: Account[];
  displayCurrency: CurrencySymbol;
  setDisplayCurrency: (c: CurrencySymbol) => void;
  rates: ExchangeRates;
  ratesStatus: RatesStatus;
  currentHoldings: Holding[];
  formerHoldings: Holding[];
  allCurrencies: CurrencySymbol[];
}

export const PortfolioContext = createContext<PortfolioState | null>(null);

export function usePortfolio(): PortfolioState {
  const ctx = useContext(PortfolioContext);
  if (!ctx)
    throw new Error("usePortfolio must be used within PortfolioProvider");
  return ctx;
}
