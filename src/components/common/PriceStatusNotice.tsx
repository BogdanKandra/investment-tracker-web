interface PriceStatusNoticeProps {
  loading: boolean;
  missing: string[];
}

/**
 * Says when live prices are loading or unavailable. Holdings without a live
 * price are valued at their average cost, so without this notice they would
 * silently show a 0% gain.
 */
export default function PriceStatusNotice({
  loading,
  missing,
}: PriceStatusNoticeProps) {
  if (missing.length > 0) {
    const list = missing.join(", ");
    return (
      <div
        role="status"
        className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-300"
      >
        No live price for {list}. {missing.length === 1 ? "It is" : "They are"}{" "}
        valued at average cost, so {missing.length === 1 ? "its" : "their"} gain
        shows as 0%.
      </div>
    );
  }
  if (loading) {
    return (
      <div role="status" className="mb-4 text-xs text-muted">
        Loading live prices…
      </div>
    );
  }
  return null;
}
