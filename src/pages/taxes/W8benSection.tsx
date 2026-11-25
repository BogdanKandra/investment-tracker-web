import { useMemo } from "react";
import { usePortfolio } from "../../context/usePortfolio";
import StatsCard from "../../components/common/StatsCard";
import { convertCurrency } from "../../utils/currency";
import { formatDateStr, parseDate } from "../../utils/dates";
import { useTableSort } from "../../hooks/useTableSort";
import { thSortable, fmtRon } from "./shared";
import {
  W8BEN_PRE_TREATY_RATE,
  W8BEN_POST_TREATY_RATE,
} from "../../data/taxCalculator";
import SortableTh from "../../components/common/SortableTh";

export default function W8benSection({
  w8benDate,
}: {
  w8benDate: Date | null;
}) {
  const { portfolio, rates } = usePortfolio();

  /**
   * For each year that has USD dividends, compute withheld amounts and the
   * tax saved (vs. the pre-treaty 30% rate) for post-treaty payments.
   */
  const w8benYearlyImpact = useMemo(() => {
    if (!w8benDate) return [];

    const byYear = new Map<
      number,
      {
        preTreatyGrossRon: number;
        postTreatyGrossRon: number;
        postTreatyFeeRon: number;
      }
    >();

    for (const account of portfolio.accounts) {
      for (const tx of account.transactions) {
        if (tx.type !== "Dividend" || tx.currency !== "$") continue;
        const year = parseDate(tx.date).getFullYear();
        const entry = byYear.get(year) ?? {
          preTreatyGrossRon: 0,
          postTreatyGrossRon: 0,
          postTreatyFeeRon: 0,
        };
        const grossRon = convertCurrency(
          tx.shares * tx.price,
          tx.currency,
          "RON",
          rates
        );
        const feeRon = convertCurrency(
          tx.taxWithheld,
          tx.currency,
          "RON",
          rates
        );
        if (parseDate(tx.date) >= w8benDate) {
          entry.postTreatyGrossRon += grossRon;
          entry.postTreatyFeeRon += feeRon;
        } else {
          entry.preTreatyGrossRon += grossRon;
        }
        byYear.set(year, entry);
      }
    }

    return Array.from(byYear.entries())
      .map(([year, d]) => ({
        year,
        preTreatyGrossRon: d.preTreatyGrossRon,
        preTreatyWithheldRon: d.preTreatyGrossRon * W8BEN_PRE_TREATY_RATE,
        postTreatyGrossRon: d.postTreatyGrossRon,
        postTreatyFeeRon: d.postTreatyFeeRon,
        taxSavedRon:
          d.postTreatyGrossRon * W8BEN_PRE_TREATY_RATE -
          d.postTreatyGrossRon * W8BEN_POST_TREATY_RATE,
      }))
      .sort((a, b) => a.year - b.year);
  }, [w8benDate, portfolio.accounts, rates]);

  const totalTaxSavedRon = useMemo(
    () => w8benYearlyImpact.reduce((s, d) => s + d.taxSavedRon, 0),
    [w8benYearlyImpact]
  );

  // --- W-8BEN table sorting ---
  type W8benSortKey =
    "year" | "preTreatyGross" | "postTreatyGross" | "taxSaved";
  const w8benComparators = useMemo(
    () => ({
      year: (
        a: (typeof w8benYearlyImpact)[0],
        b: (typeof w8benYearlyImpact)[0]
      ) => a.year - b.year,
      preTreatyGross: (
        a: (typeof w8benYearlyImpact)[0],
        b: (typeof w8benYearlyImpact)[0]
      ) => a.preTreatyGrossRon - b.preTreatyGrossRon,
      postTreatyGross: (
        a: (typeof w8benYearlyImpact)[0],
        b: (typeof w8benYearlyImpact)[0]
      ) => a.postTreatyGrossRon - b.postTreatyGrossRon,
      taxSaved: (
        a: (typeof w8benYearlyImpact)[0],
        b: (typeof w8benYearlyImpact)[0]
      ) => a.taxSavedRon - b.taxSavedRon,
    }),
    []
  );
  const w8benSort = useTableSort(
    w8benYearlyImpact,
    w8benComparators as Record<
      W8benSortKey,
      (
        a: (typeof w8benYearlyImpact)[0],
        b: (typeof w8benYearlyImpact)[0]
      ) => number
    >,
    "year" as W8benSortKey,
    true
  );

  if (!portfolio.w_8ben_activated_at) return null;

  return (
    <section className="mb-10">
      <div className="flex items-start gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            W-8BEN Treaty
            <span className="text-xs font-normal bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full">
              Active since {formatDateStr(portfolio.w_8ben_activated_at)}
            </span>
          </h2>
          <p className="text-sm text-muted mt-1">
            US dividend withholding reduced from{" "}
            <span className="text-white">
              {(W8BEN_PRE_TREATY_RATE * 100).toFixed(0)}%
            </span>{" "}
            to{" "}
            <span className="text-white">
              {(W8BEN_POST_TREATY_RATE * 100).toFixed(0)}%
            </span>
            . Post-treaty net dividends are higher, which increases the taxable
            base for Romanian CASS.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <StatsCard
          label="Total Tax Saved (RON)"
          value={fmtRon(totalTaxSavedRon)}
          trend="up"
        />
      </div>

      {w8benYearlyImpact.length > 0 ? (
        <div className="bg-card rounded-xl border border-white/5 overflow-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/10">
                <SortableTh
                  sort={w8benSort}
                  sortKey="year"
                  className={thSortable}
                >
                  Year
                </SortableTh>
                <SortableTh
                  sort={w8benSort}
                  sortKey="preTreatyGross"
                  className={`${thSortable} text-right`}
                >
                  Pre-Treaty Gross (RON)
                </SortableTh>
                <th className="py-2 px-3 text-xs text-muted uppercase tracking-wide text-right">
                  Pre-Treaty Withheld (30%)
                </th>
                <SortableTh
                  sort={w8benSort}
                  sortKey="postTreatyGross"
                  className={`${thSortable} text-right`}
                >
                  Post-Treaty Gross (RON)
                </SortableTh>
                <th className="py-2 px-3 text-xs text-muted uppercase tracking-wide text-right">
                  Post-Treaty Withheld (10%)
                </th>
                <SortableTh
                  sort={w8benSort}
                  sortKey="taxSaved"
                  className={`${thSortable} text-right`}
                >
                  Tax Saved (RON)
                </SortableTh>
              </tr>
            </thead>
            <tbody>
              {w8benSort.sorted.map((row) => (
                <tr
                  key={row.year}
                  className="border-b border-white/5 hover:bg-white/5"
                >
                  <td className="py-2.5 px-3 text-sm text-white font-medium">
                    {row.year}
                  </td>
                  <td className="py-2.5 px-3 text-sm text-right text-muted">
                    {row.preTreatyGrossRon > 0
                      ? fmtRon(row.preTreatyGrossRon)
                      : "—"}
                  </td>
                  <td className="py-2.5 px-3 text-sm text-right text-loss">
                    {row.preTreatyGrossRon > 0
                      ? fmtRon(row.preTreatyWithheldRon)
                      : "—"}
                  </td>
                  <td className="py-2.5 px-3 text-sm text-right text-muted">
                    {row.postTreatyGrossRon > 0
                      ? fmtRon(row.postTreatyGrossRon)
                      : "—"}
                  </td>
                  <td className="py-2.5 px-3 text-sm text-right text-loss">
                    {row.postTreatyGrossRon > 0
                      ? fmtRon(row.postTreatyFeeRon)
                      : "—"}
                  </td>
                  <td className="py-2.5 px-3 text-sm text-right text-gain font-medium">
                    {row.postTreatyGrossRon > 0 ? fmtRon(row.taxSavedRon) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-white/5 text-center text-muted py-8 text-sm">
          No USD dividends received yet after the W-8BEN activation date.
        </div>
      )}
    </section>
  );
}
