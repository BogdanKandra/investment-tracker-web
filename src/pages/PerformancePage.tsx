import { useMemo, useState, useEffect } from "react";
import { usePortfolio } from "../context/usePortfolio";
import AccountSelect from "../components/common/AccountSelect";
import CurrencySelect from "../components/common/CurrencySelect";
import { convertCurrency } from "../utils/currency";
import { fetchCurrentPrices } from "../api/marketData";
import { computeSellPnL } from "../data/taxCalculator";
import ReturnsSummary from "./performance/ReturnsSummary";
import YearlyCharts from "./performance/YearlyCharts";
import InvestmentGrowth from "./performance/InvestmentGrowth";
import TotalInvestmentGrowth from "./performance/TotalInvestmentGrowth";
import BenchmarkComparison from "./performance/BenchmarkComparison";
import HoldingPerformanceTable from "./performance/HoldingPerformanceTable";
import type { HoldingTotals } from "./performance/types";

/**
 * Performance page. Holds the data several sections share (live prices,
 * per-holding performance, realized sells); each section in ./performance
 * computes the rest itself.
 */
export default function PerformancePage() {
  const {
    portfolio,
    selectedAccount,
    currentHoldings,
    displayCurrency,
    rates,
  } = usePortfolio();
  const [prices, setPrices] = useState<Map<string, number>>(new Map());

  const symbols = useMemo(
    () => currentHoldings.map((h) => h.symbol),
    [currentHoldings]
  );

  useEffect(() => {
    if (symbols.length === 0) return;
    fetchCurrentPrices(symbols)
      .then(setPrices)
      .catch(() => {});
  }, [symbols]);

  const filteredAccounts = useMemo(
    () =>
      selectedAccount
        ? portfolio.accounts.filter((a) => a.account_name === selectedAccount)
        : portfolio.accounts,
    [portfolio.accounts, selectedAccount]
  );

  const holdingPerformance = useMemo(() => {
    const items = currentHoldings.map((h) => {
      const price = prices.get(h.symbol) ?? h.averageCost;
      const value = h.totalShares * price;
      const pnl = value - h.totalInvested;
      const pnlPct = h.totalInvested > 0 ? (pnl / h.totalInvested) * 100 : 0;
      return {
        symbol: h.symbol,
        name: h.name,
        invested: convertCurrency(
          h.totalInvested,
          h.currency,
          displayCurrency,
          rates
        ),
        value: convertCurrency(value, h.currency, displayCurrency, rates),
        pnl: convertCurrency(pnl, h.currency, displayCurrency, rates),
        pnlPct,
        weight: 0,
      };
    });
    const totalVal = items.reduce((s, i) => s + i.value, 0);
    for (const item of items) {
      item.weight = totalVal > 0 ? (item.value / totalVal) * 100 : 0;
    }
    return items;
  }, [currentHoldings, prices, displayCurrency, rates]);

  const sellPnLData = useMemo(
    () => computeSellPnL(filteredAccounts, rates),
    [filteredAccounts, rates]
  );

  const totalInvested = holdingPerformance.reduce((s, h) => s + h.invested, 0);
  const totalValue = holdingPerformance.reduce((s, h) => s + h.value, 0);
  const totalUnrealizedPnL = totalValue - totalInvested;
  const totalReturn =
    totalInvested > 0 ? (totalUnrealizedPnL / totalInvested) * 100 : 0;
  const totals: HoldingTotals = {
    totalInvested,
    totalValue,
    totalUnrealizedPnL,
    totalReturn,
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Performance</h1>
        <div className="flex items-center gap-3">
          <AccountSelect />
          <CurrencySelect />
        </div>
      </div>

      <ReturnsSummary
        holdingPerformance={holdingPerformance}
        totals={totals}
        sellPnLData={sellPnLData}
      />
      <YearlyCharts
        filteredAccounts={filteredAccounts}
        sellPnLData={sellPnLData}
      />
      <InvestmentGrowth
        filteredAccounts={filteredAccounts}
        holdingPerformance={holdingPerformance}
        totals={totals}
      />
      <TotalInvestmentGrowth
        filteredAccounts={filteredAccounts}
        sellPnLData={sellPnLData}
      />
      <BenchmarkComparison filteredAccounts={filteredAccounts} />
      <HoldingPerformanceTable
        holdingPerformance={holdingPerformance}
        totals={totals}
      />
    </div>
  );
}
