export type TransactionType = "Buy" | "Sell" | "Dividend";
export type CurrencySymbol = "$" | "€" | "RON" | "DKK";

export interface Transaction {
  date: string; // DD-MM-YYYY
  type: TransactionType;
  symbol: string;
  name: string;
  shares: number;
  price: number;
  currency: CurrencySymbol;
  fee: number;
  note: string;
  isin?: string; // ISO 6166, e.g. "US0378331005"
  country?: string; // Country of incorporation/domicile
}

export interface Account {
  account_name: string;
  cash: number;
  currency: CurrencySymbol;
  transactions: Transaction[];
}

export interface WatchlistItem {
  symbol: string;
  currency: CurrencySymbol;
  note: string;
}

export interface PortfolioData {
  updated_at: string;
  /** Date (DD-MM-YYYY) when the W-8BEN tax treaty was activated, reducing
   *  US dividend withholding from 30% to 10%. */
  w_8ben_activated_at?: string;
  target_asset_class_distribution: Record<string, number>;
  accounts: Account[];
  watchlist: WatchlistItem[];
}

export interface FifoLot {
  date: string;
  shares: number;
  price: number;
  fee: number;
}

export interface Holding {
  symbol: string;
  name: string;
  currency: CurrencySymbol;
  accountName: string;
  totalShares: number;
  averageCost: number;
  totalInvested: number;
  totalFees: number;
  lots: FifoLot[];
  transactions: Transaction[];
  isClosed: boolean;
  realizedPnL: number;
}

export interface ExchangeRates {
  USD_EUR: number;
  USD_RON: number;
  USD_DKK: number;
  EUR_RON: number;
  EUR_USD: number;
  EUR_DKK: number;
  RON_USD: number;
  RON_EUR: number;
  RON_DKK: number;
  DKK_USD: number;
  DKK_EUR: number;
  DKK_RON: number;
}

export type TimeRange =
  | "1D"
  | "1W"
  | "2W"
  | "1M"
  | "2M"
  | "3M"
  | "6M"
  | "1Y"
  | "2Y"
  | "3Y"
  | "5Y"
  | "ALL";

export interface OhlcData {
  time: string | number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface MarkerData {
  time: string;
  position: "aboveBar" | "belowBar";
  color: string;
  shape: "arrowDown" | "arrowUp";
  text: string;
}
