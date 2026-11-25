export type SecurityTransactionType = "Buy" | "Sell" | "Dividend";
export type TransactionType = SecurityTransactionType | "Interest";
/** Every supported currency. Adding one here (plus its ISO code in
 *  utils/currency.ts and a fallback rate) is all a new currency needs. */
export const CURRENCY_SYMBOLS = ["$", "€", "RON", "DKK"] as const;
export type CurrencySymbol = (typeof CURRENCY_SYMBOLS)[number];

/*
 * In data/portfolio.json every transaction has a single `fee` field. Its
 * meaning depends on the type, so the loader (data/validatePortfolio.ts)
 * maps it to a named field:
 *   Buy                     -> commission  (broker fee, money paid out)
 *   Sell, Dividend, Interest -> taxWithheld (income tax kept at source)
 */

interface TransactionBase {
  date: string; // DD-MM-YYYY
  currency: CurrencySymbol;
  note: string;
  country?: string; // Country of incorporation/domicile
}

interface SecurityFields {
  symbol: string;
  name: string;
  shares: number;
  price: number;
  isin?: string; // ISO 6166, e.g. "US0378331005"
}

export interface BuyTransaction extends TransactionBase, SecurityFields {
  type: "Buy";
  /** Broker commission paid on top of shares * price. */
  commission: number;
}

export interface SellTransaction extends TransactionBase, SecurityFields {
  type: "Sell";
  /** Income tax on the gain, withheld by the broker. */
  taxWithheld: number;
}

/** `shares` is the number of shares held, `price` the dividend per share. */
export interface DividendTransaction extends TransactionBase, SecurityFields {
  type: "Dividend";
  /** Dividend tax withheld at source. */
  taxWithheld: number;
}

/** A transaction on a security. */
export type SecurityTransaction =
  BuyTransaction | SellTransaction | DividendTransaction;

/** Interest paid on cash held at the broker. */
export interface InterestTransaction extends TransactionBase {
  type: "Interest";
  amount: number;
  /** Income tax withheld at source. */
  taxWithheld: number;
}

/** Narrow on `type` to get the matching fields. */
export type Transaction = SecurityTransaction | InterestTransaction;

/** Commission paid (Buy) or tax withheld (others), for generic displays. */
export function transactionCharges(tx: Transaction): {
  commission: number;
  taxWithheld: number;
} {
  return tx.type === "Buy"
    ? { commission: tx.commission, taxWithheld: 0 }
    : { commission: 0, taxWithheld: tx.taxWithheld };
}

export function isSecurityTransaction(
  tx: Transaction
): tx is SecurityTransaction {
  return tx.type !== "Interest";
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
  commission: number;
}

export interface Holding {
  symbol: string;
  name: string;
  currency: CurrencySymbol;
  accountName: string;
  totalShares: number;
  averageCost: number;
  totalInvested: number;
  /** Commissions paid on buys. */
  totalCommission: number;
  /** Income tax withheld on sells. */
  totalTaxWithheld: number;
  lots: FifoLot[];
  transactions: SecurityTransaction[];
  isClosed: boolean;
  realizedPnL: number;
}

/**
 * How many units of each currency one US dollar buys ("$" is always 1).
 * Any pair converts through USD, so a new currency needs one entry here.
 */
export type ExchangeRates = Record<CurrencySymbol, number>;

/** Where the current exchange rates came from. */
export interface RatesStatus {
  source: "loading" | "live" | "fallback";
  /** Date the rates apply to (YYYY-MM-DD), when known. */
  asOf: string | null;
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
