import { useMemo, useState } from "react";
import { usePortfolio } from "../../context/usePortfolio";
import { formatCurrency } from "../../utils/currency";
import { formatPercent } from "../../utils/numbers";
import type { CurrencySymbol } from "../../types";
import type { HoldingPerf, HoldingTotals } from "./types";

type SortField = "symbol" | "invested" | "value" | "pnl" | "pnlPct";
type SortDir = "asc" | "desc";

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
  const [sortField, setSortField] = useState<SortField>("pnlPct");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

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

  function handleSort(field: SortField) {
    if (sortField === field) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  const arrow = (field: SortField) =>
    sortField === field ? (sortDir === "asc" ? " ↑" : " ↓") : "";

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
