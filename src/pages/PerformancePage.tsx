import { useMemo, useState, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
  Legend,
  LineChart,
  Line,
  ReferenceLine,
} from "recharts";
import { usePortfolio } from "../context/PortfolioContext";
import StatsCard from "../components/common/StatsCard";
import AccountSelect from "../components/common/AccountSelect";
import CurrencySelect from "../components/common/CurrencySelect";
import { formatCurrency, convertCurrency } from "../utils/currency";
import { formatPercent } from "../utils/numbers";
import { parseDate, toIsoDate } from "../utils/dates";
import { fetchCurrentPrices } from "../api/marketData";
import { computeSellPnL } from "../data/taxCalculator";
import type { CurrencySymbol } from "../types";

type SortField = "symbol" | "invested" | "value" | "pnl" | "pnlPct";
type SortDir = "asc" | "desc";

interface HoldingPerf {
  symbol: string;
  name: string;
  invested: number;
  value: number;
  pnl: number;
  pnlPct: number;
  weight: number;
}

interface YearlyReturn {
  year: string;
  invested: number;
  sold: number;
  dividends: number;
  realizedPnl: number;
}

export default function PerformancePage() {
  const { portfolio, selectedAccount, currentHoldings, displayCurrency, rates } =
    usePortfolio();
  const [prices, setPrices] = useState<Map<string, number>>(new Map());
  const [sortField, setSortField] = useState<SortField>("pnlPct");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const symbols = useMemo(
    () => currentHoldings.map((h) => h.symbol),
    [currentHoldings]
  );

  useEffect(() => {
    if (symbols.length === 0) return;
    fetchCurrentPrices(symbols).then(setPrices).catch(() => {});
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
        invested: convertCurrency(h.totalInvested, h.currency, displayCurrency, rates),
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

  const sortedHoldings = useMemo(() => {
    const list = [...holdingPerformance];
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "symbol":
          cmp = a.symbol.localeCompare(b.symbol);
          break;
        case "invested":
          cmp = a.invested - b.invested;
          break;
        case "value":
          cmp = a.value - b.value;
          break;
        case "pnl":
          cmp = a.pnl - b.pnl;
          break;
        case "pnlPct":
          cmp = a.pnlPct - b.pnlPct;
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [holdingPerformance, sortField, sortDir]);

  const realizedPnL = useMemo(() => {
    const sells = computeSellPnL(filteredAccounts, rates);
    let totalGross = 0;
    let totalNet = 0;
    let winCount = 0;
    let lossCount = 0;
    for (const s of sells) {
      const gross = convertCurrency(s.grossProfit, s.currency, displayCurrency, rates);
      totalGross += gross;
      totalNet += convertCurrency(s.netProfit, s.currency, displayCurrency, rates);
      if (s.grossProfit >= 0) winCount++;
      else lossCount++;
    }
    return { totalGross, totalNet, winCount, lossCount, total: sells.length };
  }, [filteredAccounts, rates, displayCurrency]);

  const yearlyReturns = useMemo<YearlyReturn[]>(() => {
    const byYear = new Map<number, { invested: number; sold: number; dividends: number; realizedPnl: number }>();

    for (const acct of filteredAccounts) {
      for (const tx of acct.transactions) {
        if (tx.type === "Interest") continue;
        const year = parseDate(tx.date).getFullYear();
        const entry = byYear.get(year) ?? { invested: 0, sold: 0, dividends: 0, realizedPnl: 0 };
        const val = convertCurrency(tx.shares! * tx.price!, tx.currency, displayCurrency, rates);
        if (tx.type === "Buy") entry.invested += val;
        else if (tx.type === "Sell") entry.sold += val;
        else if (tx.type === "Dividend") entry.dividends += val;
        byYear.set(year, entry);
      }
    }

    const sells = computeSellPnL(filteredAccounts, rates);
    for (const s of sells) {
      const year = s.year;
      const entry = byYear.get(year) ?? { invested: 0, sold: 0, dividends: 0, realizedPnl: 0 };
      entry.realizedPnl += convertCurrency(s.grossProfit, s.currency, displayCurrency, rates);
      byYear.set(year, entry);
    }

    return Array.from(byYear.entries())
      .sort(([a], [b]) => a - b)
      .map(([year, d]) => ({
        year: String(year),
        invested: +d.invested.toFixed(2),
        sold: +d.sold.toFixed(2),
        dividends: +d.dividends.toFixed(2),
        realizedPnl: +d.realizedPnl.toFixed(2),
      }));
  }, [filteredAccounts, displayCurrency, rates]);

  const portfolioTimeline = useMemo(() => {
    const events: { date: Date; invested: number; value: number; currency: string }[] = [];
    for (const acct of filteredAccounts) {
      for (const tx of acct.transactions) {
        if (tx.type === "Buy") {
          events.push({
            date: parseDate(tx.date),
            invested: tx.shares! * tx.price!,
            value: tx.shares! * tx.price!,
            currency: tx.currency,
          });
        } else if (tx.type === "Sell") {
          events.push({
            date: parseDate(tx.date),
            invested: -(tx.shares! * tx.price!),
            value: -(tx.shares! * tx.price!),
            currency: tx.currency,
          });
        }
      }
    }
    events.sort((a, b) => a.date.getTime() - b.date.getTime());

    let cumInvested = 0;
    const timeline: { date: string; invested: number }[] = [];
    for (const ev of events) {
      cumInvested += convertCurrency(ev.invested, ev.currency as CurrencySymbol, displayCurrency, rates);
      timeline.push({ date: toIsoDate(ev.date), invested: +cumInvested.toFixed(2) });
    }

    if (timeline.length > 0) {
      const totalValue = holdingPerformance.reduce((s, h) => s + h.value, 0);
      const today = toIsoDate(new Date());
      const lastEntry = timeline[timeline.length - 1]!;
      if (lastEntry.date !== today) {
        timeline.push({ date: today, invested: +cumInvested.toFixed(2) });
      }
      return { timeline, currentValue: totalValue };
    }
    return { timeline, currentValue: 0 };
  }, [filteredAccounts, displayCurrency, rates, holdingPerformance]);

  const totalInvested = holdingPerformance.reduce((s, h) => s + h.invested, 0);
  const totalValue = holdingPerformance.reduce((s, h) => s + h.value, 0);
  const totalUnrealizedPnL = totalValue - totalInvested;
  const totalReturn = totalInvested > 0 ? (totalUnrealizedPnL / totalInvested) * 100 : 0;
  const combinedPnL = totalUnrealizedPnL + realizedPnL.totalGross;
  const accountLabel = selectedAccount ?? "All Accounts";

  const gainers = holdingPerformance.filter((h) => h.pnlPct > 0).length;
  const losers = holdingPerformance.filter((h) => h.pnlPct < 0).length;
  const winRate =
    holdingPerformance.length > 0
      ? (gainers / holdingPerformance.length) * 100
      : 0;

  function handleSort(field: SortField) {
    if (sortField === field) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  const arrow = (field: SortField) =>
    sortField === field ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  const tooltipStyle = {
    contentStyle: {
      backgroundColor: "#1f2937",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: "8px",
      color: "#f1f5f9",
    },
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

      {/* Summary KPIs */}
      <div className="bg-card rounded-xl p-5 border border-white/5 mb-8">
        <h2 className="text-sm font-medium text-muted mb-4 uppercase tracking-wide">
          {accountLabel} &mdash; Returns Summary
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatsCard
            label="Unrealized P&L"
            value={formatCurrency(totalUnrealizedPnL, displayCurrency)}
            subValue={formatPercent(totalReturn)}
            trend={totalUnrealizedPnL >= 0 ? "up" : "down"}
          />
          <StatsCard
            label="Realized P&L"
            value={formatCurrency(realizedPnL.totalGross, displayCurrency)}
            subValue={`${realizedPnL.total} trades`}
            trend={realizedPnL.totalGross >= 0 ? "up" : "down"}
          />
          <StatsCard
            label="Combined P&L"
            value={formatCurrency(combinedPnL, displayCurrency)}
            trend={combinedPnL >= 0 ? "up" : "down"}
          />
          <StatsCard
            label="Win Rate (Open)"
            value={`${winRate.toFixed(0)}%`}
            subValue={`${gainers}W / ${losers}L`}
          />
          <StatsCard
            label="Win Rate (Closed)"
            value={
              realizedPnL.total > 0
                ? `${((realizedPnL.winCount / realizedPnL.total) * 100).toFixed(0)}%`
                : "—"
            }
            subValue={`${realizedPnL.winCount}W / ${realizedPnL.lossCount}L`}
          />
          <StatsCard
            label="Active Positions"
            value={currentHoldings.length.toString()}
          />
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Yearly Activity */}
        <div className="bg-card rounded-xl p-5 border border-white/5">
          <h2 className="text-sm font-medium text-muted mb-4 uppercase tracking-wide">
            Yearly Activity
          </h2>
          {yearlyReturns.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={yearlyReturns}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="year"
                  tick={{ fill: "#9ca3af", fontSize: 11 }}
                  stroke="rgba(255,255,255,0.1)"
                />
                <YAxis
                  tick={{ fill: "#9ca3af", fontSize: 11 }}
                  stroke="rgba(255,255,255,0.1)"
                />
                <Tooltip {...tooltipStyle} />
                <Legend wrapperStyle={{ color: "#9ca3af", fontSize: 12 }} />
                <Bar dataKey="invested" name="Bought" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="sold" name="Sold" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="dividends" name="Dividends" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-muted text-sm text-center py-10">
              No data available
            </div>
          )}
        </div>

        {/* Yearly Realized P&L */}
        <div className="bg-card rounded-xl p-5 border border-white/5">
          <h2 className="text-sm font-medium text-muted mb-4 uppercase tracking-wide">
            Yearly Realized P&L
          </h2>
          {yearlyReturns.filter((y) => y.realizedPnl !== 0).length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={yearlyReturns}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="year"
                  tick={{ fill: "#9ca3af", fontSize: 11 }}
                  stroke="rgba(255,255,255,0.1)"
                />
                <YAxis
                  tick={{ fill: "#9ca3af", fontSize: 11 }}
                  stroke="rgba(255,255,255,0.1)"
                />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="realizedPnl" name="Realized P&L" radius={[4, 4, 0, 0]}>
                  {yearlyReturns.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.realizedPnl >= 0 ? "#16a34a" : "#dc2626"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-muted text-sm text-center py-10">
              No realized P&L data
            </div>
          )}
        </div>
      </div>

      {/* Investment Growth */}
      <div className="bg-card rounded-xl p-5 border border-white/5 mb-8">
        <h2 className="text-sm font-medium text-muted mb-4 uppercase tracking-wide">
          Investment Growth
        </h2>
        {portfolioTimeline.timeline.length > 0 ? (
          <div>
            <div className="flex items-center gap-6 mb-4 text-sm flex-wrap">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500" />
                <span className="text-muted">Total Invested</span>
                <span className="text-white font-medium">
                  {formatCurrency(totalInvested, displayCurrency)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-0.5 w-6 bg-emerald-500" style={{ borderTop: "2px dashed #10b981" }} />
                <span className="text-muted">Current Value</span>
                <span className="text-white font-medium">
                  {formatCurrency(totalValue, displayCurrency)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted">Difference</span>
                <span className={`font-medium ${totalUnrealizedPnL >= 0 ? "text-gain" : "text-loss"}`}>
                  {formatCurrency(totalUnrealizedPnL, displayCurrency)} ({formatPercent(totalReturn)})
                </span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={portfolioTimeline.timeline}>
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
                <Tooltip {...tooltipStyle} />
                <ReferenceLine
                  y={totalValue}
                  stroke="#10b981"
                  strokeDasharray="6 4"
                  strokeWidth={2}
                  label={{
                    value: formatCurrency(totalValue, displayCurrency),
                    fill: "#10b981",
                    fontSize: 11,
                    position: "right",
                  }}
                />
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
          </div>
        ) : (
          <div className="text-muted text-sm text-center py-10">
            No data available
          </div>
        )}
      </div>

      {/* Holding Performance Table */}
      <div className="bg-card rounded-xl border border-white/5">
        <div className="p-5 border-b border-white/5">
          <h2 className="text-sm font-medium text-muted uppercase tracking-wide">
            Individual Holding Performance
          </h2>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/10">
                <th
                  className="py-2 px-5 text-xs text-muted uppercase tracking-wide cursor-pointer hover:text-white select-none"
                  onClick={() => handleSort("symbol")}
                >
                  Symbol{arrow("symbol")}
                </th>
                <th className="py-2 px-3 text-xs text-muted uppercase tracking-wide">
                  Name
                </th>
                <th
                  className="py-2 px-3 text-xs text-muted uppercase tracking-wide text-right cursor-pointer hover:text-white select-none"
                  onClick={() => handleSort("invested")}
                >
                  Invested{arrow("invested")}
                </th>
                <th
                  className="py-2 px-3 text-xs text-muted uppercase tracking-wide text-right cursor-pointer hover:text-white select-none"
                  onClick={() => handleSort("value")}
                >
                  Value{arrow("value")}
                </th>
                <th
                  className="py-2 px-3 text-xs text-muted uppercase tracking-wide text-right cursor-pointer hover:text-white select-none"
                  onClick={() => handleSort("pnl")}
                >
                  P&L{arrow("pnl")}
                </th>
                <th
                  className="py-2 px-3 text-xs text-muted uppercase tracking-wide text-right cursor-pointer hover:text-white select-none"
                  onClick={() => handleSort("pnlPct")}
                >
                  Return{arrow("pnlPct")}
                </th>
                <th className="py-2 px-3 text-xs text-muted uppercase tracking-wide text-right">
                  Weight
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedHoldings.map((h) => (
                <HoldingRow
                  key={h.symbol}
                  h={h}
                  displayCurrency={displayCurrency}
                />
              ))}
            </tbody>
            {holdingPerformance.length > 0 && (
              <tfoot>
                <tr className="bg-white/5">
                  <td colSpan={2} className="py-2.5 px-5 text-sm font-semibold text-white">
                    Total
                  </td>
                  <td className="py-2.5 px-3 text-sm text-right font-medium text-white">
                    {formatCurrency(totalInvested, displayCurrency)}
                  </td>
                  <td className="py-2.5 px-3 text-sm text-right font-medium text-white">
                    {formatCurrency(totalValue, displayCurrency)}
                  </td>
                  <td className={`py-2.5 px-3 text-sm text-right font-semibold ${totalUnrealizedPnL >= 0 ? "text-gain" : "text-loss"}`}>
                    {formatCurrency(totalUnrealizedPnL, displayCurrency)}
                  </td>
                  <td className={`py-2.5 px-3 text-sm text-right font-semibold ${totalReturn >= 0 ? "text-gain" : "text-loss"}`}>
                    {formatPercent(totalReturn)}
                  </td>
                  <td className="py-2.5 px-3 text-sm text-right text-muted">
                    100%
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
          {holdingPerformance.length === 0 && (
            <div className="text-center text-muted py-8 text-sm">
              No active holdings
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function HoldingRow({
  h,
  displayCurrency,
}: {
  h: HoldingPerf;
  displayCurrency: CurrencySymbol;
}) {
  const color = h.pnl >= 0 ? "text-gain" : "text-loss";
  return (
    <tr className="border-b border-white/5 hover:bg-white/5">
      <td className="py-2.5 px-5 text-sm font-medium text-white">
        {h.symbol}
      </td>
      <td className="py-2.5 px-3 text-sm text-muted">{h.name}</td>
      <td className="py-2.5 px-3 text-sm text-right">
        {formatCurrency(h.invested, displayCurrency)}
      </td>
      <td className="py-2.5 px-3 text-sm text-right">
        {formatCurrency(h.value, displayCurrency)}
      </td>
      <td className={`py-2.5 px-3 text-sm text-right ${color}`}>
        {formatCurrency(h.pnl, displayCurrency)}
      </td>
      <td className={`py-2.5 px-3 text-sm text-right font-medium ${color}`}>
        {formatPercent(h.pnlPct)}
      </td>
      <td className="py-2.5 px-3 text-sm text-right text-muted">
        {h.weight.toFixed(1)}%
      </td>
    </tr>
  );
}
