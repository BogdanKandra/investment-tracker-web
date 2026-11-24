import { createContext, useContext } from "react";
import type {
  PortfolioData,
  CurrencySymbol,
  ExchangeRates,
  Holding,
} from "../types";

// Kept apart from PortfolioContext.tsx so that file exports only a component,
// which React Fast Refresh needs to hot-reload it without a full page reload.

export interface PortfolioState {
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

export const PortfolioContext = createContext<PortfolioState | null>(null);

export function usePortfolio(): PortfolioState {
  const ctx = useContext(PortfolioContext);
  if (!ctx)
    throw new Error("usePortfolio must be used within PortfolioProvider");
  return ctx;
}
