import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LineChart,
  Line,
  Legend,
} from "recharts";
import { usePortfolio } from "../context/PortfolioContext";
import StatsCard from "../components/common/StatsCard";
import { formatCurrency } from "../utils/currency";
import { formatDateStr } from "../utils/dates";
import { formatShares, formatNumber } from "../utils/numbers";
import {
  computeSellPnL,
  computeYearlyIncome,
  computeCassTax,
  collectTransactionYears,
  ROMANIAN_MINIMUM_WAGE,
  DEFAULT_CASS_PROPORTION,
  type CassBracket,
} from "../data/taxCalculator";

const BRACKET_LABEL: Record<CassBracket, string> = {
  below6: "Under 6 × minimum wage — no CASS due",
  "6to12": "Between 6 and 12 × minimum wage",
  "12to24": "Between 12 and 24 × minimum wage",
  above24: "At least 24 × minimum wage",
};

const BRACKET_COLOR: Record<CassBracket, string> = {
  below6: "text-muted",
  "6to12": "text-blue-400",
  "12to24": "text-amber-400",
  above24: "text-loss",
};

export default function TaxesPage() {
  const { portfolio, rates } = usePortfolio();

  const sells = useMemo(
    () => computeSellPnL(portfolio.accounts, rates),
    [portfolio.accounts, rates]
  );

  const txYears = useMemo(
    () => collectTransactionYears(portfolio.accounts),
    [portfolio.accounts]
  );

  const sellYears = useMemo(() => {
    const s = new Set<number>(sells.map((x) => x.year));
    const current = new Date().getFullYear();
    s.add(current);
    return Array.from(s).sort((a, b) => b - a);
  }, [sells]);

  const currentYear = new Date().getFullYear();
  const [pnlYear, setPnlYear] = useState<number>(
    sellYears.includes(currentYear) ? currentYear : (sellYears[0] ?? currentYear)
  );

  const filteredSells = useMemo(
    () => sells.filter((s) => s.year === pnlYear),
    [sells, pnlYear]
  );

  const pnlTotals = useMemo(() => {
    let gross = 0;
    let net = 0;
    let fees = 0;
    for (const s of filteredSells) {
      gross += s.grossProfitRon;
      net += s.netProfitRon;
      fees += s.feeRon;
    }
    return { gross, net, fees };
  }, [filteredSells]);

  // --- CASS section ---
  const cassYears = useMemo(() => {
    const wageYears = Object.keys(ROMANIAN_MINIMUM_WAGE).map(Number);
    const all = new Set<number>([...txYears.map((y) => y + 1), ...wageYears]);
    // CASS tax is always paid for a year using previous year data, so we need
    // the previous year of any tx year plus every hardcoded wage year (which
    // represents a "due" year too).
    return Array.from(all).sort((a, b) => b - a);
  }, [txYears]);

  const [cassYear, setCassYear] = useState<number>(
    cassYears.includes(currentYear) ? currentYear : (cassYears[0] ?? currentYear)
  );
  const [proportion, setProportion] = useState<number>(DEFAULT_CASS_PROPORTION);

  const prevYear = cassYear - 1;

  const prevYearIncome = useMemo(
    () => computeYearlyIncome(portfolio.accounts, sells, prevYear, rates),
    [portfolio.accounts, sells, prevYear, rates]
  );

  const prevYearWage = ROMANIAN_MINIMUM_WAGE[prevYear];

  const cassResult = useMemo(() => {
    if (prevYearWage === undefined) return null;
    return computeCassTax(prevYearIncome.totalRon, prevYearWage, proportion);
  }, [prevYearIncome, prevYearWage, proportion]);

  // --- Evolution data for graphs ---
  const evolution = useMemo(() => {
    const yearsWithWage = Object.keys(ROMANIAN_MINIMUM_WAGE)
      .map(Number)
      .sort((a, b) => a - b);
    return yearsWithWage.map((year) => {
      const wage = ROMANIAN_MINIMUM_WAGE[year]!;
      const income = computeYearlyIncome(portfolio.accounts, sells, year, rates);
      const cass = computeCassTax(income.totalRon, wage, proportion);
      return {
        year: String(year),
        minimumWage: wage,
        income: +income.totalRon.toFixed(2),
        dividends: +income.dividendsNetRon.toFixed(2),
        sellProfits: +income.sellsNetRon.toFixed(2),
        cassTaxNextYear: +cass.tax.toFixed(2),
      };
    });
  }, [portfolio.accounts, sells, rates, proportion]);

  const tooltipStyle = {
    contentStyle: {
      backgroundColor: "#1f2937",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: "8px",
      color: "#f1f5f9",
    },
  };

  const fmtRon = (value: number): string => formatCurrency(value, "RON");

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Taxes</h1>
        <div className="text-xs text-muted uppercase tracking-wide">
          All values in RON
        </div>
      </div>

      {/* ============================================================
          SECTION 1 — Sell P&L
         ============================================================ */}
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

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <StatsCard
            label="Sell Transactions"
            value={filteredSells.length.toString()}
          />
          <StatsCard
            label="Income Tax Paid"
            value={fmtRon(pnlTotals.fees)}
          />
          <StatsCard
            label="Gross Profit"
            value={fmtRon(pnlTotals.gross)}
            trend={pnlTotals.gross >= 0 ? "up" : "down"}
          />
          <StatsCard
            label="Net Profit"
            value={fmtRon(pnlTotals.net)}
            trend={pnlTotals.net >= 0 ? "up" : "down"}
          />
        </div>

        <div className="bg-card rounded-xl border border-white/5 overflow-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/10">
                <th className="py-2 px-3 text-xs text-muted uppercase tracking-wide">
                  Date
                </th>
                <th className="py-2 px-3 text-xs text-muted uppercase tracking-wide">
                  Symbol
                </th>
                <th className="py-2 px-3 text-xs text-muted uppercase tracking-wide">
                  Name
                </th>
                <th className="py-2 px-3 text-xs text-muted uppercase tracking-wide">
                  Account
                </th>
                <th className="py-2 px-3 text-xs text-muted uppercase tracking-wide text-right">
                  Shares
                </th>
                <th className="py-2 px-3 text-xs text-muted uppercase tracking-wide text-right">
                  Sell Value
                </th>
                <th className="py-2 px-3 text-xs text-muted uppercase tracking-wide text-right">
                  Cost Basis
                </th>
                <th className="py-2 px-3 text-xs text-muted uppercase tracking-wide text-right">
                  Income Tax
                </th>
                <th className="py-2 px-3 text-xs text-muted uppercase tracking-wide text-right">
                  Gross Profit
                </th>
                <th className="py-2 px-3 text-xs text-muted uppercase tracking-wide text-right">
                  Net Profit
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredSells.map((s, i) => (
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
                  <td className="py-2.5 px-3 text-sm text-muted">
                    {s.account}
                  </td>
                  <td className="py-2.5 px-3 text-sm text-right">
                    {formatShares(s.shares)}
                  </td>
                  <td className="py-2.5 px-3 text-sm text-right">
                    {fmtRon(s.sellValueRon)}
                  </td>
                  <td className="py-2.5 px-3 text-sm text-right text-muted">
                    {fmtRon(s.costBasisRon)}
                  </td>
                  <td className="py-2.5 px-3 text-sm text-right text-muted">
                    {s.feeRon > 0 ? fmtRon(s.feeRon) : "-"}
                  </td>
                  <td
                    className={`py-2.5 px-3 text-sm text-right font-medium ${
                      s.grossProfit >= 0 ? "text-gain" : "text-loss"
                    }`}
                  >
                    {fmtRon(s.grossProfitRon)}
                  </td>
                  <td
                    className={`py-2.5 px-3 text-sm text-right font-medium ${
                      s.netProfit >= 0 ? "text-gain" : "text-loss"
                    }`}
                  >
                    {fmtRon(s.netProfitRon)}
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
                    Total for {pnlYear}
                  </td>
                  <td className="py-2.5 px-3 text-sm text-right text-muted font-medium">
                    {fmtRon(pnlTotals.fees)}
                  </td>
                  <td
                    className={`py-2.5 px-3 text-sm text-right font-semibold ${
                      pnlTotals.gross >= 0 ? "text-gain" : "text-loss"
                    }`}
                  >
                    {fmtRon(pnlTotals.gross)}
                  </td>
                  <td
                    className={`py-2.5 px-3 text-sm text-right font-semibold ${
                      pnlTotals.net >= 0 ? "text-gain" : "text-loss"
                    }`}
                  >
                    {fmtRon(pnlTotals.net)}
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

      {/* ============================================================
          SECTION 2 — CASS Tax
         ============================================================ */}
      <section>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">
              CASS Tax Contribution
            </h2>
            <p className="text-sm text-muted mt-1">
              Romanian health contribution on investment income. Computed from
              the previous year's income and minimum wage.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-2 text-sm text-muted">
              Due for year
              <select
                value={cassYear}
                onChange={(e) => setCassYear(Number(e.target.value))}
                className="bg-card border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {cassYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-muted">
              Proportion
              <input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={proportion}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isNaN(v)) setProportion(Math.min(1, Math.max(0, v)));
                }}
                className="bg-card border border-white/10 text-white text-sm rounded-lg px-3 py-2 w-24 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Details panel */}
          <div className="bg-card rounded-xl p-5 border border-white/5">
            <h3 className="text-sm font-medium text-muted mb-4 uppercase tracking-wide">
              Calculation for {cassYear}
            </h3>

            {prevYearWage === undefined ? (
              <div className="text-sm text-muted py-6 text-center">
                No minimum wage recorded for {prevYear}. CASS cannot be
                computed for {cassYear}.
              </div>
            ) : cassResult ? (
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <InfoRow label={`Minimum wage (${prevYear})`}>
                    {fmtRon(prevYearWage)}
                  </InfoRow>
                  <InfoRow label="Proportion">
                    {formatNumber(proportion * 100)} %
                  </InfoRow>
                  <InfoRow label={`Net dividends ${prevYear}`}>
                    {fmtRon(prevYearIncome.dividendsNetRon)}
                    <span className="text-xs text-muted ml-2">
                      ({prevYearIncome.dividendCount} payments)
                    </span>
                  </InfoRow>
                  <InfoRow label={`Profitable sell net ${prevYear}`}>
                    {fmtRon(prevYearIncome.sellsNetRon)}
                    <span className="text-xs text-muted ml-2">
                      ({prevYearIncome.profitableSellCount} sells)
                    </span>
                  </InfoRow>
                </div>

                <div className="border-t border-white/10 pt-4">
                  <div className="flex items-baseline justify-between">
                    <span className="text-muted uppercase text-xs tracking-wide">
                      Total income ({prevYear})
                    </span>
                    <span className="text-white text-xl font-semibold">
                      {fmtRon(prevYearIncome.totalRon)}
                    </span>
                  </div>
                </div>

                <div className="border-t border-white/10 pt-4 space-y-2">
                  <div className="text-muted uppercase text-xs tracking-wide mb-1">
                    Income thresholds
                  </div>
                  <ThresholdRow
                    label="6 × minimum wage"
                    value={cassResult.sixWages}
                    active={cassResult.bracket === "6to12"}
                    reached={
                      cassResult.bracket === "6to12" ||
                      cassResult.bracket === "12to24" ||
                      cassResult.bracket === "above24"
                    }
                    fmt={fmtRon}
                  />
                  <ThresholdRow
                    label="12 × minimum wage"
                    value={cassResult.twelveWages}
                    active={cassResult.bracket === "12to24"}
                    reached={
                      cassResult.bracket === "12to24" ||
                      cassResult.bracket === "above24"
                    }
                    fmt={fmtRon}
                  />
                  <ThresholdRow
                    label="24 × minimum wage"
                    value={cassResult.twentyFourWages}
                    active={cassResult.bracket === "above24"}
                    reached={cassResult.bracket === "above24"}
                    fmt={fmtRon}
                  />
                </div>

                <div className="border-t border-white/10 pt-4">
                  <div className="text-muted uppercase text-xs tracking-wide mb-1">
                    Bracket reached
                  </div>
                  <div
                    className={`text-sm font-medium ${BRACKET_COLOR[cassResult.bracket]}`}
                  >
                    {BRACKET_LABEL[cassResult.bracket]}
                  </div>
                </div>

                <div className="border-t border-white/10 pt-4">
                  <div className="flex items-baseline justify-between">
                    <span className="text-muted uppercase text-xs tracking-wide">
                      CASS tax due in {cassYear}
                    </span>
                    <span
                      className={`text-2xl font-bold ${
                        cassResult.tax > 0 ? "text-loss" : "text-gain"
                      }`}
                    >
                      {fmtRon(cassResult.tax)}
                    </span>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* Graphs panel */}
          <div className="bg-card rounded-xl p-5 border border-white/5">
            <h3 className="text-sm font-medium text-muted mb-4 uppercase tracking-wide">
              Evolution over the years
            </h3>

            {evolution.length > 0 ? (
              <div className="space-y-6">
                <div>
                  <div className="text-xs text-muted mb-2">
                    Minimum wage (RON)
                  </div>
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={evolution}>
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
                      <Line
                        type="monotone"
                        dataKey="minimumWage"
                        name="Min. wage"
                        stroke="#60a5fa"
                        strokeWidth={2}
                        dot={{ fill: "#60a5fa", r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div>
                  <div className="text-xs text-muted mb-2">
                    Yearly income breakdown (RON)
                  </div>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={evolution}>
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
                      <Legend
                        wrapperStyle={{ color: "#9ca3af", fontSize: 12 }}
                      />
                      <Bar
                        dataKey="dividends"
                        name="Dividends (net)"
                        stackId="income"
                        fill="#10b981"
                        radius={[0, 0, 0, 0]}
                      />
                      <Bar
                        dataKey="sellProfits"
                        name="Sell profits (net)"
                        stackId="income"
                        fill="#3b82f6"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div>
                  <div className="text-xs text-muted mb-2">
                    CASS tax due the following year (RON)
                  </div>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={evolution}>
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
                      <Bar
                        dataKey="cassTaxNextYear"
                        name="CASS due next year"
                        fill="#f59e0b"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <div className="text-center text-muted text-sm py-10">
                No data available for charts
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function InfoRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-xs text-muted uppercase tracking-wide mb-0.5">
        {label}
      </div>
      <div className="text-white font-medium">{children}</div>
    </div>
  );
}

function ThresholdRow({
  label,
  value,
  active,
  reached,
  fmt,
}: {
  label: string;
  value: number;
  active: boolean;
  reached: boolean;
  fmt: (v: number) => string;
}) {
  return (
    <div
      className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${
        active
          ? "bg-amber-500/10 border border-amber-500/40"
          : reached
            ? "bg-white/5"
            : ""
      }`}
    >
      <span className={reached ? "text-white" : "text-muted"}>{label}</span>
      <span className={reached ? "text-white font-medium" : "text-muted"}>
        {fmt(value)}
      </span>
    </div>
  );
}
