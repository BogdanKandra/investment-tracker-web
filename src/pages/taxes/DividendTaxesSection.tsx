import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { usePortfolio } from "../../context/usePortfolio";
import {
  formatCurrency,
  convertCurrency,
  currencyLabel,
} from "../../utils/currency";
import { formatDateStr, parseDate } from "../../utils/dates";
import {
  DIVIDEND_TAX,
  AVERAGE_YEARLY_RATES_TO_RON,
  getCountryFromSymbol,
} from "../../data/taxCalculator";
import type { CurrencySymbol } from "../../types";
import { useTableSort } from "../../hooks/useTableSort";
import { tooltipStyle, thSortable, fmtRon } from "./shared";

export default function DividendTaxesSection({
  w8benDate,
}: {
  w8benDate: Date | null;
}) {
  const { portfolio, rates } = usePortfolio();
  const currentYear = new Date().getFullYear();

  // --- Dividend Taxes section ---
  const divTaxYears = useMemo(() => {
    const years = new Set<number>();
    for (const account of portfolio.accounts) {
      for (const tx of account.transactions) {
        if (tx.type === "Dividend") {
          const year = parseDate(tx.date).getFullYear();
          years.add(year + 1);
        }
      }
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [portfolio.accounts]);

  const [divTaxYear, setDivTaxYear] = useState<number>(
    divTaxYears.includes(currentYear)
      ? currentYear
      : (divTaxYears[0] ?? currentYear)
  );

  const divTaxPrevYear = divTaxYear - 1;

  interface DividendRow {
    date: string;
    symbol: string;
    name: string;
    account: string;
    country: string;
    shares: number;
    pricePerShare: number;
    grossAmount: number;
    fee: number;
    netAmount: number;
    currency: CurrencySymbol;
    grossAmountRon: number;
    feeRon: number;
    netAmountRon: number;
    isPostW8ben: boolean;
  }

  const dividendRows = useMemo((): DividendRow[] => {
    const rows: DividendRow[] = [];
    for (const account of portfolio.accounts) {
      for (const tx of account.transactions) {
        if (tx.type !== "Dividend") continue;
        const txYear = parseDate(tx.date).getFullYear();
        if (txYear !== divTaxPrevYear) continue;
        const gross = tx.shares * tx.price;
        const net = gross - tx.fee;
        const country = getCountryFromSymbol(
          tx.symbol,
          tx.currency,
          tx.isin,
          tx.country
        );

        const rateKey = `${currencyLabel(tx.currency)}_${divTaxPrevYear}`;
        const yearlyRate = AVERAGE_YEARLY_RATES_TO_RON[rateKey];
        const toRon = (amount: number): number => {
          if (tx.currency === "RON") return amount;
          if (yearlyRate) return amount * yearlyRate;
          return convertCurrency(amount, tx.currency, "RON", rates);
        };

        const isPostW8ben = w8benDate
          ? tx.currency === "$" && parseDate(tx.date) >= w8benDate
          : false;

        rows.push({
          date: tx.date,
          symbol: tx.symbol,
          name: tx.name,
          account: account.account_name,
          country,
          shares: tx.shares,
          pricePerShare: tx.price,
          grossAmount: gross,
          fee: tx.fee,
          netAmount: net,
          currency: tx.currency,
          grossAmountRon: toRon(gross),
          feeRon: toRon(tx.fee),
          netAmountRon: toRon(net),
          isPostW8ben,
        });
      }
    }
    rows.sort(
      (a, b) => parseDate(a.date).getTime() - parseDate(b.date).getTime()
    );
    return rows;
  }, [portfolio.accounts, divTaxPrevYear, rates, w8benDate]);

  const divTotals = useMemo(() => {
    let grossRon = 0;
    let feeRon = 0;
    let netRon = 0;
    for (const r of dividendRows) {
      grossRon += r.grossAmountRon;
      feeRon += r.feeRon;
      netRon += r.netAmountRon;
    }
    return { grossRon, feeRon, netRon };
  }, [dividendRows]);

  interface CountryDividendSummary {
    country: string;
    grossRon: number;
    feeRon: number;
    netRon: number;
    preW8benGrossRon: number;
    postW8benGrossRon: number;
    preW8benFeeRon: number;
    postW8benFeeRon: number;
  }

  const countryBreakdown = useMemo((): CountryDividendSummary[] => {
    const map = new Map<string, CountryDividendSummary>();
    for (const r of dividendRows) {
      const entry = map.get(r.country) ?? {
        country: r.country,
        grossRon: 0,
        feeRon: 0,
        netRon: 0,
        preW8benGrossRon: 0,
        postW8benGrossRon: 0,
        preW8benFeeRon: 0,
        postW8benFeeRon: 0,
      };
      entry.grossRon += r.grossAmountRon;
      entry.feeRon += r.feeRon;
      entry.netRon += r.netAmountRon;
      if (r.country === "USA") {
        if (r.isPostW8ben) {
          entry.postW8benGrossRon += r.grossAmountRon;
          entry.postW8benFeeRon += r.feeRon;
        } else {
          entry.preW8benGrossRon += r.grossAmountRon;
          entry.preW8benFeeRon += r.feeRon;
        }
      }
      map.set(r.country, entry);
    }
    return Array.from(map.values()).sort((a, b) => b.grossRon - a.grossRon);
  }, [dividendRows]);

  interface DividendDueItem {
    country: string;
    description: string;
    grossRon: number;
    taxRate: number;
    taxDue: number;
    declaration: string;
  }

  const dividendDues = useMemo((): DividendDueItem[] => {
    const taxRate = DIVIDEND_TAX[divTaxPrevYear] ?? 0;
    const items: DividendDueItem[] = [];

    for (const cs of countryBreakdown) {
      if (cs.country === "Romania") {
        items.push({
          country: "Romania",
          description: "Dividend tax already retained by TradeVille broker",
          grossRon: cs.grossRon,
          taxRate: 0,
          taxDue: 0,
          declaration: "No declaration needed",
        });
      } else if (cs.country === "USA") {
        if (cs.preW8benGrossRon > 0) {
          items.push({
            country: "USA (pre W-8BEN)",
            description: `Dividends received before W-8BEN activation — ${(taxRate * 100).toFixed(0)}% tax applies`,
            grossRon: cs.preW8benGrossRon,
            taxRate,
            taxDue: cs.preW8benGrossRon * taxRate,
            declaration: "Must declare",
          });
        }
        if (cs.postW8benGrossRon > 0) {
          items.push({
            country: "USA (post W-8BEN)",
            description:
              "Dividends received after W-8BEN activation — no tax due (treaty benefit)",
            grossRon: cs.postW8benGrossRon,
            taxRate: 0,
            taxDue: 0,
            declaration: "Must declare",
          });
        }
        if (!w8benDate && cs.grossRon > 0) {
          items.push({
            country: "USA",
            description: `All USA dividends — ${(taxRate * 100).toFixed(0)}% tax applies (no W-8BEN)`,
            grossRon: cs.grossRon,
            taxRate,
            taxDue: cs.grossRon * taxRate,
            declaration: "Must declare",
          });
        }
      } else {
        items.push({
          country: cs.country,
          description: `Foreign dividends — ${(taxRate * 100).toFixed(0)}% tax applies`,
          grossRon: cs.grossRon,
          taxRate,
          taxDue: cs.grossRon * taxRate,
          declaration: "Must declare",
        });
      }
    }
    return items;
  }, [countryBreakdown, divTaxPrevYear, w8benDate]);

  const totalDividendTaxDue = useMemo(
    () => dividendDues.reduce((s, d) => s + d.taxDue, 0),
    [dividendDues]
  );

  // --- Dividend charts data ---
  const divMonthlyData = useMemo(() => {
    const months: {
      month: string;
      gross: number;
      withheld: number;
      net: number;
    }[] = [];
    for (let m = 0; m < 12; m++) {
      months.push({
        month: new Date(divTaxPrevYear, m).toLocaleString("en-US", {
          month: "short",
        }),
        gross: 0,
        withheld: 0,
        net: 0,
      });
    }
    for (const r of dividendRows) {
      const monthIdx = parseDate(r.date).getMonth();
      months[monthIdx]!.gross += r.grossAmountRon;
      months[monthIdx]!.withheld += r.feeRon;
      months[monthIdx]!.net += r.netAmountRon;
    }
    return months.map((m) => ({
      ...m,
      gross: +m.gross.toFixed(2),
      withheld: +m.withheld.toFixed(2),
      net: +m.net.toFixed(2),
    }));
  }, [dividendRows, divTaxPrevYear]);

  const divCountryChartData = useMemo(() => {
    return countryBreakdown.map((cs) => ({
      country: cs.country,
      gross: +cs.grossRon.toFixed(2),
      withheld: +cs.feeRon.toFixed(2),
      net: +cs.netRon.toFixed(2),
    }));
  }, [countryBreakdown]);

  const divYearlyEvolution = useMemo(() => {
    const byYear = new Map<
      number,
      { gross: number; withheld: number; net: number }
    >();
    for (const account of portfolio.accounts) {
      for (const tx of account.transactions) {
        if (tx.type !== "Dividend") continue;
        const year = parseDate(tx.date).getFullYear();
        const entry = byYear.get(year) ?? { gross: 0, withheld: 0, net: 0 };
        const rateKey = `${currencyLabel(tx.currency)}_${year}`;
        const yearlyRate = AVERAGE_YEARLY_RATES_TO_RON[rateKey];
        const toRon = (amount: number): number => {
          if (tx.currency === "RON") return amount;
          if (yearlyRate) return amount * yearlyRate;
          return convertCurrency(amount, tx.currency, "RON", rates);
        };
        const gross = tx.shares * tx.price;
        entry.gross += toRon(gross);
        entry.withheld += toRon(tx.fee);
        entry.net += toRon(gross - tx.fee);
        byYear.set(year, entry);
      }
    }
    return Array.from(byYear.entries())
      .sort(([a], [b]) => a - b)
      .map(([year, d]) => ({
        year: String(year),
        gross: +d.gross.toFixed(2),
        withheld: +d.withheld.toFixed(2),
        net: +d.net.toFixed(2),
      }));
  }, [portfolio.accounts, rates]);

  // --- Dividend table sorting ---
  type DivSortKey =
    "date" | "symbol" | "account" | "country" | "gross" | "fee" | "net";
  const divComparators = useMemo(
    () => ({
      date: (a: DividendRow, b: DividendRow) =>
        parseDate(a.date).getTime() - parseDate(b.date).getTime(),
      symbol: (a: DividendRow, b: DividendRow) =>
        a.symbol.localeCompare(b.symbol),
      account: (a: DividendRow, b: DividendRow) =>
        a.account.localeCompare(b.account),
      country: (a: DividendRow, b: DividendRow) =>
        a.country.localeCompare(b.country),
      gross: (a: DividendRow, b: DividendRow) =>
        a.grossAmountRon - b.grossAmountRon,
      fee: (a: DividendRow, b: DividendRow) => a.feeRon - b.feeRon,
      net: (a: DividendRow, b: DividendRow) => a.netAmountRon - b.netAmountRon,
    }),
    []
  );
  const divSort = useTableSort(
    dividendRows,
    divComparators as Record<
      DivSortKey,
      (a: DividendRow, b: DividendRow) => number
    >,
    "date" as DivSortKey
  );

  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Dividend Taxes</h2>
          <p className="text-sm text-muted mt-1">
            Dividend income received in {divTaxPrevYear}, to be declared for{" "}
            {divTaxYear} taxes.
            {DIVIDEND_TAX[divTaxPrevYear] !== undefined && (
              <>
                {" "}
                Applicable dividend tax rate:{" "}
                <span className="text-white">
                  {(DIVIDEND_TAX[divTaxPrevYear]! * 100).toFixed(0)}%
                </span>
                .
              </>
            )}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted">
          Tax year
          <select
            value={divTaxYear}
            onChange={(e) => setDivTaxYear(Number(e.target.value))}
            className="bg-card border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {divTaxYears.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Dividend table */}
      <div className="bg-card rounded-xl border border-white/5 overflow-auto mb-6">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/10">
              <th
                className={thSortable}
                onClick={() => divSort.handleSort("date")}
              >
                Date{divSort.arrow("date")}
              </th>
              <th
                className={thSortable}
                onClick={() => divSort.handleSort("symbol")}
              >
                Symbol{divSort.arrow("symbol")}
              </th>
              <th className="py-2 px-3 text-xs text-muted uppercase tracking-wide">
                Name
              </th>
              <th
                className={thSortable}
                onClick={() => divSort.handleSort("account")}
              >
                Account{divSort.arrow("account")}
              </th>
              <th
                className={thSortable}
                onClick={() => divSort.handleSort("country")}
              >
                Country{divSort.arrow("country")}
              </th>
              <th
                className={`${thSortable} text-right`}
                onClick={() => divSort.handleSort("gross")}
              >
                Gross{divSort.arrow("gross")}
              </th>
              <th
                className={`${thSortable} text-right`}
                onClick={() => divSort.handleSort("fee")}
              >
                Tax Withheld{divSort.arrow("fee")}
              </th>
              <th
                className={`${thSortable} text-right`}
                onClick={() => divSort.handleSort("net")}
              >
                Net{divSort.arrow("net")}
              </th>
            </tr>
          </thead>
          <tbody>
            {divSort.sorted.map((r, i) => (
              <tr
                key={`${r.date}-${r.symbol}-${r.account}-${i}`}
                className="border-b border-white/5 hover:bg-white/5"
              >
                <td className="py-2.5 px-3 text-sm text-white whitespace-nowrap">
                  {formatDateStr(r.date)}
                </td>
                <td className="py-2.5 px-3 text-sm text-white font-medium">
                  {r.symbol}
                </td>
                <td className="py-2.5 px-3 text-sm text-muted truncate max-w-[150px]">
                  {r.name}
                </td>
                <td className="py-2.5 px-3 text-sm text-muted">{r.account}</td>
                <td className="py-2.5 px-3 text-sm text-muted">{r.country}</td>
                <td className="py-2.5 px-3 text-sm text-right text-white">
                  {formatCurrency(r.grossAmount, r.currency)}
                </td>
                <td className="py-2.5 px-3 text-sm text-right text-loss">
                  {r.fee > 0 ? formatCurrency(r.fee, r.currency) : "—"}
                </td>
                <td className="py-2.5 px-3 text-sm text-right text-gain">
                  {formatCurrency(r.netAmount, r.currency)}
                </td>
              </tr>
            ))}
          </tbody>
          {dividendRows.length > 0 && (
            <tfoot>
              <tr className="bg-white/5">
                <td
                  colSpan={5}
                  className="py-2.5 px-3 text-sm font-semibold text-white text-right"
                >
                  Total for {divTaxPrevYear} (RON)
                </td>
                <td className="py-2.5 px-3 text-sm text-right text-white font-semibold">
                  {fmtRon(divTotals.grossRon)}
                </td>
                <td className="py-2.5 px-3 text-sm text-right text-loss font-medium">
                  {fmtRon(divTotals.feeRon)}
                </td>
                <td className="py-2.5 px-3 text-sm text-right text-gain font-semibold">
                  {fmtRon(divTotals.netRon)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
        {dividendRows.length === 0 && (
          <div className="text-center text-muted py-8 text-sm">
            No dividend transactions in {divTaxPrevYear}
          </div>
        )}
      </div>

      {/* Country breakdown */}
      {countryBreakdown.length > 0 && (
        <div className="bg-card rounded-xl p-5 border border-white/5 mb-6">
          <h3 className="text-sm font-medium text-muted mb-4 uppercase tracking-wide">
            Dividends by Country of Origin (RON)
          </h3>
          <div className="space-y-4">
            {countryBreakdown.map((cs) => (
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
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                  <div>
                    <span className="text-muted">Gross:</span>{" "}
                    <span className="text-white">{fmtRon(cs.grossRon)}</span>
                  </div>
                  <div>
                    <span className="text-muted">Tax withheld:</span>{" "}
                    <span className="text-loss">{fmtRon(cs.feeRon)}</span>
                  </div>
                  <div>
                    <span className="text-muted">Net:</span>{" "}
                    <span className="text-gain">{fmtRon(cs.netRon)}</span>
                  </div>
                </div>
                {cs.country === "USA" && w8benDate && (
                  <div className="mt-3 pl-4 border-l-2 border-blue-500/30 space-y-2">
                    {cs.preW8benGrossRon > 0 && (
                      <div className="text-sm">
                        <span className="text-muted">Pre W-8BEN:</span>{" "}
                        <span className="text-white">
                          {fmtRon(cs.preW8benGrossRon)} gross
                        </span>
                        <span className="text-muted mx-2">·</span>
                        <span className="text-loss">
                          {fmtRon(cs.preW8benFeeRon)} withheld
                        </span>
                      </div>
                    )}
                    {cs.postW8benGrossRon > 0 && (
                      <div className="text-sm">
                        <span className="text-muted">Post W-8BEN:</span>{" "}
                        <span className="text-white">
                          {fmtRon(cs.postW8benGrossRon)} gross
                        </span>
                        <span className="text-muted mx-2">·</span>
                        <span className="text-loss">
                          {fmtRon(cs.postW8benFeeRon)} withheld
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dividend dues */}
      {dividendDues.length > 0 && (
        <div className="bg-card rounded-xl p-5 border border-white/5 mb-6">
          <h3 className="text-sm font-medium text-muted mb-4 uppercase tracking-wide">
            Dividend Tax Dues for {divTaxYear}
          </h3>
          <div className="space-y-3">
            {dividendDues.map((d, i) => (
              <div
                key={`${d.country}-${i}`}
                className="flex items-start justify-between p-3 rounded-lg bg-white/5 gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-white font-medium text-sm">
                    {d.country}
                  </div>
                  <div className="text-xs text-muted mt-0.5">
                    {d.description}
                  </div>
                  <div className="text-xs text-muted mt-1">
                    <span className="text-white">{d.declaration}</span>
                    <span className="mx-2">·</span>
                    Gross: {fmtRon(d.grossRon)}
                    {d.taxRate > 0 && (
                      <>
                        <span className="mx-2">·</span>
                        Rate: {(d.taxRate * 100).toFixed(0)}%
                      </>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div
                    className={`text-lg font-bold ${
                      d.taxDue > 0 ? "text-loss" : "text-gain"
                    }`}
                  >
                    {d.taxDue > 0 ? fmtRon(d.taxDue) : "—"}
                  </div>
                  <div className="text-xs text-muted">
                    {d.taxDue > 0 ? "to pay" : "nothing to pay"}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-white/10 mt-4 pt-4 flex items-baseline justify-between">
            <span className="text-muted uppercase text-xs tracking-wide">
              Total dividend tax due in {divTaxYear}
            </span>
            <span
              className={`text-2xl font-bold ${
                totalDividendTaxDue > 0 ? "text-loss" : "text-gain"
              }`}
            >
              {fmtRon(totalDividendTaxDue)}
            </span>
          </div>
        </div>
      )}

      {/* Dividend charts */}
      {dividendRows.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Monthly breakdown */}
          <div className="bg-card rounded-xl p-5 border border-white/5">
            <h3 className="text-sm font-medium text-muted mb-4 uppercase tracking-wide">
              Monthly Dividends in {divTaxPrevYear} (RON)
            </h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={divMonthlyData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.05)"
                />
                <XAxis
                  dataKey="month"
                  tick={{ fill: "#9ca3af", fontSize: 11 }}
                  stroke="rgba(255,255,255,0.1)"
                />
                <YAxis
                  tick={{ fill: "#9ca3af", fontSize: 11 }}
                  stroke="rgba(255,255,255,0.1)"
                />
                <Tooltip {...tooltipStyle} />
                <Legend wrapperStyle={{ color: "#9ca3af", fontSize: 12 }} />
                <Bar
                  dataKey="gross"
                  name="Gross"
                  fill="#60a5fa"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="withheld"
                  name="Tax withheld"
                  fill="#ef4444"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="net"
                  name="Net"
                  fill="#10b981"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* By country */}
          <div className="bg-card rounded-xl p-5 border border-white/5">
            <h3 className="text-sm font-medium text-muted mb-4 uppercase tracking-wide">
              Dividends by Country in {divTaxPrevYear} (RON)
            </h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={divCountryChartData} layout="vertical">
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.05)"
                />
                <XAxis
                  type="number"
                  tick={{ fill: "#9ca3af", fontSize: 11 }}
                  stroke="rgba(255,255,255,0.1)"
                />
                <YAxis
                  dataKey="country"
                  type="category"
                  tick={{ fill: "#9ca3af", fontSize: 11 }}
                  stroke="rgba(255,255,255,0.1)"
                  width={90}
                />
                <Tooltip {...tooltipStyle} />
                <Legend wrapperStyle={{ color: "#9ca3af", fontSize: 12 }} />
                <Bar
                  dataKey="gross"
                  name="Gross"
                  fill="#60a5fa"
                  radius={[0, 4, 4, 0]}
                />
                <Bar
                  dataKey="withheld"
                  name="Tax withheld"
                  fill="#ef4444"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Yearly evolution */}
          <div className="bg-card rounded-xl p-5 border border-white/5 lg:col-span-2">
            <h3 className="text-sm font-medium text-muted mb-4 uppercase tracking-wide">
              Dividend Income Evolution (RON)
            </h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={divYearlyEvolution}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.05)"
                />
                <XAxis
                  dataKey="year"
                  tick={{ fill: "#9ca3af", fontSize: 11 }}
                  stroke="rgba(255,255,255,0.1)"
                />
                <YAxis
                  tick={{ fill: "#9ca3af", fontSize: 11 }}
                  stroke="rgba(255,255,255,0.1)"
                />
                <Tooltip {...tooltipStyle} />
                <Legend wrapperStyle={{ color: "#9ca3af", fontSize: 12 }} />
                <Bar
                  dataKey="gross"
                  name="Gross dividends"
                  stackId="div"
                  fill="#3b82f6"
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="net"
                  name="Net dividends"
                  fill="#10b981"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="withheld"
                  name="Tax withheld"
                  fill="#ef4444"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </section>
  );
}
