import type {
  Account,
  BuyTransaction,
  CurrencySymbol,
  DividendTransaction,
  ExchangeRates,
  InterestTransaction,
  PortfolioData,
  SellTransaction,
  Transaction,
} from "../types";

/**
 * Builders for small, hand-checkable portfolios. Tests build data through
 * these so a change to the transaction model only needs updating here.
 */

interface SecurityOpts {
  currency?: CurrencySymbol;
  name?: string;
  country?: string;
  isin?: string;
  note?: string;
}

function securityFields(
  date: string,
  symbol: string,
  shares: number,
  price: number,
  opts: SecurityOpts
) {
  return {
    date,
    symbol,
    name: opts.name ?? symbol,
    shares,
    price,
    currency: opts.currency ?? ("$" as CurrencySymbol),
    note: opts.note ?? "",
    ...(opts.country !== undefined && { country: opts.country }),
    ...(opts.isin !== undefined && { isin: opts.isin }),
  };
}

export const buy = (
  date: string,
  symbol: string,
  shares: number,
  price: number,
  opts: SecurityOpts & { commission?: number } = {}
): BuyTransaction => ({
  type: "Buy",
  ...securityFields(date, symbol, shares, price, opts),
  commission: opts.commission ?? 0,
});

export const sell = (
  date: string,
  symbol: string,
  shares: number,
  price: number,
  opts: SecurityOpts & { tax?: number } = {}
): SellTransaction => ({
  type: "Sell",
  ...securityFields(date, symbol, shares, price, opts),
  taxWithheld: opts.tax ?? 0,
});

/** `perShare` is the dividend per share; `opts.tax` is the tax withheld. */
export const dividend = (
  date: string,
  symbol: string,
  shares: number,
  perShare: number,
  opts: SecurityOpts & { tax?: number } = {}
): DividendTransaction => ({
  type: "Dividend",
  ...securityFields(date, symbol, shares, perShare, opts),
  taxWithheld: opts.tax ?? 0,
});

export function interest(
  date: string,
  amount: number,
  opts: { tax?: number; currency?: CurrencySymbol; country?: string } = {}
): InterestTransaction {
  return {
    date,
    type: "Interest",
    amount,
    currency: opts.currency ?? "$",
    taxWithheld: opts.tax ?? 0,
    note: "Interest",
    ...(opts.country !== undefined && { country: opts.country }),
  };
}

/** The portfolio.json form of a transaction: one `fee` field for all types. */
export function toRawTransaction(tx: Transaction): Record<string, unknown> {
  if (tx.type === "Buy") {
    const { commission, ...rest } = tx;
    return { ...rest, fee: commission };
  }
  const { taxWithheld, ...rest } = tx;
  return { ...rest, fee: taxWithheld };
}

/** The portfolio.json form of a portfolio (what the loader receives). */
export function toRawPortfolio(p: PortfolioData): Record<string, unknown> {
  return {
    ...p,
    accounts: p.accounts.map((a) => ({
      ...a,
      transactions: a.transactions.map(toRawTransaction),
    })),
  };
}

export function account(
  account_name: string,
  transactions: Account["transactions"],
  currency: CurrencySymbol = "$",
  cash = 0
): Account {
  return { account_name, cash, currency, transactions };
}

export function portfolio(
  accounts: Account[],
  overrides: Partial<PortfolioData> = {}
): PortfolioData {
  return {
    updated_at: "01-01-2026",
    target_asset_class_distribution: { Stocks: 100 },
    accounts,
    watchlist: [],
    ...overrides,
  };
}

/** Value of one unit of each currency in RON, used to derive test rates. */
export const TEST_RON_VALUE: Record<CurrencySymbol, number> = {
  $: 4.5,
  "€": 5,
  RON: 1,
  DKK: 0.5,
};

/** Exchange rates consistent with TEST_RON_VALUE (1 $ = 4.5 RON, ...). */
export function makeRates(
  ronValue: Record<CurrencySymbol, number> = TEST_RON_VALUE
): ExchangeRates {
  // Units of each currency per 1 USD.
  const perUsd = (c: CurrencySymbol) => ronValue["$"] / ronValue[c];
  return {
    $: perUsd("$"),
    "€": perUsd("€"),
    RON: perUsd("RON"),
    DKK: perUsd("DKK"),
  };
}
