import type { Account, Holding, Transaction } from "../types";
import { computeFifo } from "./fifoCalculator";

/**
 * Group transactions by symbol within an account and compute FIFO holdings.
 */
function aggregateAccount(account: Account): Holding[] {
  const bySymbol = new Map<string, Transaction[]>();

  for (const tx of account.transactions) {
    const existing = bySymbol.get(tx.symbol) ?? [];
    existing.push(tx);
    bySymbol.set(tx.symbol, existing);
  }

  const holdings: Holding[] = [];

  for (const [symbol, txs] of bySymbol) {
    const fifo = computeFifo(txs);
    const firstName = txs.find((t) => t.type === "Buy")?.name ?? symbol;
    const currency = txs[0]?.currency ?? account.currency;

    holdings.push({
      symbol,
      name: firstName,
      currency,
      accountName: account.account_name,
      totalShares: fifo.totalShares,
      averageCost: fifo.averageCost,
      totalInvested: fifo.totalCost,
      totalFees: fifo.totalFees,
      lots: fifo.remainingLots,
      transactions: txs,
      isClosed: fifo.totalShares < 1e-9,
      realizedPnL: fifo.realizedPnL,
    });
  }

  return holdings;
}

/**
 * Get all holdings across accounts. If accountName is provided, filter to that account.
 */
export function getHoldings(
  accounts: Account[],
  accountName?: string
): Holding[] {
  const filtered = accountName
    ? accounts.filter((a) => a.account_name === accountName)
    : accounts;

  const all = filtered.flatMap(aggregateAccount);

  if (!accountName) {
    return mergeHoldingsAcrossAccounts(all);
  }
  return all;
}

/**
 * When viewing all accounts, merge holdings of the same symbol.
 */
function mergeHoldingsAcrossAccounts(holdings: Holding[]): Holding[] {
  const bySymbol = new Map<string, Holding[]>();

  for (const h of holdings) {
    const existing = bySymbol.get(h.symbol) ?? [];
    existing.push(h);
    bySymbol.set(h.symbol, existing);
  }

  const merged: Holding[] = [];

  for (const [symbol, group] of bySymbol) {
    if (group.length === 1) {
      merged.push(group[0]!);
      continue;
    }

    const totalShares = group.reduce((s, h) => s + h.totalShares, 0);
    const totalInvested = group.reduce((s, h) => s + h.totalInvested, 0);
    const totalFees = group.reduce((s, h) => s + h.totalFees, 0);
    const realizedPnL = group.reduce((s, h) => s + h.realizedPnL, 0);
    const allTxs = group.flatMap((h) => h.transactions);
    const allLots = group.flatMap((h) => h.lots);
    const isClosed = totalShares < 1e-9;

    merged.push({
      symbol,
      name: group[0]!.name,
      currency: group[0]!.currency,
      accountName: "All",
      totalShares,
      averageCost: totalShares > 0 ? totalInvested / totalShares : 0,
      totalInvested,
      totalFees,
      lots: allLots,
      transactions: allTxs,
      isClosed,
      realizedPnL,
    });
  }

  return merged;
}

export function getCurrentHoldings(
  accounts: Account[],
  accountName?: string
): Holding[] {
  return getHoldings(accounts, accountName).filter((h) => !h.isClosed);
}

export function getFormerHoldings(
  accounts: Account[],
  accountName?: string
): Holding[] {
  return getHoldings(accounts, accountName).filter((h) => h.isClosed);
}
