import { formatCurrency } from "../../utils/currency";

/** Shared presentation helpers for the Taxes page sections. */

export const tooltipStyle = {
  contentStyle: {
    backgroundColor: "#1f2937",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "8px",
    color: "#f1f5f9",
  },
};

export const thSortable =
  "py-2 px-3 text-xs text-muted uppercase tracking-wide cursor-pointer hover:text-white select-none";

export const fmtRon = (value: number): string => formatCurrency(value, "RON");

export const W8BEN_PRE_TREATY_RATE = 0.3;
export const W8BEN_POST_TREATY_RATE = 0.1;
