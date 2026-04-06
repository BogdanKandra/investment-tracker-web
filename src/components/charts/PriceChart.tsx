import { useEffect, useRef, useState } from "react";
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type SeriesMarker,
  type Time,
  ColorType,
  CrosshairMode,
} from "lightweight-charts";
import type { Holding, TimeRange, OhlcData, MarkerData } from "../../types";
import { fetchHistoricalData } from "../../api/marketData";
import { toChartDate } from "../../utils/dates";
import { formatCurrency } from "../../utils/currency";
import { formatPercent } from "../../utils/numbers";
import StatsCard from "../common/StatsCard";

const DEFAULT_TIME_RANGES: TimeRange[] = [
  "1D", "1W", "2W", "1M", "2M", "3M", "6M", "1Y", "3Y", "5Y", "ALL",
];

interface PriceChartProps {
  holding: Holding;
  currentPrice: number | null;
  timeRanges?: TimeRange[];
}

export default function PriceChart({ holding, currentPrice, timeRanges = DEFAULT_TIME_RANGES }: PriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const [range, setRange] = useState<TimeRange>("6M");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#9ca3af",
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.03)" },
        horzLines: { color: "rgba(255,255,255,0.03)" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.1)",
      },
      timeScale: {
        borderColor: "rgba(255,255,255,0.1)",
        timeVisible: range === "1D" || range === "1W",
      },
      width: chartContainerRef.current.clientWidth,
      height: 400,
    });

    const series = chart.addCandlestickSeries({
      upColor: "#16a34a",
      downColor: "#dc2626",
      borderDownColor: "#dc2626",
      borderUpColor: "#16a34a",
      wickDownColor: "#dc2626",
      wickUpColor: "#16a34a",
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [range]);

  useEffect(() => {
    if (!seriesRef.current) return;

    let cancelled = false;
    setLoading(true);

    fetchHistoricalData(holding.symbol, range).then((data) => {
      if (cancelled || !seriesRef.current) return;
      setLoading(false);

      const chartData: CandlestickData<Time>[] = data.map((d: OhlcData) => ({
        time: d.time as Time,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      }));

      seriesRef.current.setData(chartData);

      const markers = buildMarkers(holding, data);
      seriesRef.current.setMarkers(markers);

      chartRef.current?.timeScale().fitContent();
    });

    return () => {
      cancelled = true;
    };
  }, [holding.symbol, range, holding]);

  const price = currentPrice ?? holding.averageCost;
  const marketValue = holding.totalShares * price;
  const unrealizedPnL = marketValue - holding.totalInvested;
  const unrealizedPct =
    holding.totalInvested > 0
      ? (unrealizedPnL / holding.totalInvested) * 100
      : 0;
  const txCount = holding.transactions.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-white">
            {holding.symbol}
          </h2>
          <p className="text-sm text-muted">{holding.name}</p>
        </div>
        {currentPrice != null && (
          <div className="text-right">
            <div className="text-lg font-semibold text-white">
              {formatCurrency(currentPrice, holding.currency)}
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-1 mb-4 flex-wrap">
        {timeRanges.map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
              range === r
                ? "bg-blue-600 text-white"
                : "bg-white/5 text-muted hover:text-white hover:bg-white/10"
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      <div className="relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface/50 z-10">
            <div className="text-muted text-sm">Loading chart...</div>
          </div>
        )}
        <div ref={chartContainerRef} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
        <StatsCard
          label="Total Invested"
          value={formatCurrency(holding.totalInvested, holding.currency)}
        />
        <StatsCard
          label="Market Value"
          value={formatCurrency(marketValue, holding.currency)}
        />
        <StatsCard
          label="Unrealized P&L"
          value={formatCurrency(unrealizedPnL, holding.currency)}
          subValue={formatPercent(unrealizedPct)}
          trend={unrealizedPnL >= 0 ? "up" : "down"}
        />
        <StatsCard
          label="Transactions"
          value={txCount.toString()}
        />
      </div>
    </div>
  );
}

function buildMarkers(
  holding: Holding,
  chartData: OhlcData[]
): SeriesMarker<Time>[] {
  if (chartData.length === 0) return [];

  const chartDates = new Set(chartData.map((d) => d.time));
  const markers: MarkerData[] = [];

  for (const tx of holding.transactions) {
    if (tx.type === "Dividend") continue;
    const txDate = toChartDate(tx.date);

    let closestDate = txDate;
    if (!chartDates.has(txDate)) {
      let minDiff = Infinity;
      for (const cd of chartDates) {
        const diff = Math.abs(
          new Date(cd).getTime() - new Date(txDate).getTime()
        );
        if (diff < minDiff) {
          minDiff = diff;
          closestDate = cd;
        }
      }
    }

    if (tx.type === "Buy") {
      markers.push({
        time: closestDate,
        position: "belowBar",
        color: "#16a34a",
        shape: "arrowUp",
        text: `Buy ${tx.shares}@${tx.price.toFixed(2)}`,
      });
    } else if (tx.type === "Sell") {
      markers.push({
        time: closestDate,
        position: "aboveBar",
        color: "#dc2626",
        shape: "arrowDown",
        text: `Sell ${tx.shares}@${tx.price.toFixed(2)}`,
      });
    }
  }

  markers.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));

  return markers as SeriesMarker<Time>[];
}
