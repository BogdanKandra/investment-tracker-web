import { useMemo, useState } from "react";
import { usePortfolio } from "../../context/usePortfolio";
import StatsCard from "../../components/common/StatsCard";
import {
  formatCurrency,
  convertCurrency,
  currencyLabel,
} from "../../utils/currency";
import { formatDateStr, parseDate } from "../../utils/dates";
import { formatShares } from "../../utils/numbers";
import type { SellPnL } from "../../data/taxCalculator";
import type { CurrencySymbol } from "../../types";
import { useTableSort } from "../../hooks/useTableSort";
import { thSortable } from "./shared";
import SortableTh from "../../components/common/SortableTh";

export default function SellPnlSection({ sells }: { sells: SellPnL[] }) {
  const { rates } = usePortfolio();

  const sellYears = useMemo(() => {
    const s = new Set<number>(sells.map((x) => x.year));
    return Array.from(s).sort((a, b) => b - a);
  }, [sells]);

  const currentYear = new Date().getFullYear();
  const [pnlYear, setPnlYear] = useState<number>(
    sellYears.includes(currentYear)
      ? currentYear
      : (sellYears[0] ?? currentYear)
  );

  const filteredSells = useMemo(
    () => sells.filter((s) => s.year === pnlYear),
    [sells, pnlYear]
  );

  const [pnlCurrency, setPnlCurrency] = useState<CurrencySymbol>("RON");

  const pnlTotals = useMemo(() => {
    let gross = 0;
    let net = 0;
    let fees = 0;
    for (const s of filteredSells) {
      gross += convertCurrency(s.grossProfit, s.currency, pnlCurrency, rates);
      net += convertCurrency(s.netProfit, s.currency, pnlCurrency, rates);
      fees += convertCurrency(s.taxWithheld, s.currency, pnlCurrency, rates);
    }
    return { gross, net, fees };
  }, [filteredSells, pnlCurrency, rates]);

  // --- Sell P&L table sorting ---
  type SellSortKey =
    | "date"
    | "symbol"
    | "account"
    | "shares"
    | "sellValue"
    | "costBasis"
    | "fee"
    | "grossProfit"
    | "netProfit";
  const sellComparators = useMemo(
    () => ({
      date: (a: (typeof filteredSells)[0], b: (typeof filteredSells)[0]) =>
        parseDate(a.date).getTime() - parseDate(b.date).getTime(),
      symbol: (a: (typeof filteredSells)[0], b: (typeof filteredSells)[0]) =>
        a.symbol.localeCompare(b.symbol),
      account: (a: (typeof filteredSells)[0], b: (typeof filteredSells)[0]) =>
        a.account.localeCompare(b.account),
      shares: (a: (typeof filteredSells)[0], b: (typeof filteredSells)[0]) =>
        a.shares - b.shares,
      sellValue: (a: (typeof filteredSells)[0], b: (typeof filteredSells)[0]) =>
        a.sellValueRon - b.sellValueRon,
      costBasis: (a: (typeof filteredSells)[0], b: (typeof filteredSells)[0]) =>
        a.costBasisRon - b.costBasisRon,
      fee: (a: (typeof filteredSells)[0], b: (typeof filteredSells)[0]) =>
        a.taxWithheldRon - b.taxWithheldRon,
      grossProfit: (
        a: (typeof filteredSells)[0],
        b: (typeof filteredSells)[0]
      ) => a.grossProfitRon - b.grossProfitRon,
      netProfit: (a: (typeof filteredSells)[0], b: (typeof filteredSells)[0]) =>
        a.netProfitRon - b.netProfitRon,
    }),
    []
  );
  const sellSort = useTableSort(
    filteredSells,
    sellComparators as Record<
      SellSortKey,
      (a: (typeof filteredSells)[0], b: (typeof filteredSells)[0]) => number
    >,
    "date" as SellSortKey
  );

  const fmtPnl = (value: number): string => formatCurrency(value, pnlCurrency);

  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">
            Realised Profit &amp; Loss
          </h2>
          <p className="text-sm text-muted mt-1">
            Gross vs net (after income tax) profit for every sell transaction.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-2 text-sm text-muted">
            Currency
            <select
              value={pnlCurrency}
              onChange={(e) => setPnlCurrency(e.target.value as CurrencySymbol)}
              className="bg-card border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {(["RON", "$", "€"] as const).map((c) => (
                <option key={c} value={c}>
                  {currencyLabel(c)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-muted">
            Year
            <select
              value={pnlYear}
              onChange={(e) => setPnlYear(Number(e.target.value))}
              className="bg-card border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {sellYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <StatsCard
          label="Sell Transactions (incl. losses)"
          value={filteredSells.length.toString()}
        />
        <StatsCard label="Income Tax Paid" value={fmtPnl(pnlTotals.fees)} />
        <StatsCard
          label="Gross Profit"
          value={fmtPnl(pnlTotals.gross)}
          trend={pnlTotals.gross >= 0 ? "up" : "down"}
        />
        <StatsCard
          label="Net Profit"
          value={fmtPnl(pnlTotals.net)}
          trend={pnlTotals.net >= 0 ? "up" : "down"}
        />
      </div>

      <div className="bg-card rounded-xl border border-white/5 overflow-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/10">
              <SortableTh sort={sellSort} sortKey="date" className={thSortable}>
                Date
              </SortableTh>
              <SortableTh
                sort={sellSort}
                sortKey="symbol"
                className={thSortable}
              >
                Symbol
              </SortableTh>
              <th className="py-2 px-3 text-xs text-muted uppercase tracking-wide">
                Name
              </th>
              <SortableTh
                sort={sellSort}
                sortKey="account"
                className={thSortable}
              >
                Account
              </SortableTh>
              <SortableTh
                sort={sellSort}
                sortKey="shares"
                className={`${thSortable} text-right`}
              >
                Shares
              </SortableTh>
              <SortableTh
                sort={sellSort}
                sortKey="sellValue"
                className={`${thSortable} text-right`}
              >
                Sell Value
              </SortableTh>
              <SortableTh
                sort={sellSort}
                sortKey="costBasis"
                className={`${thSortable} text-right`}
              >
                Cost Basis
              </SortableTh>
              <SortableTh
                sort={sellSort}
                sortKey="fee"
                className={`${thSortable} text-right`}
              >
                Income Tax
              </SortableTh>
              <SortableTh
                sort={sellSort}
                sortKey="grossProfit"
                className={`${thSortable} text-right`}
              >
                Gross Profit
              </SortableTh>
              <SortableTh
                sort={sellSort}
                sortKey="netProfit"
                className={`${thSortable} text-right`}
              >
                Net Profit
              </SortableTh>
            </tr>
          </thead>
          <tbody>
            {sellSort.sorted.map((s, i) => (
              <tr
                key={`${s.date}-${s.symbol}-${s.account}-${i}`}
                className="border-b border-white/5 hover:bg-white/5"
              >
                <td className="py-2.5 px-3 text-sm text-white whitespace-nowrap">
                  {formatDateStr(s.date)}
                </td>
                <td className="py-2.5 px-3 text-sm text-white font-medium">
                  {s.symbol}
                </td>
                <td className="py-2.5 px-3 text-sm text-muted truncate max-w-[150px]">
                  {s.name}
                </td>
                <td className="py-2.5 px-3 text-sm text-muted">{s.account}</td>
                <td className="py-2.5 px-3 text-sm text-right">
                  {formatShares(s.shares)}
                </td>
                <td className="py-2.5 px-3 text-sm text-right">
                  {fmtPnl(
                    convertCurrency(s.sellValue, s.currency, pnlCurrency, rates)
                  )}
                </td>
                <td className="py-2.5 px-3 text-sm text-right text-muted">
                  {fmtPnl(
                    convertCurrency(s.costBasis, s.currency, pnlCurrency, rates)
                  )}
                </td>
                <td className="py-2.5 px-3 text-sm text-right text-muted">
                  {s.taxWithheld > 0
                    ? fmtPnl(
                        convertCurrency(
                          s.taxWithheld,
                          s.currency,
                          pnlCurrency,
                          rates
                        )
                      )
                    : "-"}
                </td>
                <td
                  className={`py-2.5 px-3 text-sm text-right font-medium ${
                    s.grossProfit >= 0 ? "text-gain" : "text-loss"
                  }`}
                >
                  {fmtPnl(
                    convertCurrency(
                      s.grossProfit,
                      s.currency,
                      pnlCurrency,
                      rates
                    )
                  )}
                </td>
                <td
                  className={`py-2.5 px-3 text-sm text-right font-medium ${
                    s.netProfit >= 0 ? "text-gain" : "text-loss"
                  }`}
                >
                  {fmtPnl(
                    convertCurrency(s.netProfit, s.currency, pnlCurrency, rates)
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          {filteredSells.length > 0 && (
            <tfoot>
              <tr className="bg-white/5">
                <td
                  colSpan={7}
                  className="py-2.5 px-3 text-sm font-semibold text-white text-right"
                >
                  Total for {pnlYear} ({currencyLabel(pnlCurrency)})
                </td>
                <td className="py-2.5 px-3 text-sm text-right text-muted font-medium">
                  {fmtPnl(pnlTotals.fees)}
                </td>
                <td
                  className={`py-2.5 px-3 text-sm text-right font-semibold ${
                    pnlTotals.gross >= 0 ? "text-gain" : "text-loss"
                  }`}
                >
                  {fmtPnl(pnlTotals.gross)}
                </td>
                <td
                  className={`py-2.5 px-3 text-sm text-right font-semibold ${
                    pnlTotals.net >= 0 ? "text-gain" : "text-loss"
                  }`}
                >
                  {fmtPnl(pnlTotals.net)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
        {filteredSells.length === 0 && (
          <div className="text-center text-muted py-8 text-sm">
            No sell transactions in {pnlYear}
          </div>
        )}
      </div>
    </section>
  );
}
