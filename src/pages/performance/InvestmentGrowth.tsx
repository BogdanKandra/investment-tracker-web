import { useMemo } from "react";
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LineChart,
  Line,
  ReferenceLine,
} from "recharts";
import { usePortfolio } from "../../context/usePortfolio";
import { formatCurrency, convertCurrency } from "../../utils/currency";
import { formatPercent } from "../../utils/numbers";
import { parseDate, toIsoDate } from "../../utils/dates";
import type { Account, CurrencySymbol } from "../../types";
import { tooltipStyle } from "./chartUtils";
import type { HoldingPerf, HoldingTotals } from "./types";

interface InvestmentGrowthProps {
  filteredAccounts: Account[];
  holdingPerformance: HoldingPerf[];
  totals: HoldingTotals;
}

/** Cumulative invested amount over time vs. today's market value. */
export default function InvestmentGrowth({
  filteredAccounts,
  holdingPerformance,
  totals,
}: InvestmentGrowthProps) {
  const { displayCurrency, rates } = usePortfolio();
  const { totalInvested, totalValue, totalUnrealizedPnL, totalReturn } = totals;

  const portfolioTimeline = useMemo(() => {
    const events: {
      date: Date;
      invested: number;
      value: number;
      currency: string;
    }[] = [];
    for (const acct of filteredAccounts) {
      for (const tx of acct.transactions) {
        if (tx.type === "Buy") {
          events.push({
            date: parseDate(tx.date),
            invested: tx.shares * tx.price,
            value: tx.shares * tx.price,
            currency: tx.currency,
          });
        } else if (tx.type === "Sell") {
          events.push({
            date: parseDate(tx.date),
            invested: -(tx.shares * tx.price),
            value: -(tx.shares * tx.price),
            currency: tx.currency,
          });
        }
      }
    }
    events.sort((a, b) => a.date.getTime() - b.date.getTime());

    let cumInvested = 0;
    const timeline: { date: string; invested: number }[] = [];
    for (const ev of events) {
      cumInvested += convertCurrency(
        ev.invested,
        ev.currency as CurrencySymbol,
        displayCurrency,
        rates
      );
      timeline.push({
        date: toIsoDate(ev.date),
        invested: +cumInvested.toFixed(2),
      });
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

  return (
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
              <div
                className="w-3 h-0.5 w-6 bg-emerald-500"
                style={{ borderTop: "2px dashed #10b981" }}
              />
              <span className="text-muted">Current Value</span>
              <span className="text-white font-medium">
                {formatCurrency(totalValue, displayCurrency)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted">Difference</span>
              <span
                className={`font-medium ${totalUnrealizedPnL >= 0 ? "text-gain" : "text-loss"}`}
              >
                {formatCurrency(totalUnrealizedPnL, displayCurrency)} (
                {formatPercent(totalReturn)})
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={portfolioTimeline.timeline}>
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
  );
}
