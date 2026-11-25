import { useMemo } from "react";
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  AreaChart,
  Area,
} from "recharts";
import { usePortfolio } from "../../context/usePortfolio";
import { formatCurrency, convertCurrency } from "../../utils/currency";
import { parseDate, toIsoDate } from "../../utils/dates";
import type { SellPnL } from "../../data/taxCalculator";
import type { Account, CurrencySymbol } from "../../types";
import { tooltipStyle } from "./chartUtils";

interface TotalInvestmentGrowthProps {
  filteredAccounts: Account[];
  sellPnLData: SellPnL[];
}

/**
 * Stacked net capital deployed, realized P&L from closed positions and
 * dividends received, over time.
 */
export default function TotalInvestmentGrowth({
  filteredAccounts,
  sellPnLData,
}: TotalInvestmentGrowthProps) {
  const { displayCurrency, rates } = usePortfolio();

  const totalGrowthTimeline = useMemo(() => {
    type RawEvent = {
      date: Date;
      cashFlow: number;
      realizedPnl: number;
      dividend: number;
    };
    const rawEvents: RawEvent[] = [];

    for (const acct of filteredAccounts) {
      for (const tx of acct.transactions) {
        const d = parseDate(tx.date);
        if (tx.type === "Buy") {
          rawEvents.push({
            date: d,
            cashFlow: convertCurrency(
              tx.shares * tx.price,
              tx.currency as CurrencySymbol,
              displayCurrency,
              rates
            ),
            realizedPnl: 0,
            dividend: 0,
          });
        } else if (tx.type === "Sell") {
          rawEvents.push({
            date: d,
            cashFlow: -convertCurrency(
              tx.shares * tx.price,
              tx.currency as CurrencySymbol,
              displayCurrency,
              rates
            ),
            realizedPnl: 0,
            dividend: 0,
          });
        } else if (tx.type === "Dividend") {
          rawEvents.push({
            date: d,
            cashFlow: 0,
            realizedPnl: 0,
            dividend: convertCurrency(
              tx.shares * tx.price,
              tx.currency as CurrencySymbol,
              displayCurrency,
              rates
            ),
          });
        }
      }
    }

    for (const s of sellPnLData) {
      rawEvents.push({
        date: parseDate(s.date),
        cashFlow: 0,
        realizedPnl: convertCurrency(
          s.grossProfit,
          s.currency,
          displayCurrency,
          rates
        ),
        dividend: 0,
      });
    }

    rawEvents.sort((a, b) => a.date.getTime() - b.date.getTime());

    let cumNetInvested = 0;
    let cumRealizedPnl = 0;
    let cumDividends = 0;

    const timeline: {
      date: string;
      netInvested: number;
      realizedPnl: number;
      dividends: number;
    }[] = [];

    for (const ev of rawEvents) {
      cumNetInvested += ev.cashFlow;
      cumRealizedPnl += ev.realizedPnl;
      cumDividends += ev.dividend;
      timeline.push({
        date: toIsoDate(ev.date),
        netInvested: +cumNetInvested.toFixed(2),
        realizedPnl: +cumRealizedPnl.toFixed(2),
        dividends: +cumDividends.toFixed(2),
      });
    }

    if (timeline.length > 0) {
      const today = toIsoDate(new Date());
      if (timeline[timeline.length - 1]!.date !== today) {
        timeline.push({
          date: today,
          netInvested: +cumNetInvested.toFixed(2),
          realizedPnl: +cumRealizedPnl.toFixed(2),
          dividends: +cumDividends.toFixed(2),
        });
      }
    }

    return {
      timeline,
      totalNetInvested: cumNetInvested,
      totalRealizedPnl: cumRealizedPnl,
      totalDividends: cumDividends,
    };
  }, [filteredAccounts, displayCurrency, rates, sellPnLData]);

  return (
    <div className="bg-card rounded-xl p-5 border border-white/5 mb-8">
      <h2 className="text-sm font-medium text-muted mb-1 uppercase tracking-wide">
        Total Investment Growth
      </h2>
      <p className="text-xs text-muted mb-4">
        Includes net capital deployed, realized P&amp;L from closed positions,
        and dividends received.
      </p>
      {totalGrowthTimeline.timeline.length > 0 ? (
        <div>
          <div className="flex items-center gap-6 mb-4 text-sm flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <span className="text-muted">Net Invested</span>
              <span className="text-white font-medium">
                {formatCurrency(
                  totalGrowthTimeline.totalNetInvested,
                  displayCurrency
                )}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-yellow-400" />
              <span className="text-muted">Closed P&amp;L</span>
              <span
                className={`font-medium ${totalGrowthTimeline.totalRealizedPnl >= 0 ? "text-gain" : "text-loss"}`}
              >
                {formatCurrency(
                  totalGrowthTimeline.totalRealizedPnl,
                  displayCurrency
                )}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-pink-500" />
              <span className="text-muted">Dividends</span>
              <span className="text-white font-medium">
                {formatCurrency(
                  totalGrowthTimeline.totalDividends,
                  displayCurrency
                )}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted">Total</span>
              <span className="text-white font-medium">
                {formatCurrency(
                  totalGrowthTimeline.totalNetInvested +
                    totalGrowthTimeline.totalRealizedPnl +
                    totalGrowthTimeline.totalDividends,
                  displayCurrency
                )}
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={totalGrowthTimeline.timeline}>
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
              <Tooltip
                {...tooltipStyle}
                formatter={(value: number, name: string) => [
                  formatCurrency(value, displayCurrency),
                  name,
                ]}
              />
              <Legend wrapperStyle={{ color: "#9ca3af", fontSize: 12 }} />
              <Area
                type="monotone"
                stackId="growth"
                dataKey="netInvested"
                name="Net Invested"
                stroke="#3b82f6"
                fill="#3b82f6"
                fillOpacity={0.55}
                dot={false}
              />
              <Area
                type="monotone"
                stackId="growth"
                dataKey="realizedPnl"
                name="Closed Position P&L"
                stroke="#eab308"
                fill="#eab308"
                fillOpacity={0.55}
                dot={false}
              />
              <Area
                type="monotone"
                stackId="growth"
                dataKey="dividends"
                name="Dividends"
                stroke="#ec4899"
                fill="#ec4899"
                fillOpacity={0.55}
                dot={false}
              />
            </AreaChart>
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
