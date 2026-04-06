import { useState, useEffect, useMemo } from "react";
import { usePortfolio } from "../context/PortfolioContext";
import AccountSelect from "../components/common/AccountSelect";
import CurrencySelect from "../components/common/CurrencySelect";
import HoldingsList from "../components/holdings/HoldingsList";
import FormerHoldings from "../components/holdings/FormerHoldings";
import PriceChart from "../components/charts/PriceChart";
import { fetchCurrentPrices } from "../api/marketData";
import type { TimeRange } from "../types";

const HOLDINGS_TIME_RANGES: TimeRange[] = [
  "1M", "2M", "3M", "6M", "1Y", "3Y", "5Y", "ALL",
];

export default function HoldingsPage() {
  const {
    currentHoldings,
    formerHoldings,
    displayCurrency,
    rates,
  } = usePortfolio();

  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [prices, setPrices] = useState<Map<string, number>>(new Map());

  const allSymbols = useMemo(() => {
    const set = new Set<string>();
    for (const h of currentHoldings) set.add(h.symbol);
    for (const h of formerHoldings) set.add(h.symbol);
    return Array.from(set);
  }, [currentHoldings, formerHoldings]);

  useEffect(() => {
    if (allSymbols.length === 0) return;
    fetchCurrentPrices(allSymbols).then(setPrices).catch(() => {});
  }, [allSymbols]);

  const selectedHolding = useMemo(() => {
    if (!selectedSymbol) return null;
    return (
      currentHoldings.find((h) => h.symbol === selectedSymbol) ??
      formerHoldings.find((h) => h.symbol === selectedSymbol) ??
      null
    );
  }, [selectedSymbol, currentHoldings, formerHoldings]);

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full overflow-hidden">
      {/* Left Panel */}
      <div className="lg:w-[55%] shrink-0 overflow-y-auto min-h-0">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-white">Holdings</h1>
          <div className="flex gap-3">
            <AccountSelect />
            <CurrencySelect />
          </div>
        </div>

        <HoldingsList
          holdings={currentHoldings}
          prices={prices}
          displayCurrency={displayCurrency}
          rates={rates}
          selectedSymbol={selectedSymbol}
          onSelect={setSelectedSymbol}
        />

        <FormerHoldings
          holdings={formerHoldings}
          displayCurrency={displayCurrency}
          rates={rates}
          selectedSymbol={selectedSymbol}
          onSelect={setSelectedSymbol}
        />
      </div>

      {/* Right Panel */}
      <div className="flex-1 min-w-0">
        {selectedHolding ? (
          <div className="bg-card rounded-xl p-5 border border-white/5">
            <PriceChart
              holding={selectedHolding}
              currentPrice={prices.get(selectedHolding.symbol) ?? null}
              timeRanges={HOLDINGS_TIME_RANGES}
            />
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-white/5 h-full min-h-[400px] flex items-center justify-center">
            <div className="text-center text-muted">
              <div className="text-4xl mb-3">📈</div>
              <div className="text-sm">
                Select a holding to view its price chart
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
