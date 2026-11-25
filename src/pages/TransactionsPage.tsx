import { useMemo, useState } from "react";
import { usePortfolio } from "../context/usePortfolio";
import { formatDateStr, parseDate } from "../utils/dates";
import { formatCurrency, convertCurrency } from "../utils/currency";
import { formatShares } from "../utils/numbers";
import StatsCard from "../components/common/StatsCard";
import CurrencySelect from "../components/common/CurrencySelect";
import SortableTh from "../components/common/SortableTh";
import { useTableSort } from "../hooks/useTableSort";
import {
  transactionCharges,
  type Transaction,
  type TransactionType,
} from "../types";

/**
 * One table row. The table mixes all transaction types, so the per-type
 * fields are flattened into optional columns.
 */
interface EnrichedTx {
  account: string;
  date: string;
  type: TransactionType;
  currency: Transaction["currency"];
  /** Broker commission (Buy only). */
  commission: number;
  /** Tax withheld at source (Sell, Dividend, Interest). */
  taxWithheld: number;
  note: string;
  symbol?: string;
  name?: string;
  shares?: number;
  price?: number;
  amount?: number;
  /** Cash moved: paid out for a buy, received for everything else. */
  total: number;
}

function toRow(tx: Transaction, account: string): EnrichedTx {
  const base = {
    account,
    date: tx.date,
    type: tx.type,
    currency: tx.currency,
    note: tx.note,
    ...transactionCharges(tx),
  };
  if (tx.type === "Interest") {
    return {
      ...base,
      amount: tx.amount,
      total: tx.amount - tx.taxWithheld,
    };
  }
  const value = tx.shares * tx.price;
  return {
    ...base,
    symbol: tx.symbol,
    name: tx.name,
    shares: tx.shares,
    price: tx.price,
    total: tx.type === "Buy" ? value + tx.commission : value - tx.taxWithheld,
  };
}

type SortKey =
  | "date"
  | "type"
  | "symbol"
  | "shares"
  | "price"
  | "commission"
  | "tax"
  | "total";

const COMPARATORS: Record<SortKey, (a: EnrichedTx, b: EnrichedTx) => number> = {
  date: (a, b) => parseDate(a.date).getTime() - parseDate(b.date).getTime(),
  type: (a, b) => a.type.localeCompare(b.type),
  symbol: (a, b) => (a.symbol ?? "").localeCompare(b.symbol ?? ""),
  shares: (a, b) => (a.shares ?? 0) - (b.shares ?? 0),
  price: (a, b) => (a.price ?? a.amount ?? 0) - (b.price ?? b.amount ?? 0),
  commission: (a, b) => a.commission - b.commission,
  tax: (a, b) => a.taxWithheld - b.taxWithheld,
  total: (a, b) => a.total - b.total,
};

export default function TransactionsPage() {
  const { portfolio, displayCurrency, rates } = usePortfolio();

  const [filterAccount, setFilterAccount] = useState<string>("__all__");
  const [filterType, setFilterType] = useState<TransactionType | "__all__">(
    "__all__"
  );
  const [filterSymbol, setFilterSymbol] = useState("");

  const allTransactions = useMemo<EnrichedTx[]>(() => {
    const txs: EnrichedTx[] = [];
    for (const acct of portfolio.accounts) {
      for (const tx of acct.transactions) {
        txs.push(toRow(tx, acct.account_name));
      }
    }
    return txs;
  }, [portfolio.accounts]);

  const filtered = useMemo(() => {
    let list = [...allTransactions];

    if (filterAccount !== "__all__") {
      list = list.filter((t) => t.account === filterAccount);
    }
    if (filterType !== "__all__") {
      list = list.filter((t) => t.type === filterType);
    }
    if (filterSymbol) {
      const q = filterSymbol.toLowerCase();
      list = list.filter(
        (t) =>
          (t.symbol ?? "").toLowerCase().includes(q) ||
          (t.name ?? t.note ?? "").toLowerCase().includes(q)
      );
    }

    return list;
  }, [allTransactions, filterAccount, filterType, filterSymbol]);

  const sort = useTableSort(filtered, COMPARATORS, "date");

  const stats = useMemo(() => {
    let totalInvested = 0;
    let totalCommission = 0;
    let totalTaxWithheld = 0;
    for (const tx of filtered) {
      totalCommission += convertCurrency(
        tx.commission,
        tx.currency,
        displayCurrency,
        rates
      );
      totalTaxWithheld += convertCurrency(
        tx.taxWithheld,
        tx.currency,
        displayCurrency,
        rates
      );
      if (tx.type === "Buy") {
        totalInvested += convertCurrency(
          (tx.shares ?? 0) * (tx.price ?? 0),
          tx.currency,
          displayCurrency,
          rates
        );
      }
    }
    return {
      totalInvested,
      totalCommission,
      totalTaxWithheld,
      count: filtered.length,
    };
  }, [filtered, displayCurrency, rates]);

  const col = "py-2 px-3 text-xs text-muted uppercase tracking-wide";
  const money = (amount: number, currency: EnrichedTx["currency"]) =>
    formatCurrency(
      convertCurrency(amount, currency, displayCurrency, rates),
      displayCurrency
    );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Transactions</h1>
        <CurrencySelect />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatsCard
          label="Total Invested"
          value={formatCurrency(stats.totalInvested, displayCurrency)}
        />
        <StatsCard
          label="Commissions"
          value={formatCurrency(stats.totalCommission, displayCurrency)}
        />
        <StatsCard
          label="Tax Withheld"
          value={formatCurrency(stats.totalTaxWithheld, displayCurrency)}
        />
        <StatsCard label="Transaction Count" value={stats.count.toString()} />
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <select
          aria-label="Filter by account"
          value={filterAccount}
          onChange={(e) => setFilterAccount(e.target.value)}
          className="bg-card border border-white/10 text-white text-sm rounded-lg px-3 py-2"
        >
          <option value="__all__">All Accounts</option>
          {portfolio.accounts.map((a) => (
            <option key={a.account_name} value={a.account_name}>
              {a.account_name}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by type"
          value={filterType}
          onChange={(e) =>
            setFilterType(e.target.value as TransactionType | "__all__")
          }
          className="bg-card border border-white/10 text-white text-sm rounded-lg px-3 py-2"
        >
          <option value="__all__">All Types</option>
          <option value="Buy">Buy</option>
          <option value="Sell">Sell</option>
          <option value="Dividend">Dividend</option>
          <option value="Interest">Interest</option>
        </select>

        <input
          type="text"
          aria-label="Search symbol or name"
          placeholder="Search symbol..."
          value={filterSymbol}
          onChange={(e) => setFilterSymbol(e.target.value)}
          className="bg-card border border-white/10 text-white text-sm rounded-lg px-3 py-2 placeholder-gray-500"
        />
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-white/5 overflow-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/10">
              <SortableTh sort={sort} sortKey="date" className={col}>
                Date
              </SortableTh>
              <SortableTh sort={sort} sortKey="type" className={col}>
                Type
              </SortableTh>
              <SortableTh sort={sort} sortKey="symbol" className={col}>
                Symbol
              </SortableTh>
              <th className={col}>Name</th>
              <SortableTh
                sort={sort}
                sortKey="shares"
                className={`${col} text-right`}
              >
                Shares
              </SortableTh>
              <SortableTh
                sort={sort}
                sortKey="price"
                className={`${col} text-right`}
              >
                Price
              </SortableTh>
              <SortableTh
                sort={sort}
                sortKey="commission"
                className={`${col} text-right`}
              >
                Commission
              </SortableTh>
              <SortableTh
                sort={sort}
                sortKey="tax"
                className={`${col} text-right`}
              >
                Tax Withheld
              </SortableTh>
              <SortableTh
                sort={sort}
                sortKey="total"
                className={`${col} text-right`}
              >
                Total
              </SortableTh>
              <th className={col}>Note</th>
            </tr>
          </thead>
          <tbody>
            {sort.sorted.map((tx, i) => {
              const typeColor =
                tx.type === "Buy"
                  ? "text-gain"
                  : tx.type === "Sell"
                    ? "text-loss"
                    : tx.type === "Interest"
                      ? "text-purple-400"
                      : "text-blue-400";
              return (
                <tr
                  key={`${tx.date}-${tx.symbol ?? tx.type}-${i}`}
                  className="border-b border-white/5 hover:bg-white/5"
                >
                  <td className="py-2.5 px-3 text-sm text-white">
                    {formatDateStr(tx.date)}
                  </td>
                  <td
                    className={`py-2.5 px-3 text-sm font-medium ${typeColor}`}
                  >
                    {tx.type}
                  </td>
                  <td className="py-2.5 px-3 text-sm text-white font-medium">
                    {tx.symbol ?? "—"}
                  </td>
                  <td className="py-2.5 px-3 text-sm text-muted truncate max-w-[150px]">
                    {tx.name ?? (tx.type === "Interest" ? tx.note : "—")}
                  </td>
                  <td className="py-2.5 px-3 text-sm text-right">
                    {tx.shares != null ? formatShares(tx.shares) : "—"}
                  </td>
                  <td className="py-2.5 px-3 text-sm text-right">
                    {tx.price != null
                      ? money(tx.price, tx.currency)
                      : tx.amount != null
                        ? money(tx.amount, tx.currency)
                        : "—"}
                  </td>
                  <td className="py-2.5 px-3 text-sm text-right text-muted">
                    {tx.commission > 0
                      ? money(tx.commission, tx.currency)
                      : "-"}
                  </td>
                  <td className="py-2.5 px-3 text-sm text-right text-muted">
                    {tx.taxWithheld > 0
                      ? money(tx.taxWithheld, tx.currency)
                      : "-"}
                  </td>
                  <td className="py-2.5 px-3 text-sm text-right">
                    {money(tx.total, tx.currency)}
                  </td>
                  <td className="py-2.5 px-3 text-sm text-muted truncate max-w-[150px]">
                    {tx.note || "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center text-muted py-8 text-sm">
            No transactions found
          </div>
        )}
      </div>
    </div>
  );
}
