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
import { parseDate, formatDateStr } from "../utils/dates";
import type { Transaction } from "../types";

const W8BEN_PRE_TREATY_RATE = 0.3;
const W8BEN_POST_TREATY_RATE = 0.1;

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

  const w8benDate = useMemo(() => {
    if (!portfolio.w_8ben_activated_at) return null;
    return parseDate(portfolio.w_8ben_activated_at);
  }, [portfolio.w_8ben_activated_at]);

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

  /** Whether a dividend transaction is subject to W-8BEN (USD, paid on or after activation) */
  const isPostTreaty = (tx: Transaction): boolean => {
    if (!w8benDate) return false;
    if (tx.currency !== "$") return false;
    return parseDate(tx.date) >= w8benDate;
  };

  const totalGross = useMemo(
    () =>
      dividendTxs.reduce(
        (s, t) =>
          s +
          convertCurrency(t.shares * t.price, t.currency, displayCurrency, rates),
        0
      ),
    [dividendTxs, displayCurrency, rates]
  );

  const totalFees = useMemo(
    () =>
      dividendTxs.reduce(
        (s, t) => s + convertCurrency(t.fee, t.currency, displayCurrency, rates),
        0
      ),
    [dividendTxs, displayCurrency, rates]
  );

  const totalNet = totalGross - totalFees;

  // W-8BEN treaty impact — only for USD dividends
  const treatyStats = useMemo(() => {
    if (!w8benDate) return null;

    let preTreatyGross = 0;
    let preTreatyFee = 0;
    let postTreatyGross = 0;
    let postTreatyFee = 0;
    let postTreatyCount = 0;

    for (const tx of dividendTxs) {
      if (tx.currency !== "$") continue;
      const gross = convertCurrency(tx.shares * tx.price, tx.currency, displayCurrency, rates);
      const fee = convertCurrency(tx.fee, tx.currency, displayCurrency, rates);
      if (isPostTreaty(tx)) {
        postTreatyGross += gross;
        postTreatyFee += fee;
        postTreatyCount += 1;
      } else {
        preTreatyGross += gross;
        preTreatyFee += fee;
      }
    }

    // Tax that would have been paid at 30% if W-8BEN had NOT been activated
    const hypotheticalTax = postTreatyGross * W8BEN_PRE_TREATY_RATE;
    const actualTax = postTreatyGross * W8BEN_POST_TREATY_RATE;
    const taxSaved = hypotheticalTax - actualTax;

    return {
      preTreatyGross,
      preTreatyFee,
      preTreatyEffectiveRate: preTreatyGross > 0 ? preTreatyFee / preTreatyGross : null,
      postTreatyGross,
      postTreatyFee,
      postTreatyEffectiveRate: postTreatyGross > 0 ? postTreatyFee / postTreatyGross : null,
      postTreatyCount,
      taxSaved,
    };
  }, [w8benDate, dividendTxs, displayCurrency, rates]);

  const bySymbol = useMemo<DividendBySymbol[]>(() => {
    const map = new Map<string, DividendBySymbol>();
    for (const tx of dividendTxs) {
      const existing = map.get(tx.symbol);
      const gross = convertCurrency(tx.shares * tx.price, tx.currency, displayCurrency, rates);
      const fee = convertCurrency(tx.fee, tx.currency, displayCurrency, rates);
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
    const spanYears = (latest - earliest) / (365.25 * 24 * 60 * 60 * 1000);
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

  const fmtPct = (rate: number) => `${(rate * 100).toFixed(1)}%`;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Dividends</h1>
        <CurrencySelect />
      </div>

      {/* W-8BEN Status Banner */}
      {portfolio.w_8ben_activated_at && (
        <div className="mb-6 bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 flex items-start gap-3">
          <div className="mt-0.5 text-blue-400 text-lg leading-none">⚑</div>
          <div>
            <div className="text-sm font-semibold text-blue-300 mb-0.5">
              W-8BEN Treaty Active
            </div>
            <div className="text-xs text-blue-400/80">
              Activated on{" "}
              <span className="font-medium text-blue-300">
                {formatDateStr(portfolio.w_8ben_activated_at)}
              </span>
              . US dividend withholding reduced from{" "}
              <span className="font-medium text-blue-300">
                {fmtPct(W8BEN_PRE_TREATY_RATE)}
              </span>{" "}
              to{" "}
              <span className="font-medium text-blue-300">
                {fmtPct(W8BEN_POST_TREATY_RATE)}
              </span>{" "}
              for all USD dividends received on or after the activation date.
            </div>
          </div>
        </div>
      )}

      {/* Overall Stats */}
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

      {/* W-8BEN Treaty Breakdown */}
      {treatyStats && (
        <div className="mb-8">
          <h2 className="text-sm font-medium text-muted mb-3 uppercase tracking-wide">
            W-8BEN Treaty Impact (USD Dividends)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Pre-treaty */}
            <div className="bg-card rounded-xl p-4 border border-white/5">
              <div className="text-xs text-muted uppercase tracking-wide mb-3">
                Pre-Treaty (30% rate)
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted">Gross</span>
                  <span className="text-white">
                    {formatCurrency(treatyStats.preTreatyGross, displayCurrency)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Withheld</span>
                  <span className="text-loss">
                    {formatCurrency(treatyStats.preTreatyFee, displayCurrency)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-white/10 pt-2 mt-2">
                  <span className="text-muted">Net</span>
                  <span className="text-gain font-medium">
                    {formatCurrency(
                      treatyStats.preTreatyGross - treatyStats.preTreatyFee,
                      displayCurrency
                    )}
                  </span>
                </div>
                {treatyStats.preTreatyEffectiveRate !== null && (
                  <div className="flex justify-between">
                    <span className="text-muted">Effective rate</span>
                    <span className="text-amber-400 font-medium">
                      {fmtPct(treatyStats.preTreatyEffectiveRate)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Post-treaty */}
            <div className="bg-card rounded-xl p-4 border border-blue-500/20">
              <div className="text-xs text-blue-400 uppercase tracking-wide mb-3">
                Post-Treaty (10% rate) · {treatyStats.postTreatyCount} payments
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted">Gross</span>
                  <span className="text-white">
                    {formatCurrency(treatyStats.postTreatyGross, displayCurrency)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Withheld</span>
                  <span className="text-loss">
                    {formatCurrency(treatyStats.postTreatyFee, displayCurrency)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-white/10 pt-2 mt-2">
                  <span className="text-muted">Net</span>
                  <span className="text-gain font-medium">
                    {formatCurrency(
                      treatyStats.postTreatyGross - treatyStats.postTreatyFee,
                      displayCurrency
                    )}
                  </span>
                </div>
                {treatyStats.postTreatyEffectiveRate !== null && (
                  <div className="flex justify-between">
                    <span className="text-muted">Effective rate</span>
                    <span className="text-blue-400 font-medium">
                      {fmtPct(treatyStats.postTreatyEffectiveRate)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Tax saved */}
            <div className="bg-card rounded-xl p-4 border border-green-500/20">
              <div className="text-xs text-green-400 uppercase tracking-wide mb-3">
                W-8BEN Savings
              </div>
              <div className="space-y-2 text-sm">
                <div className="text-muted text-xs mb-1">
                  Tax saved vs. 30% withholding on post-treaty dividends
                </div>
                <div className="text-3xl font-bold text-gain mt-2">
                  {formatCurrency(treatyStats.taxSaved, displayCurrency)}
                </div>
                {treatyStats.postTreatyGross > 0 && (
                  <div className="text-xs text-muted mt-1">
                    {fmtPct(W8BEN_PRE_TREATY_RATE)} → {fmtPct(W8BEN_POST_TREATY_RATE)} on{" "}
                    {formatCurrency(treatyStats.postTreatyGross, displayCurrency)} gross
                  </div>
                )}
                {treatyStats.postTreatyCount === 0 && (
                  <div className="text-xs text-muted mt-1">
                    No post-treaty USD dividends received yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

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
            <div className="text-muted text-sm text-center py-10">No dividend data yet</div>
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
            <div className="text-muted text-sm text-center py-10">No dividend data yet</div>
          )}
        </div>
      </div>

      {/* Dividend Table */}
      <div className="bg-card rounded-xl border border-white/5 overflow-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/10">
              <th className="py-2 px-3 text-xs text-muted uppercase tracking-wide">Symbol</th>
              <th className="py-2 px-3 text-xs text-muted uppercase tracking-wide">Name</th>
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
                Eff. Rate
              </th>
              <th className="py-2 px-3 text-xs text-muted uppercase tracking-wide text-right">
                Payments
              </th>
            </tr>
          </thead>
          <tbody>
            {bySymbol.map((d) => {
              const effectiveRate = d.grossAmount > 0 ? d.fees / d.grossAmount : 0;
              return (
                <tr key={d.symbol} className="border-b border-white/5 hover:bg-white/5">
                  <td className="py-2.5 px-3 text-sm font-medium text-white">{d.symbol}</td>
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
                    {d.grossAmount > 0 ? fmtPct(effectiveRate) : "—"}
                  </td>
                  <td className="py-2.5 px-3 text-sm text-right text-muted">{d.count}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {bySymbol.length === 0 && (
          <div className="text-center text-muted py-8 text-sm">No dividends received yet</div>
        )}
      </div>
    </div>
  );
}
