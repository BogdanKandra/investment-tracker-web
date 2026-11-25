export interface HoldingPerf {
  symbol: string;
  name: string;
  invested: number;
  value: number;
  pnl: number;
  pnlPct: number;
  weight: number;
}

/** Totals over the current holdings, in the display currency. */
export interface HoldingTotals {
  totalInvested: number;
  totalValue: number;
  totalUnrealizedPnL: number;
  /** Unrealized return in percent. */
  totalReturn: number;
}

export interface YearlyReturn {
  year: string;
  invested: number;
  sold: number;
  dividends: number;
  realizedPnl: number;
}
