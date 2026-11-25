import { usePortfolio } from "../../context/usePortfolio";
import { formatDateStr } from "../../utils/dates";
import type { RatesStatus } from "../../types";

function RatesBadge({ status }: { status: RatesStatus }) {
  if (status.source === "loading") {
    return <span className="text-muted">FX: loading rates…</span>;
  }
  if (status.source === "fallback") {
    return (
      <span
        className="text-amber-300"
        title="Live exchange rates could not be loaded. Converted amounts use built-in rates and may be off."
      >
        FX: built-in fallback rates (may be outdated)
      </span>
    );
  }
  return (
    <span className="text-muted">
      FX: live rates{status.asOf ? ` (${status.asOf})` : ""}
    </span>
  );
}

export default function Header() {
  const { portfolio, ratesStatus } = usePortfolio();

  return (
    <header className="h-14 bg-card border-b border-white/5 flex items-center justify-between px-6">
      <div />
      <div className="flex items-center gap-4 text-sm text-muted" role="status">
        <RatesBadge status={ratesStatus} />
        <span>Data updated: {formatDateStr(portfolio.updated_at)}</span>
      </div>
    </header>
  );
}
