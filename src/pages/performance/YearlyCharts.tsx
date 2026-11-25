import { useMemo } from "react";
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
} from "recharts";
import { usePortfolio } from "../../context/usePortfolio";
import { convertCurrency } from "../../utils/currency";
import { parseDate } from "../../utils/dates";
import type { SellPnL } from "../../data/taxCalculator";
import type { Account } from "../../types";
import { tooltipStyle } from "../../components/charts/chartStyles";
import type { YearlyReturn } from "./types";

interface YearlyChartsProps {
  filteredAccounts: Account[];
  sellPnLData: SellPnL[];
}

/** "Yearly Activity" and "Yearly Realized P&L" bar charts, side by side. */
export default function YearlyCharts({
  filteredAccounts,
  sellPnLData,
}: YearlyChartsProps) {
  const { displayCurrency, rates } = usePortfolio();

  const yearlyReturns = useMemo<YearlyReturn[]>(() => {
    const byYear = new Map<
      number,
      { invested: number; sold: number; dividends: number; realizedPnl: number }
    >();

    for (const acct of filteredAccounts) {
      for (const tx of acct.transactions) {
        if (tx.type === "Interest") continue;
        const year = parseDate(tx.date).getFullYear();
        const entry = byYear.get(year) ?? {
          invested: 0,
          sold: 0,
          dividends: 0,
          realizedPnl: 0,
        };
        const val = convertCurrency(
          tx.shares * tx.price,
          tx.currency,
          displayCurrency,
          rates
        );
        if (tx.type === "Buy") entry.invested += val;
        else if (tx.type === "Sell") entry.sold += val;
        else if (tx.type === "Dividend") entry.dividends += val;
        byYear.set(year, entry);
      }
    }

    for (const s of sellPnLData) {
      const year = s.year;
      const entry = byYear.get(year) ?? {
        invested: 0,
        sold: 0,
        dividends: 0,
        realizedPnl: 0,
      };
      entry.realizedPnl += convertCurrency(
        s.grossProfit,
        s.currency,
        displayCurrency,
        rates
      );
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
  }, [filteredAccounts, displayCurrency, rates, sellPnLData]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
      {/* Yearly Activity */}
      <div className="bg-card rounded-xl p-5 border border-white/5">
        <h2 className="text-sm font-medium text-muted mb-4 uppercase tracking-wide">
          Yearly Activity
        </h2>
        {yearlyReturns.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={yearlyReturns}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.05)"
              />
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
              <Bar
                dataKey="invested"
                name="Bought"
                fill="#3b82f6"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="sold"
                name="Sold"
                fill="#f59e0b"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="dividends"
                name="Dividends"
                fill="#10b981"
                radius={[4, 4, 0, 0]}
              />
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
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.05)"
              />
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
              <Bar
                dataKey="realizedPnl"
                name="Realized P&L"
                radius={[4, 4, 0, 0]}
              >
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
  );
}
