import { useEffect, useMemo, useState } from "react";
import { usePortfolio } from "../context/PortfolioContext";
import StatsCard from "../components/common/StatsCard";
import CurrencySelect from "../components/common/CurrencySelect";
import AllocationChart from "../components/charts/AllocationChart";
import { fetchCurrentPrices } from "../api/marketData";
import { formatCurrency, convertCurrency } from "../utils/currency";
import { formatPercent } from "../utils/numbers";
import { formatDateStr, parseDate } from "../utils/dates";
import type { Transaction } from "../types";

const ASSET_CLASS_MAP: Record<string, string> = {
  POWL: "US Stocks", AMD: "US Stocks", GOOG: "US Stocks", ISRG: "US Stocks",
  AVGO: "US Stocks", NNE: "US Stocks", OSCR: "US Stocks", META: "US Stocks",
  IONQ: "US Stocks", PLTR: "US Stocks", RKLB: "US Stocks", HOOD: "US Stocks",
  RDDT: "US Stocks", APP: "US Stocks", OKLO: "US Stocks", SMR: "US Stocks",
  CCEP: "International Stocks", "MC.PA": "International Stocks",
  "CDI.PA": "International Stocks", "AIR.PA": "International Stocks",
  "ASML.AS": "International Stocks", "PARRO.PA": "International Stocks",
  "TLV.RO": "International Stocks", "SNP.RO": "International Stocks",
  "SNG.RO": "International Stocks", "H2O.RO": "International Stocks",
  "FP.RO": "International Stocks", "BRD.RO": "International Stocks",
  "TRP.RO": "International Stocks", "DIGI.RO": "International Stocks",
  "TVBETETF.RO": "ETF", "BTC-EUR": "Crypto",
};

function getAssetClass(symbol: string): string {
  return ASSET_CLASS_MAP[symbol] ?? "US Stocks";
}

export default function DashboardPage() {
  const {
    portfolio,
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
    fetchCurrentPrices(symbols).then(setPrices).catch(() => {});
  }, [symbols]);

  const totalValue = useMemo(() => {
    let total = 0;
    for (const h of currentHoldings) {
      const price = prices.get(h.symbol) ?? h.averageCost;
      const value = h.totalShares * price;
      total += convertCurrency(value, h.currency, displayCurrency, rates);
    }
    for (const acct of portfolio.accounts) {
      total += convertCurrency(acct.cash, acct.currency, displayCurrency, rates);
    }
    return total;
  }, [currentHoldings, prices, displayCurrency, rates, portfolio.accounts]);

  const totalInvested = useMemo(() => {
    let total = 0;
    for (const h of currentHoldings) {
      total += convertCurrency(
        h.totalInvested,
        h.currency,
        displayCurrency,
        rates
      );
    }
    return total;
  }, [currentHoldings, displayCurrency, rates]);

  const totalPnL = totalValue - totalInvested;
  const totalPnLPct = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;

  const totalCash = useMemo(() => {
    let total = 0;
    for (const acct of portfolio.accounts) {
      total += convertCurrency(acct.cash, acct.currency, displayCurrency, rates);
    }
    return total;
  }, [portfolio.accounts, displayCurrency, rates]);

  const holdingsWithPnL = useMemo(() => {
    return currentHoldings.map((h) => {
      const price = prices.get(h.symbol) ?? h.averageCost;
      const value = h.totalShares * price;
      const pnl = value - h.totalInvested;
      const pnlPct = h.totalInvested > 0 ? (pnl / h.totalInvested) * 100 : 0;
      return { ...h, currentPrice: price, value, pnl, pnlPct };
    });
  }, [currentHoldings, prices]);

  const topGainers = useMemo(
    () =>
      [...holdingsWithPnL]
        .sort((a, b) => b.pnlPct - a.pnlPct)
        .slice(0, 5),
    [holdingsWithPnL]
  );

  const topLosers = useMemo(
    () =>
      [...holdingsWithPnL]
        .sort((a, b) => a.pnlPct - b.pnlPct)
        .slice(0, 5),
    [holdingsWithPnL]
  );

  const recentTransactions = useMemo(() => {
    const all: (Transaction & { account: string })[] = [];
    for (const acct of portfolio.accounts) {
      for (const tx of acct.transactions) {
        all.push({ ...tx, account: acct.account_name });
      }
    }
    return all
      .sort(
        (a, b) =>
          parseDate(b.date).getTime() - parseDate(a.date).getTime()
      )
      .slice(0, 10);
  }, [portfolio.accounts]);

  const actualAllocation = useMemo(() => {
    const map = new Map<string, number>();
    for (const h of holdingsWithPnL) {
      const cls = getAssetClass(h.symbol);
      const val = convertCurrency(h.value, h.currency, displayCurrency, rates);
      map.set(cls, (map.get(cls) ?? 0) + val);
    }
    map.set("Cash", totalCash);

    const total = Array.from(map.values()).reduce((a, b) => a + b, 0);
    return Array.from(map.entries()).map(([name, value]) => ({
      name,
      value: total > 0 ? (value / total) * 100 : 0,
    }));
  }, [holdingsWithPnL, totalCash, displayCurrency, rates]);

  const targetAllocation = useMemo(() => {
    return Object.entries(portfolio.target_asset_class_distribution).map(
      ([name, value]) => ({ name, value })
    );
  }, [portfolio.target_asset_class_distribution]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <CurrencySelect />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatsCard
          label="Total Value"
          value={formatCurrency(totalValue, displayCurrency)}
        />
        <StatsCard
          label="Total Invested"
          value={formatCurrency(totalInvested, displayCurrency)}
        />
        <StatsCard
          label="Unrealized P&L"
          value={formatCurrency(totalPnL, displayCurrency)}
          subValue={formatPercent(totalPnLPct)}
          trend={totalPnL >= 0 ? "up" : "down"}
        />
        <StatsCard
          label="Cash"
          value={formatCurrency(totalCash, displayCurrency)}
        />
      </div>

      {/* Allocation */}
      <div className="bg-card rounded-xl p-5 border border-white/5 mb-8">
        <h2 className="text-lg font-semibold text-white mb-4">
          Asset Allocation
        </h2>
        <AllocationChart actual={actualAllocation} target={targetAllocation} />
      </div>

      {/* Top Movers & Recent Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Gainers */}
        <div className="bg-card rounded-xl p-5 border border-white/5">
          <h2 className="text-sm font-medium text-muted mb-3 uppercase tracking-wide">
            Top Gainers
          </h2>
          <div className="space-y-2">
            {topGainers.map((h) => (
              <div
                key={h.symbol}
                className="flex items-center justify-between"
              >
                <div>
                  <span className="text-white text-sm font-medium">
                    {h.symbol}
                  </span>
                </div>
                <span className="text-gain text-sm font-medium">
                  {formatPercent(h.pnlPct)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Losers */}
        <div className="bg-card rounded-xl p-5 border border-white/5">
          <h2 className="text-sm font-medium text-muted mb-3 uppercase tracking-wide">
            Top Losers
          </h2>
          <div className="space-y-2">
            {topLosers.map((h) => (
              <div
                key={h.symbol}
                className="flex items-center justify-between"
              >
                <div>
                  <span className="text-white text-sm font-medium">
                    {h.symbol}
                  </span>
                </div>
                <span className="text-loss text-sm font-medium">
                  {formatPercent(h.pnlPct)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="bg-card rounded-xl p-5 border border-white/5">
          <h2 className="text-sm font-medium text-muted mb-3 uppercase tracking-wide">
            Recent Transactions
          </h2>
          <div className="space-y-2">
            {recentTransactions.map((tx, i) => {
              const color =
                tx.type === "Buy"
                  ? "text-gain"
                  : tx.type === "Sell"
                    ? "text-loss"
                    : "text-blue-400";
              return (
                <div
                  key={`${tx.date}-${tx.symbol}-${i}`}
                  className="flex items-center justify-between text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className={`font-medium ${color}`}>{tx.type}</span>
                    <span className="text-white">{tx.symbol}</span>
                  </div>
                  <span className="text-muted text-xs">
                    {formatDateStr(tx.date)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
