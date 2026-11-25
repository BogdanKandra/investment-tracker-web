import { useMemo, useState, type ReactElement, type ReactNode } from "react";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PortfolioContext, type PortfolioState } from "../context/usePortfolio";
import {
  getCurrentHoldings,
  getFormerHoldings,
} from "../data/holdingAggregator";
import type {
  CurrencySymbol,
  ExchangeRates,
  PortfolioData,
  RatesStatus,
} from "../types";
import { makeRates } from "./fixtures";
import { samplePortfolio } from "./samplePortfolio";

export interface RenderOptions {
  portfolio?: PortfolioData;
  rates?: ExchangeRates;
  ratesStatus?: RatesStatus;
  displayCurrency?: CurrencySymbol;
  selectedAccount?: string;
  route?: string;
}

/**
 * Provides the same context PortfolioProvider does, but synchronously from a
 * given portfolio (no file loading or rate fetching). Account and currency
 * selection are real state, so selector interactions work.
 */
function TestPortfolioProvider({
  children,
  portfolio,
  rates,
  ratesStatus,
  initialCurrency,
  initialAccount,
}: {
  children: ReactNode;
  portfolio: PortfolioData;
  rates: ExchangeRates;
  ratesStatus: RatesStatus;
  initialCurrency: CurrencySymbol;
  initialAccount: string | undefined;
}) {
  const [selectedAccount, setSelectedAccount] = useState(initialAccount);
  const [displayCurrency, setDisplayCurrency] = useState(initialCurrency);

  const value = useMemo<PortfolioState>(
    () => ({
      portfolio,
      selectedAccount,
      setSelectedAccount,
      filteredAccounts: selectedAccount
        ? portfolio.accounts.filter((a) => a.account_name === selectedAccount)
        : portfolio.accounts,
      displayCurrency,
      setDisplayCurrency,
      rates,
      ratesStatus,
      currentHoldings: getCurrentHoldings(portfolio.accounts, selectedAccount),
      formerHoldings: getFormerHoldings(portfolio.accounts, selectedAccount),
      allCurrencies: ["€", "$", "RON", "DKK"],
    }),
    [portfolio, selectedAccount, displayCurrency, rates, ratesStatus]
  );

  return (
    <PortfolioContext.Provider value={value}>
      {children}
    </PortfolioContext.Provider>
  );
}

/** Renders `ui` inside a router and a portfolio context (sample data by default). */
export function renderWithPortfolio(
  ui: ReactElement,
  {
    portfolio = samplePortfolio,
    rates = makeRates(),
    ratesStatus = { source: "live", asOf: "2026-11-24" },
    displayCurrency = "$",
    selectedAccount,
    route = "/",
  }: RenderOptions = {}
) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <TestPortfolioProvider
        portfolio={portfolio}
        rates={rates}
        ratesStatus={ratesStatus}
        initialCurrency={displayCurrency}
        initialAccount={selectedAccount}
      >
        {ui}
      </TestPortfolioProvider>
    </MemoryRouter>
  );
}
