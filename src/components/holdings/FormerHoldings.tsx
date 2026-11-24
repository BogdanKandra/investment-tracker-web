import { useMemo, useState } from "react";
import type { Holding, CurrencySymbol, ExchangeRates } from "../../types";
import { formatCurrency, convertCurrency } from "../../utils/currency";
import { formatPercent } from "../../utils/numbers";
import { useTableSort } from "../../hooks/useTableSort";

interface FormerHoldingsProps {
  holdings: Holding[];
  displayCurrency: CurrencySymbol;
  rates: ExchangeRates;
  selectedSymbol: string | null;
  onSelect: (symbol: string) => void;
}

export default function FormerHoldings({
  holdings,
  displayCurrency,
  rates,
  selectedSymbol,
  onSelect,
}: FormerHoldingsProps) {
  const [expanded, setExpanded] = useState(false);

  type FormerSortKey = "symbol" | "pnl";
  const formerComparators = useMemo(() => ({
    symbol: (a: Holding, b: Holding) => a.symbol.localeCompare(b.symbol),
    pnl: (a: Holding, b: Holding) => convertCurrency(a.realizedPnL, a.currency, displayCurrency, rates) - convertCurrency(b.realizedPnL, b.currency, displayCurrency, rates),
  }), [displayCurrency, rates]);
  const formerSort = useTableSort(holdings, formerComparators as Record<FormerSortKey, (a: Holding, b: Holding) => number>, "pnl" as FormerSortKey);

  if (holdings.length === 0) return null;

  return (
    <div className="mt-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm font-medium text-muted hover:text-white transition-colors"
      >
        <span
          className={`transition-transform ${expanded ? "rotate-90" : ""}`}
        >
          ▶
        </span>
        Former Holdings ({holdings.length})
      </button>

      {expanded && (
        <div className="mt-3 overflow-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/10">
                <th className="py-2 px-3 text-xs text-muted uppercase tracking-wide cursor-pointer hover:text-white select-none" onClick={() => formerSort.handleSort("symbol")}>
                  Asset{formerSort.arrow("symbol")}
                </th>
                <th className="py-2 px-3 text-xs text-muted uppercase tracking-wide text-right cursor-pointer hover:text-white select-none" onClick={() => formerSort.handleSort("pnl")}>
                  Realized P&L{formerSort.arrow("pnl")}
                </th>
              </tr>
            </thead>
            <tbody>
              {formerSort.sorted.map((h) => {
                const displayPnL = convertCurrency(
                  h.realizedPnL,
                  h.currency,
                  displayCurrency,
                  rates
                );
                const totalBuys = h.transactions
                  .filter((t) => t.type === "Buy")
                  .reduce((s, t) => s + t.shares! * t.price!, 0);
                const pct =
                  totalBuys > 0
                    ? (h.realizedPnL / totalBuys) * 100
                    : 0;
                const color = h.realizedPnL >= 0 ? "text-gain" : "text-loss";

                return (
                  <tr
                    key={`${h.accountName}-${h.symbol}`}
                    onClick={() => onSelect(h.symbol)}
                    className={`cursor-pointer border-b border-white/5 transition-colors ${
                      selectedSymbol === h.symbol
                        ? "bg-blue-500/10"
                        : "hover:bg-white/5"
                    }`}
                  >
                    <td className="py-3 px-3">
                      <div className="font-medium text-white">{h.symbol}</div>
                      <div className="text-xs text-muted">{h.name}</div>
                    </td>
                    <td className={`py-3 px-3 text-right ${color}`}>
                      <div className="text-sm">
                        {formatCurrency(displayPnL, displayCurrency)}
                      </div>
                      <div className="text-xs">{formatPercent(pct)}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
