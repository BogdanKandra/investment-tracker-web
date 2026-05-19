import { useEffect, useMemo, useState } from "react";
import { usePortfolio } from "../context/PortfolioContext";
import { fetchCurrentPrices } from "../api/marketData";
import { formatCurrency } from "../utils/currency";
import PriceChart from "../components/charts/PriceChart";
import type { Holding, TimeRange } from "../types";

const WATCHLIST_TIME_RANGES: TimeRange[] = [
  "1D", "1W", "2W", "1M", "2M", "3M", "6M", "1Y", "2Y", "3Y", "5Y", "ALL",
];

export default function WatchlistPage() {
  const { portfolio } = usePortfolio();
  const [prices, setPrices] = useState<Map<string, number>>(new Map());
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);

  const symbols = useMemo(
    () => portfolio.watchlist.map((w) => w.symbol),
    [portfolio.watchlist]
  );

  useEffect(() => {
    if (symbols.length === 0) return;
    fetchCurrentPrices(symbols).then(setPrices).catch(() => {});
  }, [symbols]);

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
        totalFees: 0,
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
                <th className="py-2 px-4 text-xs text-muted uppercase tracking-wide">
                  Symbol
                </th>
                <th className="py-2 px-3 text-xs text-muted uppercase tracking-wide">
                  Currency
                </th>
                <th className="py-2 px-3 text-xs text-muted uppercase tracking-wide text-right">
                  Price
                </th>
                <th className="py-2 px-3 text-xs text-muted uppercase tracking-wide">
                  Note
                </th>
              </tr>
            </thead>
            <tbody>
              {portfolio.watchlist.map((item) => {
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
                      {price != null
                        ? formatCurrency(price, item.currency)
                        : "..."}
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
