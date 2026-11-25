import { useMemo, useState } from "react";
import { usePortfolio } from "../../context/usePortfolio";
import {
  formatCurrency,
  convertCurrency,
  currencyLabel,
} from "../../utils/currency";
import { formatDateStr, parseDate } from "../../utils/dates";
import { AVERAGE_YEARLY_RATES_TO_RON } from "../../data/taxCalculator";
import type { CurrencySymbol } from "../../types";
import { useTableSort } from "../../hooks/useTableSort";
import { thSortable, fmtRon } from "./shared";

export default function InterestTaxesSection() {
  const { portfolio, rates } = usePortfolio();
  const currentYear = new Date().getFullYear();

  // --- Interest Taxes section ---
  const interestTaxYears = useMemo(() => {
    const years = new Set<number>();
    for (const account of portfolio.accounts) {
      for (const tx of account.transactions) {
        if (tx.type === "Interest") {
          const year = parseDate(tx.date).getFullYear();
          years.add(year + 1);
        }
      }
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [portfolio.accounts]);

  const [interestTaxYear, setInterestTaxYear] = useState<number>(
    interestTaxYears.includes(currentYear)
      ? currentYear
      : (interestTaxYears[0] ?? currentYear)
  );

  const interestTaxPrevYear = interestTaxYear - 1;

  interface InterestRow {
    date: string;
    account: string;
    country: string;
    grossAmount: number;
    fee: number;
    netAmount: number;
    currency: CurrencySymbol;
    grossAmountRon: number;
    feeRon: number;
    netAmountRon: number;
    note: string;
  }

  const interestRows = useMemo((): InterestRow[] => {
    const rows: InterestRow[] = [];
    for (const account of portfolio.accounts) {
      for (const tx of account.transactions) {
        if (tx.type !== "Interest") continue;
        const txYear = parseDate(tx.date).getFullYear();
        if (txYear !== interestTaxPrevYear) continue;
        const gross = tx.amount;
        const net = gross - tx.fee;
        const country = tx.country ?? "Other";

        const rateKey = `${currencyLabel(tx.currency)}_${interestTaxPrevYear}`;
        const yearlyRate = AVERAGE_YEARLY_RATES_TO_RON[rateKey];
        const toRon = (amount: number): number => {
          if (tx.currency === "RON") return amount;
          if (yearlyRate) return amount * yearlyRate;
          return convertCurrency(amount, tx.currency, "RON", rates);
        };

        rows.push({
          date: tx.date,
          account: account.account_name,
          country,
          grossAmount: gross,
          fee: tx.fee,
          netAmount: net,
          currency: tx.currency,
          grossAmountRon: toRon(gross),
          feeRon: toRon(tx.fee),
          netAmountRon: toRon(net),
          note: tx.note,
        });
      }
    }
    rows.sort(
      (a, b) => parseDate(a.date).getTime() - parseDate(b.date).getTime()
    );
    return rows;
  }, [portfolio.accounts, interestTaxPrevYear, rates]);

  const interestTotals = useMemo(() => {
    let grossRon = 0;
    let feeRon = 0;
    let netRon = 0;
    for (const r of interestRows) {
      grossRon += r.grossAmountRon;
      feeRon += r.feeRon;
      netRon += r.netAmountRon;
    }
    return { grossRon, feeRon, netRon };
  }, [interestRows]);

  interface InterestCountrySummary {
    country: string;
    grossRon: number;
    feeRon: number;
    netRon: number;
    count: number;
  }

  const interestCountryBreakdown = useMemo((): InterestCountrySummary[] => {
    const map = new Map<string, InterestCountrySummary>();
    for (const r of interestRows) {
      const entry = map.get(r.country) ?? {
        country: r.country,
        grossRon: 0,
        feeRon: 0,
        netRon: 0,
        count: 0,
      };
      entry.grossRon += r.grossAmountRon;
      entry.feeRon += r.feeRon;
      entry.netRon += r.netAmountRon;
      entry.count += 1;
      map.set(r.country, entry);
    }
    return Array.from(map.values()).sort((a, b) => b.grossRon - a.grossRon);
  }, [interestRows]);

  const INTEREST_TAX_RATE = 0.1;

  const interestTaxDue = useMemo(() => {
    let totalTax = 0;
    for (const r of interestRows) {
      const potentialTax = r.grossAmount * INTEREST_TAX_RATE;
      if (potentialTax > 0.5) {
        totalTax += r.grossAmountRon * INTEREST_TAX_RATE;
      }
    }
    return totalTax;
  }, [interestRows]);

  // --- Interest table sorting ---
  type IntSortKey = "date" | "account" | "country" | "gross" | "fee" | "net";
  const intComparators = useMemo(
    () => ({
      date: (a: InterestRow, b: InterestRow) =>
        parseDate(a.date).getTime() - parseDate(b.date).getTime(),
      account: (a: InterestRow, b: InterestRow) =>
        a.account.localeCompare(b.account),
      country: (a: InterestRow, b: InterestRow) =>
        a.country.localeCompare(b.country),
      gross: (a: InterestRow, b: InterestRow) =>
        a.grossAmountRon - b.grossAmountRon,
      fee: (a: InterestRow, b: InterestRow) => a.feeRon - b.feeRon,
      net: (a: InterestRow, b: InterestRow) => a.netAmountRon - b.netAmountRon,
    }),
    []
  );
  const intSort = useTableSort(
    interestRows,
    intComparators as Record<
      IntSortKey,
      (a: InterestRow, b: InterestRow) => number
    >,
    "date" as IntSortKey
  );

  if (interestTaxYears.length === 0) return null;

  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">
            Interest Income Taxes
          </h2>
          <p className="text-sm text-muted mt-1">
            Interest income received in {interestTaxPrevYear}, to be declared
            for {interestTaxYear} taxes. Income tax rate:{" "}
            <span className="text-white">10%</span> (waived when tax &le; 0.5
            currency units per payment).
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted">
          Tax year
          <select
            value={interestTaxYear}
            onChange={(e) => setInterestTaxYear(Number(e.target.value))}
            className="bg-card border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {interestTaxYears.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Interest table */}
      <div className="bg-card rounded-xl border border-white/5 overflow-auto mb-6">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/10">
              <th
                className={thSortable}
                onClick={() => intSort.handleSort("date")}
              >
                Date{intSort.arrow("date")}
              </th>
              <th
                className={thSortable}
                onClick={() => intSort.handleSort("account")}
              >
                Account{intSort.arrow("account")}
              </th>
              <th
                className={thSortable}
                onClick={() => intSort.handleSort("country")}
              >
                Country{intSort.arrow("country")}
              </th>
              <th className="py-2 px-3 text-xs text-muted uppercase tracking-wide">
                Note
              </th>
              <th
                className={`${thSortable} text-right`}
                onClick={() => intSort.handleSort("gross")}
              >
                Gross{intSort.arrow("gross")}
              </th>
              <th
                className={`${thSortable} text-right`}
                onClick={() => intSort.handleSort("fee")}
              >
                Income Tax{intSort.arrow("fee")}
              </th>
              <th
                className={`${thSortable} text-right`}
                onClick={() => intSort.handleSort("net")}
              >
                Net{intSort.arrow("net")}
              </th>
            </tr>
          </thead>
          <tbody>
            {intSort.sorted.map((r, i) => {
              const potentialTax = r.grossAmount * INTEREST_TAX_RATE;
              const taxWaived = potentialTax <= 0.5;
              return (
                <tr
                  key={`${r.date}-${r.account}-${i}`}
                  className="border-b border-white/5 hover:bg-white/5"
                >
                  <td className="py-2.5 px-3 text-sm text-white whitespace-nowrap">
                    {formatDateStr(r.date)}
                  </td>
                  <td className="py-2.5 px-3 text-sm text-muted">
                    {r.account}
                  </td>
                  <td className="py-2.5 px-3 text-sm text-muted">
                    {r.country}
                  </td>
                  <td className="py-2.5 px-3 text-sm text-muted truncate max-w-[180px]">
                    {r.note || "—"}
                  </td>
                  <td className="py-2.5 px-3 text-sm text-right text-white">
                    {formatCurrency(r.grossAmount, r.currency)}
                  </td>
                  <td className="py-2.5 px-3 text-sm text-right text-loss">
                    {taxWaived ? (
                      <span
                        className="text-muted"
                        title="Tax waived (≤ 0.5 currency units)"
                      >
                        waived
                      </span>
                    ) : (
                      formatCurrency(r.fee, r.currency)
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-sm text-right text-gain">
                    {formatCurrency(r.netAmount, r.currency)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {interestRows.length > 0 && (
            <tfoot>
              <tr className="bg-white/5">
                <td
                  colSpan={4}
                  className="py-2.5 px-3 text-sm font-semibold text-white text-right"
                >
                  Total for {interestTaxPrevYear} (RON)
                </td>
                <td className="py-2.5 px-3 text-sm text-right text-white font-semibold">
                  {fmtRon(interestTotals.grossRon)}
                </td>
                <td className="py-2.5 px-3 text-sm text-right text-loss font-medium">
                  {fmtRon(interestTotals.feeRon)}
                </td>
                <td className="py-2.5 px-3 text-sm text-right text-gain font-semibold">
                  {fmtRon(interestTotals.netRon)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
        {interestRows.length === 0 && (
          <div className="text-center text-muted py-8 text-sm">
            No interest transactions in {interestTaxPrevYear}
          </div>
        )}
      </div>

      {/* Country breakdown */}
      {interestCountryBreakdown.length > 0 && (
        <div className="bg-card rounded-xl p-5 border border-white/5 mb-6">
          <h3 className="text-sm font-medium text-muted mb-4 uppercase tracking-wide">
            Interest by Country of Origin (RON)
          </h3>
          <div className="space-y-4">
            {interestCountryBreakdown.map((cs) => (
              <div
                key={cs.country}
                className="border-b border-white/5 pb-4 last:border-0 last:pb-0"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white font-medium">{cs.country}</span>
                  <span className="text-white font-semibold">
                    {fmtRon(cs.grossRon)} gross
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <span className="text-muted">Payments:</span>{" "}
                    <span className="text-white">{cs.count}</span>
                  </div>
                  <div>
                    <span className="text-muted">Gross:</span>{" "}
                    <span className="text-white">{fmtRon(cs.grossRon)}</span>
                  </div>
                  <div>
                    <span className="text-muted">Tax paid:</span>{" "}
                    <span className="text-loss">{fmtRon(cs.feeRon)}</span>
                  </div>
                  <div>
                    <span className="text-muted">Net:</span>{" "}
                    <span className="text-gain">{fmtRon(cs.netRon)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Interest tax due summary */}
      <div className="bg-card rounded-xl p-5 border border-white/5 mb-6">
        <h3 className="text-sm font-medium text-muted mb-4 uppercase tracking-wide">
          Interest Tax Summary for {interestTaxYear}
        </h3>
        <div className="space-y-3">
          <div className="flex items-start justify-between p-3 rounded-lg bg-white/5 gap-4">
            <div className="flex-1 min-w-0">
              <div className="text-white font-medium text-sm">
                Income tax on interest (10%)
              </div>
              <div className="text-xs text-muted mt-0.5">
                Applied to each interest payment where 10% exceeds 0.5 currency
                units. Payments below this threshold are tax-exempt.
              </div>
              <div className="text-xs text-muted mt-1">
                <span className="text-white">Must declare</span>
                <span className="mx-2">·</span>
                Gross total: {fmtRon(interestTotals.grossRon)}
                <span className="mx-2">·</span>
                Already withheld: {fmtRon(interestTotals.feeRon)}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div
                className={`text-lg font-bold ${
                  interestTaxDue > 0 ? "text-loss" : "text-gain"
                }`}
              >
                {interestTaxDue > 0 ? fmtRon(interestTaxDue) : "—"}
              </div>
              <div className="text-xs text-muted">
                {interestTaxDue > 0 ? "total tax" : "nothing additional to pay"}
              </div>
            </div>
          </div>
        </div>
        <div className="border-t border-white/10 mt-4 pt-4 flex items-baseline justify-between">
          <span className="text-muted uppercase text-xs tracking-wide">
            Net interest income (contributes to CASS base)
          </span>
          <span className="text-white text-2xl font-bold">
            {fmtRon(interestTotals.netRon)}
          </span>
        </div>
      </div>
    </section>
  );
}
