import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LineChart,
  Line,
} from "recharts";
import { usePortfolio } from "../context/PortfolioContext";
import StatsCard from "../components/common/StatsCard";
import CurrencySelect from "../components/common/CurrencySelect";
import { formatCurrency, convertCurrency } from "../utils/currency";
import { parseDate } from "../utils/dates";
import type { Transaction } from "../types";

interface DividendBySymbol {
  symbol: string;
  name: string;
  grossAmount: number;
  fees: number;
  netAmount: number;
  count: number;
}

interface MonthlyDividend {
  month: string;
  amount: number;
}

export default function DividendsPage() {
  const { portfolio, displayCurrency, rates } = usePortfolio();

  const dividendTxs = useMemo(() => {
    const txs: (Transaction & { account: string })[] = [];
    for (const acct of portfolio.accounts) {
      for (const tx of acct.transactions) {
        if (tx.type === "Dividend") {
          txs.push({ ...tx, account: acct.account_name });
        }
      }
    }
    return txs;
  }, [portfolio.accounts]);

  const totalGross = useMemo(
    () =>
      dividendTxs.reduce(
        (s, t) =>
          s +
          convertCurrency(
            t.shares * t.price,
            t.currency,
            displayCurrency,
            rates
          ),
        0
      ),
    [dividendTxs, displayCurrency, rates]
  );

  const totalFees = useMemo(
    () =>
      dividendTxs.reduce(
        (s, t) =>
          s +
          convertCurrency(t.fee, t.currency, displayCurrency, rates),
        0
      ),
    [dividendTxs, displayCurrency, rates]
  );

  const totalNet = totalGross - totalFees;

  const bySymbol = useMemo<DividendBySymbol[]>(() => {
    const map = new Map<string, DividendBySymbol>();
    for (const tx of dividendTxs) {
      const existing = map.get(tx.symbol);
      const gross = convertCurrency(
        tx.shares * tx.price,
        tx.currency,
        displayCurrency,
        rates
      );
      const fee = convertCurrency(
        tx.fee,
        tx.currency,
        displayCurrency,
        rates
      );
      if (existing) {
        existing.grossAmount += gross;
        existing.fees += fee;
        existing.netAmount += gross - fee;
        existing.count += 1;
      } else {
        map.set(tx.symbol, {
          symbol: tx.symbol,
          name: tx.name,
          grossAmount: gross,
          fees: fee,
          netAmount: gross - fee,
          count: 1,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.netAmount - a.netAmount);
  }, [dividendTxs, displayCurrency, rates]);

  const monthly = useMemo<MonthlyDividend[]>(() => {
    const map = new Map<string, number>();
    for (const tx of dividendTxs) {
      const date = parseDate(tx.date);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const net = convertCurrency(
        tx.shares * tx.price - tx.fee,
        tx.currency,
        displayCurrency,
        rates
      );
      map.set(key, (map.get(key) ?? 0) + net);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, amount]) => ({ month, amount: +amount.toFixed(2) }));
  }, [dividendTxs, displayCurrency, rates]);

  const projectedAnnual = useMemo(() => {
    if (dividendTxs.length === 0) return 0;
    const dates = dividendTxs.map((t) => parseDate(t.date).getTime());
    const earliest = Math.min(...dates);
    const latest = Math.max(...dates);
    const spanYears =
      (latest - earliest) / (365.25 * 24 * 60 * 60 * 1000);
    if (spanYears < 0.1) return totalNet * 4;
    return totalNet / spanYears;
  }, [dividendTxs, totalNet]);

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
        <h1 className="text-2xl font-bold text-white">Dividends</h1>
        <CurrencySelect />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatsCard
          label="Gross Dividends"
          value={formatCurrency(totalGross, displayCurrency)}
        />
        <StatsCard
          label="Withholding Tax"
          value={formatCurrency(totalFees, displayCurrency)}
        />
        <StatsCard
          label="Net Dividends"
          value={formatCurrency(totalNet, displayCurrency)}
          trend="up"
        />
        <StatsCard
          label="Projected Annual"
          value={formatCurrency(projectedAnnual, displayCurrency)}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* By Symbol */}
        <div className="bg-card rounded-xl p-5 border border-white/5">
          <h2 className="text-sm font-medium text-muted mb-4 uppercase tracking-wide">
            Dividends by Symbol
          </h2>
          {bySymbol.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={bySymbol}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="symbol"
                  tick={{ fill: "#9ca3af", fontSize: 11 }}
                  stroke="rgba(255,255,255,0.1)"
                />
                <YAxis
                  tick={{ fill: "#9ca3af", fontSize: 11 }}
                  stroke="rgba(255,255,255,0.1)"
                />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="netAmount" name="Net" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-muted text-sm text-center py-10">
              No dividend data yet
            </div>
          )}
        </div>

        {/* Monthly Timeline */}
        <div className="bg-card rounded-xl p-5 border border-white/5">
          <h2 className="text-sm font-medium text-muted mb-4 uppercase tracking-wide">
            Monthly Dividend Income
          </h2>
          {monthly.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={monthly}>
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
                <Tooltip {...tooltipStyle} />
                <Line
                  type="monotone"
                  dataKey="amount"
                  name="Net Income"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={{ fill: "#10b981", r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-muted text-sm text-center py-10">
              No dividend data yet
            </div>
          )}
        </div>
      </div>

      {/* Dividend Table */}
      <div className="bg-card rounded-xl border border-white/5 overflow-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/10">
              <th className="py-2 px-3 text-xs text-muted uppercase tracking-wide">
                Symbol
              </th>
              <th className="py-2 px-3 text-xs text-muted uppercase tracking-wide">
                Name
              </th>
              <th className="py-2 px-3 text-xs text-muted uppercase tracking-wide text-right">
                Gross
              </th>
              <th className="py-2 px-3 text-xs text-muted uppercase tracking-wide text-right">
                Tax
              </th>
              <th className="py-2 px-3 text-xs text-muted uppercase tracking-wide text-right">
                Net
              </th>
              <th className="py-2 px-3 text-xs text-muted uppercase tracking-wide text-right">
                Payments
              </th>
            </tr>
          </thead>
          <tbody>
            {bySymbol.map((d) => (
              <tr
                key={d.symbol}
                className="border-b border-white/5 hover:bg-white/5"
              >
                <td className="py-2.5 px-3 text-sm font-medium text-white">
                  {d.symbol}
                </td>
                <td className="py-2.5 px-3 text-sm text-muted">{d.name}</td>
                <td className="py-2.5 px-3 text-sm text-right">
                  {formatCurrency(d.grossAmount, displayCurrency)}
                </td>
                <td className="py-2.5 px-3 text-sm text-right text-muted">
                  {formatCurrency(d.fees, displayCurrency)}
                </td>
                <td className="py-2.5 px-3 text-sm text-right text-gain">
                  {formatCurrency(d.netAmount, displayCurrency)}
                </td>
                <td className="py-2.5 px-3 text-sm text-right text-muted">
                  {d.count}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {bySymbol.length === 0 && (
          <div className="text-center text-muted py-8 text-sm">
            No dividends received yet
          </div>
        )}
      </div>
    </div>
  );
}
