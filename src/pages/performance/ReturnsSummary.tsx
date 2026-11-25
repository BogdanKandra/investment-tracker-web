import { useMemo } from "react";
import { usePortfolio } from "../../context/usePortfolio";
import StatsCard from "../../components/common/StatsCard";
import { formatCurrency, convertCurrency } from "../../utils/currency";
import { formatPercent } from "../../utils/numbers";
import type { SellPnL } from "../../data/taxCalculator";
import type { HoldingPerf, HoldingTotals } from "./types";

interface ReturnsSummaryProps {
  holdingPerformance: HoldingPerf[];
  totals: HoldingTotals;
  sellPnLData: SellPnL[];
}

export default function ReturnsSummary({
  holdingPerformance,
  totals,
  sellPnLData,
}: ReturnsSummaryProps) {
  const { selectedAccount, currentHoldings, displayCurrency, rates } =
    usePortfolio();
  const { totalUnrealizedPnL, totalReturn } = totals;

  const realizedPnL = useMemo(() => {
    let totalGross = 0;
    let totalNet = 0;
    let winCount = 0;
    let lossCount = 0;
    for (const s of sellPnLData) {
      const gross = convertCurrency(
        s.grossProfit,
        s.currency,
        displayCurrency,
        rates
      );
      totalGross += gross;
      totalNet += convertCurrency(
        s.netProfit,
        s.currency,
        displayCurrency,
        rates
      );
      if (s.grossProfit >= 0) winCount++;
      else lossCount++;
    }
    return {
      totalGross,
      totalNet,
      winCount,
      lossCount,
      total: sellPnLData.length,
    };
  }, [sellPnLData, rates, displayCurrency]);

  const combinedPnL = totalUnrealizedPnL + realizedPnL.totalGross;
  const accountLabel = selectedAccount ?? "All Accounts";

  const gainers = holdingPerformance.filter((h) => h.pnlPct > 0).length;
  const losers = holdingPerformance.filter((h) => h.pnlPct < 0).length;
  const winRate =
    holdingPerformance.length > 0
      ? (gainers / holdingPerformance.length) * 100
      : 0;

  return (
    <div className="bg-card rounded-xl p-5 border border-white/5 mb-8">
      <h2 className="text-sm font-medium text-muted mb-4 uppercase tracking-wide">
        {accountLabel} &mdash; Returns Summary
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatsCard
          label="Unrealized P&L"
          value={formatCurrency(totalUnrealizedPnL, displayCurrency)}
          subValue={formatPercent(totalReturn)}
          trend={totalUnrealizedPnL >= 0 ? "up" : "down"}
        />
        <StatsCard
          label="Realized P&L"
          value={formatCurrency(realizedPnL.totalGross, displayCurrency)}
          subValue={`${realizedPnL.total} trades`}
          trend={realizedPnL.totalGross >= 0 ? "up" : "down"}
        />
        <StatsCard
          label="Combined P&L"
          value={formatCurrency(combinedPnL, displayCurrency)}
          trend={combinedPnL >= 0 ? "up" : "down"}
        />
        <StatsCard
          label="Win Rate (Open)"
          value={`${winRate.toFixed(0)}%`}
          subValue={`${gainers}W / ${losers}L`}
        />
        <StatsCard
          label="Win Rate (Closed)"
          value={
            realizedPnL.total > 0
              ? `${((realizedPnL.winCount / realizedPnL.total) * 100).toFixed(0)}%`
              : "—"
          }
          subValue={`${realizedPnL.winCount}W / ${realizedPnL.lossCount}L`}
        />
        <StatsCard
          label="Active Positions"
          value={currentHoldings.length.toString()}
        />
      </div>
    </div>
  );
}
