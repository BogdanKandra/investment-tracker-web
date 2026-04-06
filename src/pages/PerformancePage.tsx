import { useMemo, useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import { usePortfolio } from "../context/PortfolioContext";
import StatsCard from "../components/common/StatsCard";
import AccountSelect from "../components/common/AccountSelect";
import CurrencySelect from "../components/common/CurrencySelect";
import { formatCurrency, convertCurrency } from "../utils/currency";
import { formatPercent } from "../utils/numbers";
import { parseDate, toIsoDate } from "../utils/dates";
import { fetchCurrentPrices } from "../api/marketData";
import type { CurrencySymbol } from "../types";

interface MonthlyReturn {
  month: string;
  returnPct: number;
}

interface HoldingPerf {
  symbol: string;
  name: string;
  invested: number;
  value: number;
  pnl: number;
  pnlPct: number;
}

export default function PerformancePage() {
  const { portfolio, selectedAccount, currentHoldings, displayCurrency, rates } =
    usePortfolio();
  const [prices, setPrices] = useState<Map<string, number>>(new Map());
  const [holdingsOpen, setHoldingsOpen] = useState(false);

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
    return currentHoldings
      .map((h) => {
        const price = prices.get(h.symbol) ?? h.averageCost;
        const value = h.totalShares * price;
        const pnl = value - h.totalInvested;
        const pnlPct =
          h.totalInvested > 0 ? (pnl / h.totalInvested) * 100 : 0;
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
        };
      })
      .sort((a, b) => b.pnlPct - a.pnlPct);
  }, [currentHoldings, prices, displayCurrency, rates]);

  const portfolioTimeline = useMemo(() => {
    const events: { date: Date; invested: number; currency: string }[] = [];
    for (const acct of filteredAccounts) {
      for (const tx of acct.transactions) {
        if (tx.type === "Buy") {
          events.push({
            date: parseDate(tx.date),
            invested: tx.shares * tx.price,
            currency: tx.currency,
          });
        } else if (tx.type === "Sell") {
          events.push({
            date: parseDate(tx.date),
            invested: -(tx.shares * tx.price),
            currency: tx.currency,
          });
        }
      }
    }
    events.sort((a, b) => a.date.getTime() - b.date.getTime());

    let cumulative = 0;
    const timeline: { date: string; invested: number }[] = [];
    for (const ev of events) {
      cumulative += convertCurrency(
        ev.invested,
        ev.currency as CurrencySymbol,
        displayCurrency,
        rates
      );
      timeline.push({
        date: toIsoDate(ev.date),
        invested: +cumulative.toFixed(2),
      });
    }
    return timeline;
  }, [filteredAccounts, displayCurrency, rates]);

  const monthlyReturns = useMemo<MonthlyReturn[]>(() => {
    const byMonth = new Map<string, { buys: number; sells: number }>();
    for (const acct of filteredAccounts) {
      for (const tx of acct.transactions) {
        if (tx.type === "Dividend") continue;
        const d = parseDate(tx.date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const val = convertCurrency(
          tx.shares * tx.price,
          tx.currency,
          displayCurrency,
          rates
        );
        const existing = byMonth.get(key) ?? { buys: 0, sells: 0 };
        if (tx.type === "Buy") existing.buys += val;
        else existing.sells += val;
        byMonth.set(key, existing);
      }
    }

    return Array.from(byMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, { buys, sells }]) => ({
        month,
        returnPct: buys > 0 ? ((sells - buys) / buys) * 100 : 0,
      }));
  }, [filteredAccounts, displayCurrency, rates]);

  const totalInvested = holdingPerformance.reduce(
    (s, h) => s + h.invested,
    0
  );
  const totalValue = holdingPerformance.reduce((s, h) => s + h.value, 0);
  const totalPnL = totalValue - totalInvested;
  const totalReturn = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;
  const accountLabel = selectedAccount ?? "All Accounts";

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

      {/* Account Performance Summary */}
      <div className="bg-card rounded-xl p-5 border border-white/5 mb-8">
        <h2 className="text-sm font-medium text-muted mb-4 uppercase tracking-wide">
          {accountLabel} &mdash; Performance Overview
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatsCard
            label="Total Value"
            value={formatCurrency(totalValue, displayCurrency)}
          />
          <StatsCard
            label="Total Invested"
            value={formatCurrency(totalInvested, displayCurrency)}
          />
          <StatsCard
            label="Total P&L"
            value={formatCurrency(totalPnL, displayCurrency)}
            subValue={formatPercent(totalReturn)}
            trend={totalPnL >= 0 ? "up" : "down"}
          />
          <StatsCard
            label="Active Positions"
            value={currentHoldings.length.toString()}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Investment Timeline */}
        <div className="bg-card rounded-xl p-5 border border-white/5">
          <h2 className="text-sm font-medium text-muted mb-4 uppercase tracking-wide">
            Cumulative Investment
          </h2>
          {portfolioTimeline.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={portfolioTimeline}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.05)"
                />
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

        {/* Monthly Activity */}
        <div className="bg-card rounded-xl p-5 border border-white/5">
          <h2 className="text-sm font-medium text-muted mb-4 uppercase tracking-wide">
            Monthly Net Flow
          </h2>
          {monthlyReturns.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyReturns}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.05)"
                />
                <XAxis
                  dataKey="month"
                  tick={{ fill: "#9ca3af", fontSize: 11 }}
                  stroke="rgba(255,255,255,0.1)"
                />
                <YAxis
                  tick={{ fill: "#9ca3af", fontSize: 11 }}
                  stroke="rgba(255,255,255,0.1)"
                />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="returnPct" name="Return %" radius={[4, 4, 0, 0]}>
                  {monthlyReturns.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.returnPct >= 0 ? "#16a34a" : "#dc2626"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-muted text-sm text-center py-10">
              No data available
            </div>
          )}
        </div>
      </div>

      {/* Holdings Performance Accordion */}
      <div className="bg-card rounded-xl border border-white/5">
        <button
          onClick={() => setHoldingsOpen(!holdingsOpen)}
          className="w-full flex items-center justify-between p-5 text-left hover:bg-white/5 transition-colors rounded-xl"
        >
          <h2 className="text-sm font-medium text-muted uppercase tracking-wide">
            Individual Holding Performance
          </h2>
          <svg
            className={`w-5 h-5 text-muted transition-transform duration-200 ${
              holdingsOpen ? "rotate-180" : ""
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {holdingsOpen && (
          <div className="overflow-auto border-t border-white/5">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="py-2 px-5 text-xs text-muted uppercase tracking-wide">
                    Symbol
                  </th>
                  <th className="py-2 px-3 text-xs text-muted uppercase tracking-wide">
                    Name
                  </th>
                  <th className="py-2 px-3 text-xs text-muted uppercase tracking-wide text-right">
                    Invested
                  </th>
                  <th className="py-2 px-3 text-xs text-muted uppercase tracking-wide text-right">
                    Value
                  </th>
                  <th className="py-2 px-3 text-xs text-muted uppercase tracking-wide text-right">
                    P&L
                  </th>
                  <th className="py-2 px-3 text-xs text-muted uppercase tracking-wide text-right">
                    Return
                  </th>
                </tr>
              </thead>
              <tbody>
                {holdingPerformance.map((h) => (
                  <HoldingRow key={h.symbol} h={h} displayCurrency={displayCurrency} />
                ))}
              </tbody>
            </table>
          </div>
        )}
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
    </tr>
  );
}
