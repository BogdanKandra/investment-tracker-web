import type { Holding, CurrencySymbol, ExchangeRates } from "../../types";
import { convertCurrency, formatCurrency } from "../../utils/currency";
import { formatPercent } from "../../utils/numbers";
import HoldingRow from "./HoldingRow";
import { useState, useMemo } from "react";
import { useTableSort } from "../../hooks/useTableSort";
import SortableTh from "../common/SortableTh";

type SortKey =
  "symbol" | "shares" | "avgCost" | "price" | "value" | "pnl" | "weight";

interface HoldingsListProps {
  holdings: Holding[];
  prices: Map<string, number>;
  displayCurrency: CurrencySymbol;
  rates: ExchangeRates;
  selectedSymbol: string | null;
  onSelect: (symbol: string) => void;
  totalCash: number;
  pricesLoading?: boolean;
}

export default function HoldingsList({
  holdings,
  prices,
  displayCurrency,
  rates,
  selectedSymbol,
  onSelect,
  totalCash,
  pricesLoading = false,
}: HoldingsListProps) {
  const [filter, setFilter] = useState("");

  const { totalPortfolioValue, totalInvested, totalPnL } = useMemo(() => {
    let value = 0;
    let invested = 0;
    for (const h of holdings) {
      const p = prices.get(h.symbol) ?? h.averageCost;
      value += convertCurrency(
        h.totalShares * p,
        h.currency,
        displayCurrency,
        rates
      );
      invested += convertCurrency(
        h.totalInvested,
        h.currency,
        displayCurrency,
        rates
      );
    }
    return {
      totalPortfolioValue: value,
      totalInvested: invested,
      totalPnL: value - invested,
    };
  }, [holdings, prices, displayCurrency, rates]);

  const totalPnLPct = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;

  const filtered = useMemo(() => {
    if (!filter) return holdings;
    const q = filter.toLowerCase();
    return holdings.filter(
      (h) =>
        h.symbol.toLowerCase().includes(q) || h.name.toLowerCase().includes(q)
    );
  }, [holdings, filter]);

  const comparators = useMemo((): Record<
    SortKey,
    (a: Holding, b: Holding) => number
  > => {
    // Compare in the display currency, as the rows show, so holdings in
    // different currencies sort correctly.
    const inDisplay = (amount: number, h: Holding) =>
      convertCurrency(amount, h.currency, displayCurrency, rates);
    const price = (h: Holding) =>
      inDisplay(prices.get(h.symbol) ?? h.averageCost, h);
    const value = (h: Holding) => h.totalShares * price(h);
    const pnl = (h: Holding) => value(h) - inDisplay(h.totalInvested, h);
    return {
      symbol: (a, b) => a.symbol.localeCompare(b.symbol),
      shares: (a, b) => a.totalShares - b.totalShares,
      avgCost: (a, b) =>
        inDisplay(a.averageCost, a) - inDisplay(b.averageCost, b),
      price: (a, b) => price(a) - price(b),
      value: (a, b) => value(a) - value(b),
      weight: (a, b) => value(a) - value(b),
      pnl: (a, b) => pnl(a) - pnl(b),
    };
  }, [prices, displayCurrency, rates]);

  const sort = useTableSort(filtered, comparators, "value");
  const sorted = sort.sorted;

  const colClass = "py-2 px-3 text-xs text-muted uppercase tracking-wide";

  return (
    <div>
      {holdings.length > 0 && (
        <div className="flex items-center justify-end gap-8 mb-3 px-3 py-3 rounded-lg bg-white/[0.03] border border-white/5">
          <div className="text-right">
            <div className="text-xs text-muted uppercase tracking-wide mb-0.5">
              Holdings Value
            </div>
            <div className="text-sm font-medium text-white">
              {formatCurrency(totalPortfolioValue, displayCurrency)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted uppercase tracking-wide mb-0.5">
              Cash
            </div>
            <div className="text-sm font-medium text-white">
              {formatCurrency(totalCash, displayCurrency)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted uppercase tracking-wide mb-0.5">
              Total Value
            </div>
            <div className="text-sm font-medium text-white">
              {formatCurrency(totalPortfolioValue + totalCash, displayCurrency)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted uppercase tracking-wide mb-0.5">
              Unrealized P&L
            </div>
            <div
              className={`text-sm font-medium ${totalPnL >= 0 ? "text-gain" : "text-loss"}`}
            >
              {formatCurrency(totalPnL, displayCurrency)}
              <span className="text-xs ml-1">{formatPercent(totalPnLPct)}</span>
            </div>
          </div>
        </div>
      )}

      <input
        type="text"
        placeholder="Search holdings..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="w-full bg-card border border-white/10 text-white text-sm rounded-lg px-3 py-2 mb-3 focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-500"
      />
      <div className="overflow-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/10">
              <SortableTh sort={sort} sortKey="symbol" className={colClass}>
                Asset
              </SortableTh>
              <SortableTh
                sort={sort}
                sortKey="shares"
                className={`${colClass} text-right`}
              >
                Shares
              </SortableTh>
              <SortableTh
                sort={sort}
                sortKey="avgCost"
                className={`${colClass} text-right`}
              >
                Avg Cost
              </SortableTh>
              <SortableTh
                sort={sort}
                sortKey="price"
                className={`${colClass} text-right`}
              >
                Price
              </SortableTh>
              <SortableTh
                sort={sort}
                sortKey="value"
                className={`${colClass} text-right`}
              >
                Value
              </SortableTh>
              <SortableTh
                sort={sort}
                sortKey="pnl"
                className={`${colClass} text-right`}
              >
                P&L
              </SortableTh>
              <SortableTh
                sort={sort}
                sortKey="weight"
                className={`${colClass} text-right`}
              >
                Weight
              </SortableTh>
            </tr>
          </thead>
          <tbody>
            {sorted.map((h) => (
              <HoldingRow
                key={`${h.accountName}-${h.symbol}`}
                holding={h}
                currentPrice={prices.get(h.symbol) ?? null}
                displayCurrency={displayCurrency}
                rates={rates}
                isSelected={selectedSymbol === h.symbol}
                onClick={() => onSelect(h.symbol)}
                totalPortfolioValue={totalPortfolioValue}
                pricesLoading={pricesLoading}
              />
            ))}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <div className="text-center text-muted py-8 text-sm">
            No holdings found
          </div>
        )}
      </div>
    </div>
  );
}
