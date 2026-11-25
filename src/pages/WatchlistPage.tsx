import { useMemo, useState } from "react";
import { usePortfolio } from "../context/usePortfolio";
import { useCurrentPrices } from "../hooks/useCurrentPrices";
import { formatCurrency } from "../utils/currency";
import PriceChart from "../components/charts/PriceChart";
import type { Holding, TimeRange, WatchlistItem } from "../types";
import { useTableSort } from "../hooks/useTableSort";
import SortableTh from "../components/common/SortableTh";

const WATCHLIST_TIME_RANGES: TimeRange[] = [
  "1D",
  "1W",
  "2W",
  "1M",
  "2M",
  "3M",
  "6M",
  "1Y",
  "2Y",
  "3Y",
  "5Y",
  "ALL",
];

export default function WatchlistPage() {
  const { portfolio } = usePortfolio();
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);

  const symbols = useMemo(
    () => portfolio.watchlist.map((w) => w.symbol),
    [portfolio.watchlist]
  );
  const { prices, loading: pricesLoading } = useCurrentPrices(symbols);

  type WatchSortKey = "symbol" | "currency" | "price";
  const watchComparators = useMemo(
    () => ({
      symbol: (a: WatchlistItem, b: WatchlistItem) =>
        a.symbol.localeCompare(b.symbol),
      currency: (a: WatchlistItem, b: WatchlistItem) =>
        a.currency.localeCompare(b.currency),
      price: (a: WatchlistItem, b: WatchlistItem) =>
        (prices.get(a.symbol) ?? 0) - (prices.get(b.symbol) ?? 0),
    }),
    [prices]
  );
  const watchSort = useTableSort(
    portfolio.watchlist,
    watchComparators as Record<
      WatchSortKey,
      (a: WatchlistItem, b: WatchlistItem) => number
    >,
    "symbol" as WatchSortKey,
    true
  );

  const selectedItem = useMemo(
    () =>
      selectedSymbol
        ? portfolio.watchlist.find((w) => w.symbol === selectedSymbol)
        : null,
    [selectedSymbol, portfolio.watchlist]
  );

  const pseudoHolding: Holding | null = selectedItem
    ? {
        symbol: selectedItem.symbol,
        name: selectedItem.symbol,
        currency: selectedItem.currency,
        accountName: "Watchlist",
        totalShares: 0,
        averageCost: 0,
        totalInvested: 0,
        totalCommission: 0,
        totalTaxWithheld: 0,
        lots: [],
        transactions: [],
        isClosed: false,
        realizedPnL: 0,
      }
    : null;

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full overflow-hidden">
      {/* Left Panel */}
      <div className="lg:w-[45%] shrink-0 overflow-y-auto min-h-0">
        <h1 className="text-2xl font-bold text-white mb-6">Watchlist</h1>

        <div className="bg-card rounded-xl border border-white/5 overflow-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/10">
                <SortableTh
                  sort={watchSort}
                  sortKey="symbol"
                  className="py-2 px-4 text-xs text-muted uppercase tracking-wide"
                >
                  Symbol
                </SortableTh>
                <SortableTh
                  sort={watchSort}
                  sortKey="currency"
                  className="py-2 px-3 text-xs text-muted uppercase tracking-wide"
                >
                  Currency
                </SortableTh>
                <SortableTh
                  sort={watchSort}
                  sortKey="price"
                  className="py-2 px-3 text-xs text-muted uppercase tracking-wide text-right"
                >
                  Price
                </SortableTh>
                <th className="py-2 px-3 text-xs text-muted uppercase tracking-wide">
                  Note
                </th>
              </tr>
            </thead>
            <tbody>
              {watchSort.sorted.map((item) => {
                const price = prices.get(item.symbol);
                return (
                  <tr
                    key={item.symbol}
                    onClick={() => setSelectedSymbol(item.symbol)}
                    className={`cursor-pointer border-b border-white/5 transition-colors ${
                      selectedSymbol === item.symbol
                        ? "bg-blue-500/10"
                        : "hover:bg-white/5"
                    }`}
                  >
                    <td className="py-3 px-4 text-sm font-medium text-white">
                      {item.symbol}
                    </td>
                    <td className="py-3 px-3 text-sm text-muted">
                      {item.currency}
                    </td>
                    <td className="py-3 px-3 text-sm text-right">
                      {price != null ? (
                        formatCurrency(price, item.currency)
                      ) : pricesLoading ? (
                        "…"
                      ) : (
                        <span
                          className="text-amber-300"
                          title="Live price unavailable"
                        >
                          n/a
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-sm text-muted truncate max-w-[200px]">
                      {item.note}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {portfolio.watchlist.length === 0 && (
            <div className="text-center text-muted py-8 text-sm">
              Watchlist is empty
            </div>
          )}
        </div>
      </div>

      {/* Right Panel */}
      <div className="flex-1 min-w-0">
        {pseudoHolding && selectedItem ? (
          <div className="bg-card rounded-xl p-5 border border-white/5">
            <PriceChart
              holding={pseudoHolding}
              currentPrice={prices.get(selectedItem.symbol) ?? null}
              timeRanges={WATCHLIST_TIME_RANGES}
            />
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-white/5 h-full min-h-[400px] flex items-center justify-center">
            <div className="text-center text-muted">
              <div className="text-4xl mb-3">👁</div>
              <div className="text-sm">
                Select a watchlist item to view its chart
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
