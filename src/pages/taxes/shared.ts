import { formatCurrency } from "../../utils/currency";

/** Shared presentation helpers for the Taxes page sections. */

/** Header cell classes for sortable columns (the button inside handles clicks). */
export const thSortable =
  "py-2 px-3 text-xs text-muted uppercase tracking-wide";

export const fmtRon = (value: number): string => formatCurrency(value, "RON");
