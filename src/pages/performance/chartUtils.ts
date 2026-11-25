/** Shared Tooltip styling for the Performance page charts. */
export const tooltipStyle = {
  contentStyle: {
    backgroundColor: "#1f2937",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "8px",
    color: "#f1f5f9",
  },
};

export function formatPortfolioDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit",
    timeZone: "UTC",
  });
}
