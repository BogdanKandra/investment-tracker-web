/** Parse DD-MM-YYYY string into a Date object */
export function parseDate(dateStr: string): Date {
  const [day, month, year] = dateStr.split("-").map(Number);
  return new Date(year!, month! - 1, day);
}

/** Format a Date as YYYY-MM-DD (for lightweight-charts and APIs) */
export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Convert DD-MM-YYYY to YYYY-MM-DD */
export function toChartDate(dateStr: string): string {
  return toIsoDate(parseDate(dateStr));
}

/** Format Date as a readable string */
export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Format DD-MM-YYYY string as readable */
export function formatDateStr(dateStr: string): string {
  return formatDate(parseDate(dateStr));
}

/** Get a Date that is `days` days before today */
export function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

/** Map time range keys to number of calendar days */
export function timeRangeToDays(
  range: string
): number | null {
  const map: Record<string, number> = {
    "1D": 1,
    "1W": 7,
    "2W": 14,
    "1M": 30,
    "2M": 60,
    "3M": 90,
    "6M": 180,
    "1Y": 365,
    "2Y": 730,
    "3Y": 1095,
    "5Y": 1825,
  };
  return map[range] ?? null;
}
