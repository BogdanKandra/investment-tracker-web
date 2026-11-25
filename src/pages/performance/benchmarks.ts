import type { CurrencySymbol } from "../../types";

export const BENCHMARK_CONFIG = [
  {
    id: "sp500" as const,
    label: "S&P 500",
    color: "#f59e0b",
    symbolCandidates: [
      "^GSPC",
      "SPY",
      "SPY5.DE",
      "SXR8.DE",
      "CSPX.L",
      "CSPX.AS",
      "VUAA.DE",
      "VUA1.DE",
      "VUAA.L",
      "IVV",
      "VOO",
    ],
  },
  {
    id: "nasdaq100" as const,
    label: "Nasdaq 100",
    color: "#a855f7",
    symbolCandidates: ["SXRV.DE", "^NDX", "QQQ", "CNDX.L", "SXRV.AS"],
  },
] as const;

export type BenchmarkId = (typeof BENCHMARK_CONFIG)[number]["id"];

export type ComparisonChartPoint = {
  time: string;
  value: number;
  sp500Hypothetical: number | null;
  nasdaq100Hypothetical: number | null;
};

export const BENCHMARK_HYPOTHETICAL_KEYS: Record<
  BenchmarkId,
  keyof ComparisonChartPoint
> = {
  sp500: "sp500Hypothetical",
  nasdaq100: "nasdaq100Hypothetical",
};

export type ResolvedBenchmark = {
  id: BenchmarkId;
  label: string;
  color: string;
  symbol: string;
  currency: CurrencySymbol;
  history: Array<{ time: string; close: number }>;
};
