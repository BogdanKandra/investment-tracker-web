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
import { usePortfolio } from "../../context/usePortfolio";
import { parseDate } from "../../utils/dates";
import { formatNumber } from "../../utils/numbers";
import {
  computeYearlyIncome,
  computeCassTax,
  getCassMinimumWage,
  FIRST_CASS_INCOME_YEAR,
  DEFAULT_CASS_PROPORTION,
  type CassBracket,
  type SellPnL,
} from "../../data/taxCalculator";
import { tooltipStyle, fmtRon } from "./shared";

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

export default function CassSection({ sells }: { sells: SellPnL[] }) {
  const { portfolio, rates } = usePortfolio();
  const currentYear = new Date().getFullYear();

  // --- CASS section ---
  const cassYears = useMemo(() => {
    // CASS is due the year after income is received. Only include years where
    // the previous year had actual dividend, interest, or sell income.
    const incomeYears = new Set<number>(sells.map((s) => s.year));
    for (const account of portfolio.accounts) {
      for (const tx of account.transactions) {
        if (tx.type === "Dividend" || tx.type === "Interest") {
          incomeYears.add(parseDate(tx.date).getFullYear());
        }
      }
    }
    const all = new Set<number>();
    for (const y of incomeYears) all.add(y + 1);
    return Array.from(all).sort((a, b) => b - a);
  }, [portfolio.accounts, sells]);

  const [cassYear, setCassYear] = useState<number>(
    cassYears.includes(currentYear)
      ? currentYear
      : (cassYears[0] ?? currentYear)
  );
  const [proportion, setProportion] = useState<number>(DEFAULT_CASS_PROPORTION);

  const prevYear = cassYear - 1;

  const prevYearIncome = useMemo(
    () => computeYearlyIncome(portfolio.accounts, sells, prevYear, rates),
    [portfolio.accounts, sells, prevYear, rates]
  );

  const prevYearWage = getCassMinimumWage(prevYear);

  const cassResult = useMemo(() => {
    if (prevYearWage === undefined) return null;
    return computeCassTax(prevYearIncome.totalRon, prevYearWage, proportion);
  }, [prevYearIncome, prevYearWage, proportion]);

  // --- Evolution data for graphs ---
  const evolution = useMemo(() => {
    const rows = [];
    for (let year = FIRST_CASS_INCOME_YEAR; year <= currentYear; year++) {
      const wage = getCassMinimumWage(year);
      if (wage === undefined) continue;
      const income = computeYearlyIncome(
        portfolio.accounts,
        sells,
        year,
        rates
      );
      const cass = computeCassTax(income.totalRon, wage, proportion);
      rows.push({
        year: String(year),
        minimumWage: wage,
        income: +income.totalRon.toFixed(2),
        dividends: +income.dividendsNetRon.toFixed(2),
        interest: +income.interestNetRon.toFixed(2),
        sellProfits: +income.sellsNetRon.toFixed(2),
        cassTaxNextYear: +cass.tax.toFixed(2),
      });
    }
    return rows;
  }, [portfolio.accounts, sells, rates, proportion, currentYear]);

  return (
    <section>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">
            CASS Tax Contribution
          </h2>
          <p className="text-sm text-muted mt-1">
            Romanian health contribution on investment income. Computed from the
            previous year's income and the minimum wage in force on 1 January of
            that year.
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
                if (!Number.isNaN(v))
                  setProportion(Math.min(1, Math.max(0, v)));
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
              No minimum wage recorded for {prevYear}. CASS cannot be computed
              for {cassYear}.
            </div>
          ) : cassResult ? (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <InfoRow label={`Minimum wage (1 Jan ${prevYear})`}>
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
                <InfoRow label={`Net interest ${prevYear}`}>
                  {fmtRon(prevYearIncome.interestNetRon)}
                  <span className="text-xs text-muted ml-2">
                    ({prevYearIncome.interestCount} payments)
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
                    <Legend wrapperStyle={{ color: "#9ca3af", fontSize: 12 }} />
                    <Bar
                      dataKey="dividends"
                      name="Dividends (net)"
                      stackId="income"
                      fill="#10b981"
                      radius={[0, 0, 0, 0]}
                    />
                    <Bar
                      dataKey="interest"
                      name="Interest (net)"
                      stackId="income"
                      fill="#8b5cf6"
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
