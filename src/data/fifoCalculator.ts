import type { Transaction, FifoLot } from "../types";
import { parseDate } from "../utils/dates";

export interface FifoResult {
  remainingLots: FifoLot[];
  totalShares: number;
  totalCost: number;
  averageCost: number;
  realizedPnL: number;
  totalFees: number;
}

/**
 * Compute FIFO cost basis from a list of buy/sell transactions for a single symbol.
 * Dividend transactions are ignored for cost basis purposes.
 */
export function computeFifo(transactions: Transaction[]): FifoResult {
  const sorted = [...transactions]
    .filter((t) => t.type === "Buy" || t.type === "Sell")
    .sort((a, b) => parseDate(a.date).getTime() - parseDate(b.date).getTime());

  const lots: FifoLot[] = [];
  let realizedPnL = 0;
  let totalFees = 0;

  for (const tx of sorted) {
    totalFees += tx.fee;

    if (tx.type === "Buy") {
      lots.push({
        date: tx.date,
        shares: tx.shares,
        price: tx.price,
        fee: tx.fee,
      });
    } else {
      let sharesToSell = tx.shares;
      const sellPrice = tx.price;

      while (sharesToSell > 0 && lots.length > 0) {
        const lot = lots[0]!;
        const sellFromLot = Math.min(lot.shares, sharesToSell);
        realizedPnL += sellFromLot * (sellPrice - lot.price);
        lot.shares -= sellFromLot;
        sharesToSell -= sellFromLot;

        if (lot.shares <= 1e-9) {
          lots.shift();
        }
      }
      realizedPnL -= tx.fee;
    }
  }

  const totalShares = lots.reduce((s, l) => s + l.shares, 0);
  const totalCost = lots.reduce((s, l) => s + l.shares * l.price, 0);
  const averageCost = totalShares > 0 ? totalCost / totalShares : 0;

  return { remainingLots: lots, totalShares, totalCost, averageCost, realizedPnL, totalFees };
}
