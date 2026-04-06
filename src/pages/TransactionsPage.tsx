import { useMemo, useState } from "react";
import { usePortfolio } from "../context/PortfolioContext";
import { formatDateStr, parseDate } from "../utils/dates";
import { formatCurrency, convertCurrency } from "../utils/currency";
import { formatShares, formatNumber } from "../utils/numbers";
import StatsCard from "../components/common/StatsCard";
import CurrencySelect from "../components/common/CurrencySelect";
import type { Transaction, TransactionType, CurrencySymbol } from "../types";

interface EnrichedTx extends Transaction {
  account: string;
  total: number;
}

type SortKey =
  | "date"
  | "type"
  | "symbol"
  | "shares"
  | "price"
  | "fee"
  | "total";

export default function TransactionsPage() {
  const { portfolio, displayCurrency, rates } = usePortfolio();

  const [filterAccount, setFilterAccount] = useState<string>("__all__");
  const [filterType, setFilterType] = useState<TransactionType | "__all__">(
    "__all__"
  );
  const [filterSymbol, setFilterSymbol] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortAsc, setSortAsc] = useState(false);

  const allTransactions = useMemo<EnrichedTx[]>(() => {
    const txs: EnrichedTx[] = [];
    for (const acct of portfolio.accounts) {
      for (const tx of acct.transactions) {
        txs.push({
          ...tx,
          account: acct.account_name,
          total: tx.shares * tx.price + tx.fee,
        });
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
          t.symbol.toLowerCase().includes(q) ||
          t.name.toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "date":
          cmp =
            parseDate(a.date).getTime() - parseDate(b.date).getTime();
          break;
        case "type":
          cmp = a.type.localeCompare(b.type);
          break;
        case "symbol":
          cmp = a.symbol.localeCompare(b.symbol);
          break;
        case "shares":
          cmp = a.shares - b.shares;
          break;
        case "price":
          cmp = a.price - b.price;
          break;
        case "fee":
          cmp = a.fee - b.fee;
          break;
        case "total":
          cmp = a.total - b.total;
          break;
      }
      return sortAsc ? cmp : -cmp;
    });

    return list;
  }, [allTransactions, filterAccount, filterType, filterSymbol, sortKey, sortAsc]);

  const stats = useMemo(() => {
    let totalInvested = 0;
    let totalFees = 0;
    for (const tx of filtered) {
      totalFees += convertCurrency(tx.fee, tx.currency, displayCurrency, rates);
      if (tx.type === "Buy") {
        totalInvested += convertCurrency(
          tx.shares * tx.price,
          tx.currency,
          displayCurrency,
          rates
        );
      }
    }
    return { totalInvested, totalFees, count: filtered.length };
  }, [filtered, displayCurrency, rates]);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  const col =
    "py-2 px-3 text-xs text-muted uppercase tracking-wide cursor-pointer hover:text-white select-none";
  const arrow = (key: SortKey) =>
    sortKey === key ? (sortAsc ? " ↑" : " ↓") : "";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Transactions</h1>
        <CurrencySelect />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatsCard
          label="Total Invested"
          value={formatCurrency(stats.totalInvested, displayCurrency)}
        />
        <StatsCard
          label="Total Fees"
          value={formatCurrency(stats.totalFees, displayCurrency)}
        />
        <StatsCard label="Transaction Count" value={stats.count.toString()} />
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <select
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
        </select>

        <input
          type="text"
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
              <th className={col} onClick={() => handleSort("date")}>
                Date{arrow("date")}
              </th>
              <th className={col} onClick={() => handleSort("type")}>
                Type{arrow("type")}
              </th>
              <th className={col} onClick={() => handleSort("symbol")}>
                Symbol{arrow("symbol")}
              </th>
              <th className={col}>Name</th>
              <th
                className={`${col} text-right`}
                onClick={() => handleSort("shares")}
              >
                Shares{arrow("shares")}
              </th>
              <th
                className={`${col} text-right`}
                onClick={() => handleSort("price")}
              >
                Price{arrow("price")}
              </th>
              <th
                className={`${col} text-right`}
                onClick={() => handleSort("fee")}
              >
                Fee{arrow("fee")}
              </th>
              <th
                className={`${col} text-right`}
                onClick={() => handleSort("total")}
              >
                Total{arrow("total")}
              </th>
              <th className={col}>Note</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((tx, i) => {
              const typeColor =
                tx.type === "Buy"
                  ? "text-gain"
                  : tx.type === "Sell"
                    ? "text-loss"
                    : "text-blue-400";
              return (
                <tr
                  key={`${tx.date}-${tx.symbol}-${i}`}
                  className="border-b border-white/5 hover:bg-white/5"
                >
                  <td className="py-2.5 px-3 text-sm text-white">
                    {formatDateStr(tx.date)}
                  </td>
                  <td className={`py-2.5 px-3 text-sm font-medium ${typeColor}`}>
                    {tx.type}
                  </td>
                  <td className="py-2.5 px-3 text-sm text-white font-medium">
                    {tx.symbol}
                  </td>
                  <td className="py-2.5 px-3 text-sm text-muted truncate max-w-[150px]">
                    {tx.name}
                  </td>
                  <td className="py-2.5 px-3 text-sm text-right">
                    {formatShares(tx.shares)}
                  </td>
                  <td className="py-2.5 px-3 text-sm text-right">
                    {formatCurrency(convertCurrency(tx.price, tx.currency, displayCurrency, rates), displayCurrency)}
                  </td>
                  <td className="py-2.5 px-3 text-sm text-right text-muted">
                    {tx.fee > 0 ? formatCurrency(convertCurrency(tx.fee, tx.currency, displayCurrency, rates), displayCurrency) : "-"}
                  </td>
                  <td className="py-2.5 px-3 text-sm text-right">
                    {formatCurrency(convertCurrency(tx.total, tx.currency, displayCurrency, rates), displayCurrency)}
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
