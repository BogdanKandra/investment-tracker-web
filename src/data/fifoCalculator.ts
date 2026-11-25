import type {
  Transaction,
  BuyTransaction,
  SellTransaction,
  FifoLot,
} from "../types";
import { parseDate } from "../utils/dates";

/** Shares below this are treated as zero (float residue from fractional shares). */
const EPSILON = 1e-9;

export interface SellMatch {
  tx: SellTransaction;
  /** Shares actually matched against open lots (less than tx.shares when overselling). */
  matchedShares: number;
  /** Purchase cost of the matched shares, in the transaction currency. */
  costBasis: number;
}

export interface FifoMatch {
  /** Lots still open after all sells, oldest first. */
  openLots: FifoLot[];
  /** One entry per sell, in date order. */
  sells: SellMatch[];
}

/**
 * The single FIFO implementation: replays buys and sells of one symbol in
 * date order and matches each sell against the oldest open lots. Other
 * transaction types are ignored. Input order does not matter.
 */
export function matchFifo(transactions: readonly Transaction[]): FifoMatch {
  const sorted = transactions
    .filter(
      (t): t is BuyTransaction | SellTransaction =>
        t.type === "Buy" || t.type === "Sell"
    )
    .sort((a, b) => parseDate(a.date).getTime() - parseDate(b.date).getTime());

  const openLots: FifoLot[] = [];
  const sells: SellMatch[] = [];

  for (const tx of sorted) {
    if (tx.type === "Buy") {
      openLots.push({
        date: tx.date,
        shares: tx.shares,
        price: tx.price,
        commission: tx.commission,
      });
      continue;
    }

    let remaining = tx.shares;
    let costBasis = 0;
    while (remaining > EPSILON && openLots.length > 0) {
      const lot = openLots[0]!;
      const take = Math.min(lot.shares, remaining);
      costBasis += take * lot.price;
      lot.shares -= take;
      remaining -= take;
      if (lot.shares <= EPSILON) openLots.shift();
    }
    sells.push({ tx, matchedShares: tx.shares - remaining, costBasis });
  }

  return { openLots, sells };
}

export interface FifoResult {
  remainingLots: FifoLot[];
  totalShares: number;
  totalCost: number;
  averageCost: number;
  realizedPnL: number;
  /** Commissions paid on buys. */
  totalCommission: number;
  /** Income tax withheld on sells. */
  totalTaxWithheld: number;
}

/**
 * FIFO cost basis and realized P&L for the transactions of a single symbol.
 * Realized P&L is net of the tax withheld on sells; dividends are ignored.
 */
export function computeFifo(transactions: readonly Transaction[]): FifoResult {
  const { openLots, sells } = matchFifo(transactions);

  let totalCommission = 0;
  let totalTaxWithheld = 0;
  for (const t of transactions) {
    if (t.type === "Buy") totalCommission += t.commission;
    else if (t.type === "Sell") totalTaxWithheld += t.taxWithheld;
  }

  let realizedPnL = 0;
  for (const s of sells) {
    realizedPnL += s.matchedShares * s.tx.price - s.costBasis - s.tx.taxWithheld;
  }

  const totalShares = openLots.reduce((s, l) => s + l.shares, 0);
  const totalCost = openLots.reduce((s, l) => s + l.shares * l.price, 0);
  const averageCost = totalShares > 0 ? totalCost / totalShares : 0;

  return {
    remainingLots: openLots,
    totalShares,
    totalCost,
    averageCost,
    realizedPnL,
    totalCommission,
    totalTaxWithheld,
  };
}
