import { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { usePortfolio } from "../context/PortfolioContext";
import StatsCard from "../components/common/StatsCard";
import CurrencySelect from "../components/common/CurrencySelect";
import AllocationChart from "../components/charts/AllocationChart";
import { fetchCurrentPrices } from "../api/marketData";
import { formatCurrency, convertCurrency } from "../utils/currency";
import { formatPercent } from "../utils/numbers";
import { formatDateStr, parseDate, toIsoDate } from "../utils/dates";
import { computeSellPnL } from "../data/taxCalculator";
import { getCurrentHoldings as getPerAccountHoldings } from "../data/holdingAggregator";
import type { Transaction, CurrencySymbol } from "../types";

function getAssetClass(holding: {
  symbol: string;
  name: string;
  transactions: Transaction[];
}): string {
  const { symbol, name } = holding;

  if (/^[A-Z]+-[A-Z]{3}$/.test(symbol)) return "Crypto";

  const upper = (name + " " + symbol).toUpperCase();
  if (upper.includes("ETF")) return "ETF";

  const country = holding.transactions.find((t) => t.country)?.country;
  if (country && country !== "USA") return "International Stocks";

  if (symbol.includes(".")) return "International Stocks";

  return "US Stocks";
}

const TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: "#1f2937",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "8px",
    color: "#f1f5f9",
  },
};

export default function DashboardPage() {
  const { portfolio, currentHoldings, displayCurrency, rates } = usePortfolio();

  const [prices, setPrices] = useState<Map<string, number>>(new Map());

  const symbols = useMemo(
    () => currentHoldings.map((h) => h.symbol),
    [currentHoldings],
  );

  useEffect(() => {
    if (symbols.length === 0) return;
    fetchCurrentPrices(symbols).then(setPrices).catch(() => {});
  }, [symbols]);

  /* ── Core portfolio metrics ── */

  const totalCash = useMemo(() => {
    let total = 0;
    for (const acct of portfolio.accounts) {
      total += convertCurrency(acct.cash, acct.currency, displayCurrency, rates);
    }
    return total;
  }, [portfolio.accounts, displayCurrency, rates]);

  const totalInvested = useMemo(() => {
    let total = 0;
    for (const h of currentHoldings) {
      total += convertCurrency(h.totalInvested, h.currency, displayCurrency, rates);
    }
    return total;
  }, [currentHoldings, displayCurrency, rates]);

  const holdingsWithPnL = useMemo(() => {
    return currentHoldings.map((h) => {
      const price = prices.get(h.symbol) ?? h.averageCost;
      const value = h.totalShares * price;
      const pnl = value - h.totalInvested;
      const pnlPct = h.totalInvested > 0 ? (pnl / h.totalInvested) * 100 : 0;
      return { ...h, currentPrice: price, value, pnl, pnlPct };
    });
  }, [currentHoldings, prices]);

  const totalValue = useMemo(() => {
    let total = 0;
    for (const h of holdingsWithPnL) {
      total += convertCurrency(h.value, h.currency, displayCurrency, rates);
    }
    return total + totalCash;
  }, [holdingsWithPnL, totalCash, displayCurrency, rates]);

  const totalPnL = totalValue - totalInvested - totalCash;
  const totalPnLPct = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;

  /* ── Realized P&L from sells ── */

  const realizedPnL = useMemo(() => {
    const sells = computeSellPnL(portfolio.accounts, rates);
    let total = 0;
    for (const s of sells) {
      total += convertCurrency(s.grossProfit, s.currency, displayCurrency, rates);
    }
    return total;
  }, [portfolio.accounts, rates, displayCurrency]);

  /* ── Dividend summary ── */

  const dividendStats = useMemo(() => {
    let totalNet = 0;
    let count = 0;
    const dates: number[] = [];
    for (const acct of portfolio.accounts) {
      for (const tx of acct.transactions) {
        if (tx.type !== "Dividend") continue;
        const net = tx.shares * tx.price - tx.fee;
        totalNet += convertCurrency(net, tx.currency, displayCurrency, rates);
        dates.push(parseDate(tx.date).getTime());
        count += 1;
      }
    }
    let projectedAnnual = 0;
    if (count > 0) {
      const earliest = Math.min(...dates);
      const latest = Math.max(...dates);
      const spanYears = (latest - earliest) / (365.25 * 24 * 60 * 60 * 1000);
      projectedAnnual = spanYears < 0.1 ? totalNet * 4 : totalNet / spanYears;
    }
    return { totalNet, projectedAnnual, count };
  }, [portfolio.accounts, displayCurrency, rates]);

  /* ── Top movers ── */

  const topGainers = useMemo(
    () => [...holdingsWithPnL].sort((a, b) => b.pnlPct - a.pnlPct).slice(0, 5),
    [holdingsWithPnL],
  );

  const topLosers = useMemo(
    () => [...holdingsWithPnL].sort((a, b) => a.pnlPct - b.pnlPct).slice(0, 5),
    [holdingsWithPnL],
  );

  /* ── Recent transactions ── */

  const recentTransactions = useMemo(() => {
    const all: (Transaction & { account: string })[] = [];
    for (const acct of portfolio.accounts) {
      for (const tx of acct.transactions) {
        all.push({ ...tx, account: acct.account_name });
      }
    }
    return all
      .sort((a, b) => parseDate(b.date).getTime() - parseDate(a.date).getTime())
      .slice(0, 10);
  }, [portfolio.accounts]);

  /* ── Asset allocation ── */

  const actualAllocation = useMemo(() => {
    const map = new Map<string, number>();
    for (const h of holdingsWithPnL) {
      const cls = getAssetClass(h);
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
      ([name, value]) => ({ name, value }),
    );
  }, [portfolio.target_asset_class_distribution]);

  /* ── Account breakdown ── */

  const accountBreakdown = useMemo(() => {
    const rows = portfolio.accounts.map((acct) => {
      const acctHoldings = getPerAccountHoldings([acct]);
      let marketValue = 0;
      for (const h of acctHoldings) {
        const price = prices.get(h.symbol) ?? h.averageCost;
        marketValue += convertCurrency(
          h.totalShares * price,
          h.currency,
          displayCurrency,
          rates,
        );
      }
      const cash = convertCurrency(acct.cash, acct.currency, displayCurrency, rates);
      return { name: acct.account_name, marketValue, cash, total: marketValue + cash };
    });
    rows.sort((a, b) => b.total - a.total);
    const grandTotal = rows.reduce((s, r) => s + r.total, 0);
    return rows.map((r) => ({
      ...r,
      weight: grandTotal > 0 ? (r.total / grandTotal) * 100 : 0,
    }));
  }, [portfolio.accounts, prices, displayCurrency, rates]);

  /* ── Cumulative investment timeline ── */

  const portfolioTimeline = useMemo(() => {
    const events: { date: Date; invested: number; currency: string }[] = [];
    for (const acct of portfolio.accounts) {
      for (const tx of acct.transactions) {
        if (tx.type === "Buy") {
          events.push({ date: parseDate(tx.date), invested: tx.shares * tx.price, currency: tx.currency });
        } else if (tx.type === "Sell") {
          events.push({ date: parseDate(tx.date), invested: -(tx.shares * tx.price), currency: tx.currency });
        }
      }
    }
    events.sort((a, b) => a.date.getTime() - b.date.getTime());
    let cumulative = 0;
    return events.map((ev) => {
      cumulative += convertCurrency(ev.invested, ev.currency as CurrencySymbol, displayCurrency, rates);
      return { date: toIsoDate(ev.date), invested: +cumulative.toFixed(2) };
    });
  }, [portfolio.accounts, displayCurrency, rates]);

  /* ── Monthly dividend income ── */

  const monthlyDividends = useMemo(() => {
    const map = new Map<string, number>();
    for (const acct of portfolio.accounts) {
      for (const tx of acct.transactions) {
        if (tx.type !== "Dividend") continue;
        const date = parseDate(tx.date);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        const net = convertCurrency(tx.shares * tx.price - tx.fee, tx.currency, displayCurrency, rates);
        map.set(key, (map.get(key) ?? 0) + net);
      }
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, amount]) => ({ month, amount: +amount.toFixed(2) }));
  }, [portfolio.accounts, displayCurrency, rates]);

  /* ── Render ── */

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <CurrencySelect />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
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
          label="Realized P&L"
          value={formatCurrency(realizedPnL, displayCurrency)}
          trend={realizedPnL >= 0 ? "up" : "down"}
        />
        <StatsCard
          label="Net Dividends"
          value={formatCurrency(dividendStats.totalNet, displayCurrency)}
          subValue={`~${formatCurrency(dividendStats.projectedAnnual, displayCurrency)}/yr`}
          trend="up"
        />
        <StatsCard
          label="Cash"
          value={formatCurrency(totalCash, displayCurrency)}
        />
      </div>

      {/* Allocation + Account Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-card rounded-xl p-5 border border-white/5">
          <h2 className="text-lg font-semibold text-white mb-4">
            Asset Allocation
          </h2>
          <AllocationChart actual={actualAllocation} target={targetAllocation} />
        </div>

        <div className="bg-card rounded-xl p-5 border border-white/5">
          <h2 className="text-sm font-medium text-muted mb-3 uppercase tracking-wide">
            Account Breakdown
          </h2>
          <div className="overflow-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="py-2 px-3 text-xs text-muted uppercase tracking-wide">
                    Account
                  </th>
                  <th className="py-2 px-3 text-xs text-muted uppercase tracking-wide text-right">
                    Holdings
                  </th>
                  <th className="py-2 px-3 text-xs text-muted uppercase tracking-wide text-right">
                    Cash
                  </th>
                  <th className="py-2 px-3 text-xs text-muted uppercase tracking-wide text-right">
                    Total
                  </th>
                  <th className="py-2 px-3 text-xs text-muted uppercase tracking-wide text-right">
                    Weight
                  </th>
                </tr>
              </thead>
              <tbody>
                {accountBreakdown.map((a) => (
                  <tr key={a.name} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-2.5 px-3 text-sm font-medium text-white">
                      {a.name}
                    </td>
                    <td className="py-2.5 px-3 text-sm text-right">
                      {formatCurrency(a.marketValue, displayCurrency)}
                    </td>
                    <td className="py-2.5 px-3 text-sm text-right text-muted">
                      {formatCurrency(a.cash, displayCurrency)}
                    </td>
                    <td className="py-2.5 px-3 text-sm text-right font-medium text-white">
                      {formatCurrency(a.total, displayCurrency)}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full"
                            style={{ width: `${Math.min(a.weight, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted w-10 text-right">
                          {a.weight.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Investment Timeline + Monthly Dividends */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-card rounded-xl p-5 border border-white/5">
          <h2 className="text-sm font-medium text-muted mb-4 uppercase tracking-wide">
            Cumulative Investment
          </h2>
          {portfolioTimeline.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={portfolioTimeline}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "#9ca3af", fontSize: 11 }}
                  stroke="rgba(255,255,255,0.1)"
                />
                <YAxis
                  tick={{ fill: "#9ca3af", fontSize: 11 }}
                  stroke="rgba(255,255,255,0.1)"
                />
                <Tooltip {...TOOLTIP_STYLE} />
                <Line
                  type="monotone"
                  dataKey="invested"
                  name="Invested"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-muted text-sm text-center py-10">
              No data available
            </div>
          )}
        </div>

        <div className="bg-card rounded-xl p-5 border border-white/5">
          <h2 className="text-sm font-medium text-muted mb-4 uppercase tracking-wide">
            Monthly Dividend Income
          </h2>
          {monthlyDividends.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyDividends}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="month"
                  tick={{ fill: "#9ca3af", fontSize: 11 }}
                  stroke="rgba(255,255,255,0.1)"
                />
                <YAxis
                  tick={{ fill: "#9ca3af", fontSize: 11 }}
                  stroke="rgba(255,255,255,0.1)"
                />
                <Tooltip {...TOOLTIP_STYLE} />
                <Bar
                  dataKey="amount"
                  name="Net Dividends"
                  fill="#10b981"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-muted text-sm text-center py-10">
              No dividends received yet
            </div>
          )}
        </div>
      </div>

      {/* Top Movers & Recent Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-card rounded-xl p-5 border border-white/5">
          <h2 className="text-sm font-medium text-muted mb-3 uppercase tracking-wide">
            Top Gainers
          </h2>
          <div className="space-y-2">
            {topGainers.map((h) => (
              <div key={h.symbol} className="flex items-center justify-between">
                <span className="text-white text-sm font-medium">{h.symbol}</span>
                <div className="text-right">
                  <span className="text-gain text-sm font-medium">
                    {formatPercent(h.pnlPct)}
                  </span>
                  <div className="text-xs text-muted">
                    {formatCurrency(
                      convertCurrency(h.pnl, h.currency, displayCurrency, rates),
                      displayCurrency,
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card rounded-xl p-5 border border-white/5">
          <h2 className="text-sm font-medium text-muted mb-3 uppercase tracking-wide">
            Top Losers
          </h2>
          <div className="space-y-2">
            {topLosers.map((h) => (
              <div key={h.symbol} className="flex items-center justify-between">
                <span className="text-white text-sm font-medium">{h.symbol}</span>
                <div className="text-right">
                  <span className="text-loss text-sm font-medium">
                    {formatPercent(h.pnlPct)}
                  </span>
                  <div className="text-xs text-muted">
                    {formatCurrency(
                      convertCurrency(h.pnl, h.currency, displayCurrency, rates),
                      displayCurrency,
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

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
