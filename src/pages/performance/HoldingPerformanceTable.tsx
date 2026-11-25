import { usePortfolio } from "../../context/usePortfolio";
import { useTableSort } from "../../hooks/useTableSort";
import { formatCurrency } from "../../utils/currency";
import { formatPercent } from "../../utils/numbers";
import type { CurrencySymbol } from "../../types";
import type { HoldingPerf, HoldingTotals } from "./types";
import SortableTh from "../../components/common/SortableTh";

type SortField = "symbol" | "invested" | "value" | "pnl" | "pnlPct";

const COMPARATORS: Record<
  SortField,
  (a: HoldingPerf, b: HoldingPerf) => number
> = {
  symbol: (a, b) => a.symbol.localeCompare(b.symbol),
  invested: (a, b) => a.invested - b.invested,
  value: (a, b) => a.value - b.value,
  pnl: (a, b) => a.pnl - b.pnl,
  pnlPct: (a, b) => a.pnlPct - b.pnlPct,
};

interface HoldingPerformanceTableProps {
  holdingPerformance: HoldingPerf[];
  totals: HoldingTotals;
}

/** Sortable per-holding performance table with a totals footer. */
export default function HoldingPerformanceTable({
  holdingPerformance,
  totals,
}: HoldingPerformanceTableProps) {
  const { displayCurrency } = usePortfolio();
  const { totalInvested, totalValue, totalUnrealizedPnL, totalReturn } = totals;
  const sort = useTableSort(holdingPerformance, COMPARATORS, "pnlPct");
  const sortedHoldings = sort.sorted;

  return (
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
              <SortableTh
                sort={sort}
                sortKey="symbol"
                className="py-2 px-5 text-xs text-muted uppercase tracking-wide"
              >
                Symbol
              </SortableTh>
              <th className="py-2 px-3 text-xs text-muted uppercase tracking-wide">
                Name
              </th>
              <SortableTh
                sort={sort}
                sortKey="invested"
                className="py-2 px-3 text-xs text-muted uppercase tracking-wide text-right"
              >
                Invested
              </SortableTh>
              <SortableTh
                sort={sort}
                sortKey="value"
                className="py-2 px-3 text-xs text-muted uppercase tracking-wide text-right"
              >
                Value
              </SortableTh>
              <SortableTh
                sort={sort}
                sortKey="pnl"
                className="py-2 px-3 text-xs text-muted uppercase tracking-wide text-right"
              >
                P&L
              </SortableTh>
              <SortableTh
                sort={sort}
                sortKey="pnlPct"
                className="py-2 px-3 text-xs text-muted uppercase tracking-wide text-right"
              >
                Return
              </SortableTh>
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
                <td
                  colSpan={2}
                  className="py-2.5 px-5 text-sm font-semibold text-white"
                >
                  Total
                </td>
                <td className="py-2.5 px-3 text-sm text-right font-medium text-white">
                  {formatCurrency(totalInvested, displayCurrency)}
                </td>
                <td className="py-2.5 px-3 text-sm text-right font-medium text-white">
                  {formatCurrency(totalValue, displayCurrency)}
                </td>
                <td
                  className={`py-2.5 px-3 text-sm text-right font-semibold ${totalUnrealizedPnL >= 0 ? "text-gain" : "text-loss"}`}
                >
                  {formatCurrency(totalUnrealizedPnL, displayCurrency)}
                </td>
                <td
                  className={`py-2.5 px-3 text-sm text-right font-semibold ${totalReturn >= 0 ? "text-gain" : "text-loss"}`}
                >
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
      <td className="py-2.5 px-5 text-sm font-medium text-white">{h.symbol}</td>
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
