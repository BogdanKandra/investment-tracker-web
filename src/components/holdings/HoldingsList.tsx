import type { Holding, CurrencySymbol, ExchangeRates } from "../../types";
import { convertCurrency, formatCurrency } from "../../utils/currency";
import { formatPercent } from "../../utils/numbers";
import HoldingRow from "./HoldingRow";
import { useState, useMemo } from "react";

type SortKey =
  | "symbol"
  | "shares"
  | "avgCost"
  | "price"
  | "value"
  | "pnl"
  | "weight";

interface HoldingsListProps {
  holdings: Holding[];
  prices: Map<string, number>;
  displayCurrency: CurrencySymbol;
  rates: ExchangeRates;
  selectedSymbol: string | null;
  onSelect: (symbol: string) => void;
  totalCash: number;
}

export default function HoldingsList({
  holdings,
  prices,
  displayCurrency,
  rates,
  selectedSymbol,
  onSelect,
  totalCash,
}: HoldingsListProps) {
  const [sortKey, setSortKey] = useState<SortKey>("value");
  const [sortAsc, setSortAsc] = useState(false);
  const [filter, setFilter] = useState("");

  const { totalPortfolioValue, totalInvested, totalPnL } = useMemo(() => {
    let value = 0;
    let invested = 0;
    for (const h of holdings) {
      const p = prices.get(h.symbol) ?? h.averageCost;
      value += convertCurrency(h.totalShares * p, h.currency, displayCurrency, rates);
      invested += convertCurrency(h.totalInvested, h.currency, displayCurrency, rates);
    }
    return { totalPortfolioValue: value, totalInvested: invested, totalPnL: value - invested };
  }, [holdings, prices, displayCurrency, rates]);

  const totalPnLPct = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;


  const sorted = useMemo(() => {
    let list = [...holdings];

    if (filter) {
      const q = filter.toLowerCase();
      list = list.filter(
        (h) =>
          h.symbol.toLowerCase().includes(q) ||
          h.name.toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      const priceA = prices.get(a.symbol) ?? a.averageCost;
      const priceB = prices.get(b.symbol) ?? b.averageCost;
      let cmp = 0;

      switch (sortKey) {
        case "symbol":
          cmp = a.symbol.localeCompare(b.symbol);
          break;
        case "shares":
          cmp = a.totalShares - b.totalShares;
          break;
        case "avgCost":
          cmp = a.averageCost - b.averageCost;
          break;
        case "price":
          cmp = priceA - priceB;
          break;
        case "value":
        case "weight":
          cmp =
            convertCurrency(a.totalShares * priceA, a.currency, displayCurrency, rates) -
            convertCurrency(b.totalShares * priceB, b.currency, displayCurrency, rates);
          break;
        case "pnl": {
          const pnlA =
            a.totalShares * priceA - a.totalInvested;
          const pnlB =
            b.totalShares * priceB - b.totalInvested;
          cmp = pnlA - pnlB;
          break;
        }
      }
      return sortAsc ? cmp : -cmp;
    });

    return list;
  }, [holdings, sortKey, sortAsc, filter, prices, displayCurrency, rates]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  const colClass =
    "py-2 px-3 text-xs text-muted uppercase tracking-wide cursor-pointer hover:text-white select-none";
  const arrow = (key: SortKey) =>
    sortKey === key ? (sortAsc ? " ↑" : " ↓") : "";

  return (
    <div>
      {holdings.length > 0 && (
        <div className="flex items-center justify-end gap-8 mb-3 px-3 py-3 rounded-lg bg-white/[0.03] border border-white/5">
          <div className="text-right">
            <div className="text-xs text-muted uppercase tracking-wide mb-0.5">Holdings Value</div>
            <div className="text-sm font-medium text-white">
              {formatCurrency(totalPortfolioValue, displayCurrency)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted uppercase tracking-wide mb-0.5">Cash</div>
            <div className="text-sm font-medium text-white">
              {formatCurrency(totalCash, displayCurrency)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted uppercase tracking-wide mb-0.5">Total Value</div>
            <div className="text-sm font-medium text-white">
              {formatCurrency(totalPortfolioValue + totalCash, displayCurrency)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted uppercase tracking-wide mb-0.5">Unrealized P&L</div>
            <div className={`text-sm font-medium ${totalPnL >= 0 ? "text-gain" : "text-loss"}`}>
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
              <th className={colClass} onClick={() => handleSort("symbol")}>
                Asset{arrow("symbol")}
              </th>
              <th
                className={`${colClass} text-right`}
                onClick={() => handleSort("shares")}
              >
                Shares{arrow("shares")}
              </th>
              <th
                className={`${colClass} text-right`}
                onClick={() => handleSort("avgCost")}
              >
                Avg Cost{arrow("avgCost")}
              </th>
              <th
                className={`${colClass} text-right`}
                onClick={() => handleSort("price")}
              >
                Price{arrow("price")}
              </th>
              <th
                className={`${colClass} text-right`}
                onClick={() => handleSort("value")}
              >
                Value{arrow("value")}
              </th>
              <th
                className={`${colClass} text-right`}
                onClick={() => handleSort("pnl")}
              >
                P&L{arrow("pnl")}
              </th>
              <th
                className={`${colClass} text-right`}
                onClick={() => handleSort("weight")}
              >
                Weight{arrow("weight")}
              </th>
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
