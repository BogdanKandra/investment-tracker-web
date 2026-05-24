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
import { formatCurrency, convertCurrency, currencyLabel } from "../utils/currency";
import { formatDateStr, parseDate } from "../utils/dates";
import { formatShares, formatNumber } from "../utils/numbers";
import {
  computeSellPnL,
  computeYearlyIncome,
  computeCassTax,
  ROMANIAN_MINIMUM_WAGE,
  DEFAULT_CASS_PROPORTION,
  DIVIDEND_TAX,
  AVERAGE_YEARLY_RATES_TO_RON,
  getCountryFromSymbol,
  type CassBracket,
} from "../data/taxCalculator";
import type { CurrencySymbol } from "../types";
import { useTableSort } from "../hooks/useTableSort";

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

const W8BEN_PRE_TREATY_RATE = 0.3;
const W8BEN_POST_TREATY_RATE = 0.1;

export default function TaxesPage() {
  const { portfolio, rates } = usePortfolio();

  const sells = useMemo(
    () => computeSellPnL(portfolio.accounts, rates),
    [portfolio.accounts, rates]
  );

  const sellYears = useMemo(() => {
    const s = new Set<number>(sells.map((x) => x.year));
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

  // --- W-8BEN impact summary ---
  const w8benDate = useMemo(() => {
    if (!portfolio.w_8ben_activated_at) return null;
    return parseDate(portfolio.w_8ben_activated_at);
  }, [portfolio.w_8ben_activated_at]);

  /**
   * For each year that has USD dividends, compute withheld amounts and the
   * tax saved (vs. the pre-treaty 30% rate) for post-treaty payments.
   */
  const w8benYearlyImpact = useMemo(() => {
    if (!w8benDate) return [];

    const byYear = new Map<
      number,
      { preTreatyGrossRon: number; postTreatyGrossRon: number; postTreatyFeeRon: number }
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
        const grossRon = convertCurrency(tx.shares! * tx.price!, tx.currency, "RON", rates);
        const feeRon = convertCurrency(tx.fee, tx.currency, "RON", rates);
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
    divTaxYears.includes(currentYear) ? currentYear : (divTaxYears[0] ?? currentYear)
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
        const gross = tx.shares! * tx.price!;
        const net = gross - tx.fee;
        const country = getCountryFromSymbol(tx.symbol!, tx.currency, tx.isin, tx.country);

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
          symbol: tx.symbol!,
          name: tx.name!,
          account: account.account_name,
          country,
          shares: tx.shares!,
          pricePerShare: tx.price!,
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
            description: "Dividends received after W-8BEN activation — no tax due (treaty benefit)",
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
    const months: { month: string; gross: number; withheld: number; net: number }[] = [];
    for (let m = 0; m < 12; m++) {
      months.push({
        month: new Date(divTaxPrevYear, m).toLocaleString("en-US", { month: "short" }),
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
    const byYear = new Map<number, { gross: number; withheld: number; net: number }>();
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
        const gross = tx.shares! * tx.price!;
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
    interestTaxYears.includes(currentYear) ? currentYear : (interestTaxYears[0] ?? currentYear)
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
        const gross = tx.amount!;
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

  const INTEREST_TAX_RATE = 0.10;

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
        interest: +income.interestNetRon.toFixed(2),
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

  // --- Sell P&L table sorting ---
  type SellSortKey = "date" | "symbol" | "account" | "shares" | "sellValue" | "costBasis" | "fee" | "grossProfit" | "netProfit";
  const sellComparators = useMemo(() => ({
    date: (a: typeof filteredSells[0], b: typeof filteredSells[0]) => parseDate(a.date).getTime() - parseDate(b.date).getTime(),
    symbol: (a: typeof filteredSells[0], b: typeof filteredSells[0]) => a.symbol.localeCompare(b.symbol),
    account: (a: typeof filteredSells[0], b: typeof filteredSells[0]) => a.account.localeCompare(b.account),
    shares: (a: typeof filteredSells[0], b: typeof filteredSells[0]) => a.shares - b.shares,
    sellValue: (a: typeof filteredSells[0], b: typeof filteredSells[0]) => a.sellValueRon - b.sellValueRon,
    costBasis: (a: typeof filteredSells[0], b: typeof filteredSells[0]) => a.costBasisRon - b.costBasisRon,
    fee: (a: typeof filteredSells[0], b: typeof filteredSells[0]) => a.feeRon - b.feeRon,
    grossProfit: (a: typeof filteredSells[0], b: typeof filteredSells[0]) => a.grossProfitRon - b.grossProfitRon,
    netProfit: (a: typeof filteredSells[0], b: typeof filteredSells[0]) => a.netProfitRon - b.netProfitRon,
  }), []);
  const sellSort = useTableSort(filteredSells, sellComparators as Record<SellSortKey, (a: typeof filteredSells[0], b: typeof filteredSells[0]) => number>, "date" as SellSortKey);

  // --- Dividend table sorting ---
  type DivSortKey = "date" | "symbol" | "account" | "country" | "gross" | "fee" | "net";
  const divComparators = useMemo(() => ({
    date: (a: DividendRow, b: DividendRow) => parseDate(a.date).getTime() - parseDate(b.date).getTime(),
    symbol: (a: DividendRow, b: DividendRow) => a.symbol.localeCompare(b.symbol),
    account: (a: DividendRow, b: DividendRow) => a.account.localeCompare(b.account),
    country: (a: DividendRow, b: DividendRow) => a.country.localeCompare(b.country),
    gross: (a: DividendRow, b: DividendRow) => a.grossAmountRon - b.grossAmountRon,
    fee: (a: DividendRow, b: DividendRow) => a.feeRon - b.feeRon,
    net: (a: DividendRow, b: DividendRow) => a.netAmountRon - b.netAmountRon,
  }), []);
  const divSort = useTableSort(dividendRows, divComparators as Record<DivSortKey, (a: DividendRow, b: DividendRow) => number>, "date" as DivSortKey);

  // --- Interest table sorting ---
  type IntSortKey = "date" | "account" | "country" | "gross" | "fee" | "net";
  const intComparators = useMemo(() => ({
    date: (a: InterestRow, b: InterestRow) => parseDate(a.date).getTime() - parseDate(b.date).getTime(),
    account: (a: InterestRow, b: InterestRow) => a.account.localeCompare(b.account),
    country: (a: InterestRow, b: InterestRow) => a.country.localeCompare(b.country),
    gross: (a: InterestRow, b: InterestRow) => a.grossAmountRon - b.grossAmountRon,
    fee: (a: InterestRow, b: InterestRow) => a.feeRon - b.feeRon,
    net: (a: InterestRow, b: InterestRow) => a.netAmountRon - b.netAmountRon,
  }), []);
  const intSort = useTableSort(interestRows, intComparators as Record<IntSortKey, (a: InterestRow, b: InterestRow) => number>, "date" as IntSortKey);

  // --- W-8BEN table sorting ---
  type W8benSortKey = "year" | "preTreatyGross" | "postTreatyGross" | "taxSaved";
  const w8benComparators = useMemo(() => ({
    year: (a: typeof w8benYearlyImpact[0], b: typeof w8benYearlyImpact[0]) => a.year - b.year,
    preTreatyGross: (a: typeof w8benYearlyImpact[0], b: typeof w8benYearlyImpact[0]) => a.preTreatyGrossRon - b.preTreatyGrossRon,
    postTreatyGross: (a: typeof w8benYearlyImpact[0], b: typeof w8benYearlyImpact[0]) => a.postTreatyGrossRon - b.postTreatyGrossRon,
    taxSaved: (a: typeof w8benYearlyImpact[0], b: typeof w8benYearlyImpact[0]) => a.taxSavedRon - b.taxSavedRon,
  }), []);
  const w8benSort = useTableSort(w8benYearlyImpact, w8benComparators as Record<W8benSortKey, (a: typeof w8benYearlyImpact[0], b: typeof w8benYearlyImpact[0]) => number>, "year" as W8benSortKey, true);

  const thSortable = "py-2 px-3 text-xs text-muted uppercase tracking-wide cursor-pointer hover:text-white select-none";

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
            label="Sell Transactions (incl. losses)"
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
                <th className={thSortable} onClick={() => sellSort.handleSort("date")}>
                  Date{sellSort.arrow("date")}
                </th>
                <th className={thSortable} onClick={() => sellSort.handleSort("symbol")}>
                  Symbol{sellSort.arrow("symbol")}
                </th>
                <th className="py-2 px-3 text-xs text-muted uppercase tracking-wide">
                  Name
                </th>
                <th className={thSortable} onClick={() => sellSort.handleSort("account")}>
                  Account{sellSort.arrow("account")}
                </th>
                <th className={`${thSortable} text-right`} onClick={() => sellSort.handleSort("shares")}>
                  Shares{sellSort.arrow("shares")}
                </th>
                <th className={`${thSortable} text-right`} onClick={() => sellSort.handleSort("sellValue")}>
                  Sell Value{sellSort.arrow("sellValue")}
                </th>
                <th className={`${thSortable} text-right`} onClick={() => sellSort.handleSort("costBasis")}>
                  Cost Basis{sellSort.arrow("costBasis")}
                </th>
                <th className={`${thSortable} text-right`} onClick={() => sellSort.handleSort("fee")}>
                  Income Tax{sellSort.arrow("fee")}
                </th>
                <th className={`${thSortable} text-right`} onClick={() => sellSort.handleSort("grossProfit")}>
                  Gross Profit{sellSort.arrow("grossProfit")}
                </th>
                <th className={`${thSortable} text-right`} onClick={() => sellSort.handleSort("netProfit")}>
                  Net Profit{sellSort.arrow("netProfit")}
                </th>
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
          SECTION 2 — W-8BEN Treaty
         ============================================================ */}
      {portfolio.w_8ben_activated_at && (
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
                . Post-treaty net dividends are higher, which increases the
                taxable base for Romanian CASS.
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
                    <th className={thSortable} onClick={() => w8benSort.handleSort("year")}>
                      Year{w8benSort.arrow("year")}
                    </th>
                    <th className={`${thSortable} text-right`} onClick={() => w8benSort.handleSort("preTreatyGross")}>
                      Pre-Treaty Gross (RON){w8benSort.arrow("preTreatyGross")}
                    </th>
                    <th className="py-2 px-3 text-xs text-muted uppercase tracking-wide text-right">
                      Pre-Treaty Withheld (30%)
                    </th>
                    <th className={`${thSortable} text-right`} onClick={() => w8benSort.handleSort("postTreatyGross")}>
                      Post-Treaty Gross (RON){w8benSort.arrow("postTreatyGross")}
                    </th>
                    <th className="py-2 px-3 text-xs text-muted uppercase tracking-wide text-right">
                      Post-Treaty Withheld (10%)
                    </th>
                    <th className={`${thSortable} text-right`} onClick={() => w8benSort.handleSort("taxSaved")}>
                      Tax Saved (RON){w8benSort.arrow("taxSaved")}
                    </th>
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
                        {row.preTreatyGrossRon > 0 ? fmtRon(row.preTreatyGrossRon) : "—"}
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
                        {row.postTreatyGrossRon > 0 ? fmtRon(row.postTreatyFeeRon) : "—"}
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
      )}

      {/* ============================================================
          SECTION 3 — Dividend Taxes
         ============================================================ */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">
              Dividend Taxes
            </h2>
            <p className="text-sm text-muted mt-1">
              Dividend income received in {divTaxPrevYear}, to be declared for {divTaxYear} taxes.
              {DIVIDEND_TAX[divTaxPrevYear] !== undefined && (
                <> Applicable dividend tax rate: <span className="text-white">{(DIVIDEND_TAX[divTaxPrevYear]! * 100).toFixed(0)}%</span>.</>
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
                <th className={thSortable} onClick={() => divSort.handleSort("date")}>
                  Date{divSort.arrow("date")}
                </th>
                <th className={thSortable} onClick={() => divSort.handleSort("symbol")}>
                  Symbol{divSort.arrow("symbol")}
                </th>
                <th className="py-2 px-3 text-xs text-muted uppercase tracking-wide">
                  Name
                </th>
                <th className={thSortable} onClick={() => divSort.handleSort("account")}>
                  Account{divSort.arrow("account")}
                </th>
                <th className={thSortable} onClick={() => divSort.handleSort("country")}>
                  Country{divSort.arrow("country")}
                </th>
                <th className={`${thSortable} text-right`} onClick={() => divSort.handleSort("gross")}>
                  Gross{divSort.arrow("gross")}
                </th>
                <th className={`${thSortable} text-right`} onClick={() => divSort.handleSort("fee")}>
                  Tax Withheld{divSort.arrow("fee")}
                </th>
                <th className={`${thSortable} text-right`} onClick={() => divSort.handleSort("net")}>
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
                  <td className="py-2.5 px-3 text-sm text-muted">
                    {r.account}
                  </td>
                  <td className="py-2.5 px-3 text-sm text-muted">
                    {r.country}
                  </td>
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
                <div key={cs.country} className="border-b border-white/5 pb-4 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white font-medium">{cs.country}</span>
                    <span className="text-white font-semibold">{fmtRon(cs.grossRon)} gross</span>
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
                          <span className="text-white">{fmtRon(cs.preW8benGrossRon)} gross</span>
                          <span className="text-muted mx-2">·</span>
                          <span className="text-loss">{fmtRon(cs.preW8benFeeRon)} withheld</span>
                        </div>
                      )}
                      {cs.postW8benGrossRon > 0 && (
                        <div className="text-sm">
                          <span className="text-muted">Post W-8BEN:</span>{" "}
                          <span className="text-white">{fmtRon(cs.postW8benGrossRon)} gross</span>
                          <span className="text-muted mx-2">·</span>
                          <span className="text-loss">{fmtRon(cs.postW8benFeeRon)} withheld</span>
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
                    <div className="text-white font-medium text-sm">{d.country}</div>
                    <div className="text-xs text-muted mt-0.5">{d.description}</div>
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

      {/* ============================================================
          SECTION 4 — Interest Taxes
         ============================================================ */}
      {interestTaxYears.length > 0 && (
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">
                Interest Income Taxes
              </h2>
              <p className="text-sm text-muted mt-1">
                Interest income received in {interestTaxPrevYear}, to be declared for {interestTaxYear} taxes.
                Income tax rate: <span className="text-white">10%</span> (waived when tax &le; 0.5 currency units per payment).
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
                  <th className={thSortable} onClick={() => intSort.handleSort("date")}>
                    Date{intSort.arrow("date")}
                  </th>
                  <th className={thSortable} onClick={() => intSort.handleSort("account")}>
                    Account{intSort.arrow("account")}
                  </th>
                  <th className={thSortable} onClick={() => intSort.handleSort("country")}>
                    Country{intSort.arrow("country")}
                  </th>
                  <th className="py-2 px-3 text-xs text-muted uppercase tracking-wide">
                    Note
                  </th>
                  <th className={`${thSortable} text-right`} onClick={() => intSort.handleSort("gross")}>
                    Gross{intSort.arrow("gross")}
                  </th>
                  <th className={`${thSortable} text-right`} onClick={() => intSort.handleSort("fee")}>
                    Income Tax{intSort.arrow("fee")}
                  </th>
                  <th className={`${thSortable} text-right`} onClick={() => intSort.handleSort("net")}>
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
                          <span className="text-muted" title="Tax waived (≤ 0.5 currency units)">
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
                  <div key={cs.country} className="border-b border-white/5 pb-4 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white font-medium">{cs.country}</span>
                      <span className="text-white font-semibold">{fmtRon(cs.grossRon)} gross</span>
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
                  <div className="text-white font-medium text-sm">Income tax on interest (10%)</div>
                  <div className="text-xs text-muted mt-0.5">
                    Applied to each interest payment where 10% exceeds 0.5 currency units.
                    Payments below this threshold are tax-exempt.
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
      )}

      {/* ============================================================
          SECTION 5 — CASS Tax
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
