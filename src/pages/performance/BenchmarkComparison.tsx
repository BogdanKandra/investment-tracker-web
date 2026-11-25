import { useState, useEffect } from "react";
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  LineChart,
  Line,
} from "recharts";
import { usePortfolio } from "../../context/usePortfolio";
import { formatCurrency } from "../../utils/currency";
import {
  fetchBenchmarkCloses,
  fetchHistoricalCloses,
} from "../../api/marketData";
import type { Account, CurrencySymbol } from "../../types";
import {
  BENCHMARK_CONFIG,
  BENCHMARK_HYPOTHETICAL_KEYS,
  type BenchmarkId,
  type ComparisonChartPoint,
  type ResolvedBenchmark,
} from "./benchmarks";
import { formatPortfolioDate, tooltipStyle } from "./chartUtils";
import {
  buildShareLedger,
  computePortfolioValueAt,
  findComparisonStart,
  getLastKnownClose,
  scaledBenchmarkValue,
} from "./valuation";

const PORTFOLIO_VALUE_PIXELS_PER_POINT = 12;

interface BenchmarkComparisonProps {
  filteredAccounts: Account[];
}

/**
 * Weekly portfolio market value vs. what it would be worth had it tracked
 * each benchmark since the comparison start. Fetches its own price history.
 */
export default function BenchmarkComparison({
  filteredAccounts,
}: BenchmarkComparisonProps) {
  const { displayCurrency, rates } = usePortfolio();

  const [comparisonChartData, setComparisonChartData] = useState<
    ComparisonChartPoint[]
  >([]);
  const [resolvedBenchmarks, setResolvedBenchmarks] = useState<
    ResolvedBenchmark[]
  >([]);
  const [portfolioValueLoading, setPortfolioValueLoading] = useState(false);
  const [benchmarkVisibility, setBenchmarkVisibility] = useState<
    Record<BenchmarkId, boolean>
  >({
    sp500: true,
    nasdaq100: true,
  });
  const [comparisonStartTime, setComparisonStartTime] = useState<string | null>(
    null
  );

  useEffect(() => {
    const symbolCurrencies = new Map<string, CurrencySymbol>();
    for (const acct of filteredAccounts) {
      for (const tx of acct.transactions) {
        if ((tx.type === "Buy" || tx.type === "Sell") && tx.symbol) {
          symbolCurrencies.set(tx.symbol, tx.currency);
        }
      }
    }

    const syms = Array.from(symbolCurrencies.keys());
    if (syms.length === 0) {
      setComparisonChartData([]);
      setResolvedBenchmarks([]);
      return;
    }

    const ledger = buildShareLedger(filteredAccounts);
    let cancelled = false;

    setPortfolioValueLoading(true);

    const holdingFetches = syms.map((sym) =>
      fetchHistoricalCloses(sym, "1wk").then((data) => ({ sym, data }))
    );
    const benchmarkFetches = BENCHMARK_CONFIG.map((bench) =>
      fetchBenchmarkCloses([...bench.symbolCandidates], "1wk").then(
        (result) => ({
          config: bench,
          result,
        })
      )
    );

    Promise.all([
      Promise.allSettled(holdingFetches),
      Promise.all(benchmarkFetches),
    ])
      .then(([holdingResults, benchmarkResults]) => {
        if (cancelled) return;

        const priceHistories = new Map<
          string,
          Array<{ time: string; close: number }>
        >();
        for (const r of holdingResults) {
          if (r.status === "fulfilled" && r.value.data.length > 0) {
            priceHistories.set(r.value.sym, r.value.data);
          }
        }

        const benchmarks: ResolvedBenchmark[] = [];
        for (const { config, result } of benchmarkResults) {
          if (!result) continue;
          benchmarks.push({
            id: config.id,
            label: config.label,
            color: config.color,
            symbol: result.symbol,
            currency: result.currency,
            history: result.data,
          });
        }

        const allTimeKeys = new Set<string>();
        for (const history of priceHistories.values()) {
          for (const { time } of history) allTimeKeys.add(time);
        }
        for (const bench of benchmarks) {
          for (const { time } of bench.history) allTimeKeys.add(time);
        }

        const sortedKeys = Array.from(allTimeKeys).sort();

        const startPoint = findComparisonStart(
          sortedKeys,
          syms,
          priceHistories,
          ledger,
          symbolCurrencies,
          displayCurrency,
          rates,
          benchmarks
        );
        if (!startPoint) {
          setComparisonChartData([]);
          setResolvedBenchmarks(benchmarks);
          setComparisonStartTime(null);
          setPortfolioValueLoading(false);
          return;
        }

        const baselineAmount = startPoint.value;

        const benchmarkStartCloses = new Map<BenchmarkId, number>();
        for (const bench of benchmarks) {
          const startClose = getLastKnownClose(bench.history, startPoint.time);
          if (startClose != null)
            benchmarkStartCloses.set(bench.id, startClose);
        }

        const comparisonTimeline: ComparisonChartPoint[] = [];
        for (const timeKey of sortedKeys) {
          if (timeKey < startPoint.time) continue;

          const portfolioValue = computePortfolioValueAt(
            timeKey,
            syms,
            priceHistories,
            ledger,
            symbolCurrencies,
            displayCurrency,
            rates,
            false
          );
          if (portfolioValue == null) continue;

          const row: ComparisonChartPoint = {
            time: timeKey,
            value: portfolioValue,
            sp500Hypothetical: null,
            nasdaq100Hypothetical: null,
          };

          for (const bench of benchmarks) {
            const startClose = benchmarkStartCloses.get(bench.id);
            if (startClose == null) continue;

            const close = getLastKnownClose(bench.history, timeKey);
            const scaled = scaledBenchmarkValue(
              close,
              startClose,
              baselineAmount
            );
            if (bench.id === "sp500") {
              row.sp500Hypothetical = scaled;
            } else {
              row.nasdaq100Hypothetical = scaled;
            }
          }

          comparisonTimeline.push(row);
        }

        setComparisonChartData(comparisonTimeline);
        setResolvedBenchmarks(benchmarks);
        setComparisonStartTime(startPoint.time);
        setPortfolioValueLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setPortfolioValueLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [filteredAccounts, displayCurrency, rates]);

  return (
    <div className="bg-card rounded-xl p-5 border border-white/5 mb-8">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-sm font-medium text-muted uppercase tracking-wide">
            Portfolio vs Benchmarks
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Total market value of all holdings from the selected account,
            sampled weekly.
          </p>
          <p className="text-xs text-muted/70 mt-1">
            Portfolio value includes deposits and withdrawals over time, so
            benchmark comparison is indicative rather than a formal
            time-weighted return.
          </p>
          {comparisonStartTime && comparisonChartData.length > 0 && (
            <p className="text-xs text-muted/70 mt-1">
              Comparison starts {formatPortfolioDate(comparisonStartTime)} at{" "}
              {formatCurrency(comparisonChartData[0]!.value, displayCurrency)}{" "}
              (first week with full portfolio valuation and benchmark data).
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {BENCHMARK_CONFIG.map((config) => {
            const resolved = resolvedBenchmarks.find((b) => b.id === config.id);
            return (
              <label
                key={config.id}
                className={`flex items-center gap-2 text-xs cursor-pointer select-none ${
                  resolved ? "text-muted" : "text-muted/40"
                }`}
              >
                <input
                  type="checkbox"
                  checked={benchmarkVisibility[config.id]}
                  disabled={!resolved}
                  onChange={(e) =>
                    setBenchmarkVisibility((prev) => ({
                      ...prev,
                      [config.id]: e.target.checked,
                    }))
                  }
                  className="rounded border-white/20 bg-transparent disabled:opacity-40"
                  style={{ accentColor: config.color }}
                />
                {config.label}
                {resolved ? ` (${resolved.symbol})` : " — unavailable"}
              </label>
            );
          })}
        </div>
      </div>

      <div className="mb-4 rounded-lg border border-white/5 bg-white/[0.02] px-4 py-3 text-xs text-muted/80">
        <p>
          Portfolio shows your actual weekly market value. Each benchmark line
          shows what your portfolio would be worth if it had grown at the
          benchmark&apos;s price return since the comparison start: starting
          portfolio value × (benchmark price this week ÷ benchmark price at
          start). Example: if your portfolio was{" "}
          {formatCurrency(10000, displayCurrency)} at the start and the
          benchmark rose 20%, that line reads{" "}
          {formatCurrency(12000, displayCurrency)}.
        </p>
      </div>

      {portfolioValueLoading ? (
        <div className="flex items-center justify-center py-16 gap-2 text-muted text-sm">
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          Loading price history…
        </div>
      ) : comparisonChartData.length === 0 ? (
        <div className="text-muted text-sm text-center py-10">
          No data available
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div
            style={{
              width: Math.max(
                600,
                comparisonChartData.length * PORTFOLIO_VALUE_PIXELS_PER_POINT
              ),
              minWidth: "100%",
            }}
          >
            <ResponsiveContainer width="100%" height={280}>
              <LineChart
                data={comparisonChartData}
                margin={{ top: 8, right: 12, left: 4, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.05)"
                />
                <XAxis
                  dataKey="time"
                  tick={{ fill: "#9ca3af", fontSize: 11 }}
                  stroke="rgba(255,255,255,0.1)"
                  minTickGap={60}
                  tickFormatter={(v: string) => formatPortfolioDate(v)}
                />
                <YAxis
                  tick={{ fill: "#9ca3af", fontSize: 11 }}
                  stroke="rgba(255,255,255,0.1)"
                  width={80}
                  domain={["auto", "auto"]}
                  tickFormatter={(v: number) => {
                    if (Math.abs(v) >= 1_000_000)
                      return `${(v / 1_000_000).toFixed(1)}M`;
                    if (Math.abs(v) >= 1_000)
                      return `${(v / 1_000).toFixed(0)}K`;
                    return String(Math.round(v));
                  }}
                />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(v: number, name: string) => {
                    if (v == null || Number.isNaN(v)) return ["—", name];
                    return [formatCurrency(v, displayCurrency), name];
                  }}
                  labelFormatter={(label: string) => formatPortfolioDate(label)}
                />
                <Legend wrapperStyle={{ color: "#9ca3af", fontSize: 12 }} />
                <Line
                  type="monotone"
                  dataKey="value"
                  name="Portfolio"
                  stroke="#3b82f6"
                  strokeWidth={2.5}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
                {resolvedBenchmarks
                  .filter((bench) => benchmarkVisibility[bench.id])
                  .map((bench) => (
                    <Line
                      key={bench.id}
                      type="monotone"
                      dataKey={BENCHMARK_HYPOTHETICAL_KEYS[bench.id]}
                      name={`${bench.label} (${bench.symbol})`}
                      stroke={bench.color}
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                  ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
