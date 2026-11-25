import { describe, expect, it } from "vitest";
import {
  AVERAGE_YEARLY_RATES_TO_RON,
  computeCassTax,
  computeSellPnL,
  computeYearlyIncome,
  FIRST_CASS_INCOME_YEAR,
  getCassMinimumWage,
  getCountryFromSymbol,
  getMinimumWageAt,
  toRonAtYearlyRate,
} from "./taxCalculator";
import {
  account,
  buy,
  dividend,
  interest,
  makeRates,
  sell,
} from "../test/fixtures";

const rates = makeRates(); // 1 $ = 4.5 RON, 1 € = 5 RON

describe("minimum wage history", () => {
  it("returns the wage in force on a date, including mid-year raises", () => {
    expect(getMinimumWageAt("2023-09-30")).toBeUndefined();
    expect(getMinimumWageAt("2023-10-01")).toBe(3300);
    expect(getMinimumWageAt("2024-06-30")).toBe(3300);
    expect(getMinimumWageAt("2024-07-01")).toBe(3700);
    expect(getMinimumWageAt("2025-01-01")).toBe(4050);
    expect(getMinimumWageAt("2026-06-30")).toBe(4050);
    expect(getMinimumWageAt("2026-07-01")).toBe(4325);
  });

  it("uses the wage in force on 1 January of the income year for CASS", () => {
    expect(getCassMinimumWage(2023)).toBeUndefined();
    expect(getCassMinimumWage(2024)).toBe(3300);
    expect(getCassMinimumWage(2025)).toBe(4050);
    expect(getCassMinimumWage(2026)).toBe(4050); // July raise ignored
    expect(getCassMinimumWage(2027)).toBe(4325);
  });

  it("starts CASS at the first year whose 1 January is covered", () => {
    expect(FIRST_CASS_INCOME_YEAR).toBe(2024);
  });
});

describe("computeCassTax", () => {
  const wage = 4000;

  it.each([
    [0, "below6", 0],
    [6 * wage - 0.01, "below6", 0],
    [6 * wage, "6to12", 0.1 * 6 * wage],
    [12 * wage - 0.01, "6to12", 0.1 * 6 * wage],
    [12 * wage, "12to24", 0.1 * 12 * wage],
    [24 * wage, "above24", 0.1 * 24 * wage],
    [1_000_000, "above24", 0.1 * 24 * wage],
  ])("income %d falls in %s with tax %d", (income, bracket, tax) => {
    const r = computeCassTax(income, wage, 0.1);
    expect(r.bracket).toBe(bracket);
    expect(r.tax).toBeCloseTo(tax, 6);
  });

  it("reports the bracket thresholds", () => {
    const r = computeCassTax(0, wage, 0.1);
    expect([r.sixWages, r.twelveWages, r.twentyFourWages]).toEqual([
      24000, 48000, 96000,
    ]);
  });
});

describe("computeSellPnL", () => {
  const accounts = [
    account("a", [
      buy("01-01-2024", "AAA", 10, 100),
      buy("01-02-2024", "AAA", 10, 200),
      sell("01-03-2024", "AAA", 15, 300, { tax: 10 }),
      buy("01-01-2025", "BBB", 4, 50, { currency: "€" }),
      sell("01-06-2025", "BBB", 4, 40, { currency: "€" }),
    ]),
    // Same symbol in another account must not consume account "a" lots.
    account("b", [
      buy("01-01-2024", "AAA", 1, 1000),
      sell("02-03-2024", "AAA", 1, 900),
    ]),
  ];
  const sells = computeSellPnL(accounts, rates);

  it("returns one record per sell, newest first", () => {
    expect(sells.map((s) => `${s.account}:${s.symbol}:${s.date}`)).toEqual([
      "a:BBB:01-06-2025",
      "b:AAA:02-03-2024",
      "a:AAA:01-03-2024",
    ]);
  });

  it("computes FIFO cost basis and gross/net profit in the trade currency", () => {
    const s = sells.find((x) => x.account === "a" && x.symbol === "AAA")!;
    expect(s.costBasis).toBe(10 * 100 + 5 * 200);
    expect(s.sellValue).toBe(15 * 300);
    expect(s.grossProfit).toBe(2500);
    expect(s.netProfit).toBe(2490);
    expect(s.year).toBe(2024);
  });

  it("keeps lots separate per account", () => {
    const s = sells.find((x) => x.account === "b")!;
    expect(s.costBasis).toBe(1000);
    expect(s.grossProfit).toBe(-100);
  });

  it("converts amounts to RON", () => {
    const s = sells.find((x) => x.symbol === "BBB")!;
    expect(s.currency).toBe("€");
    expect(s.grossProfit).toBe(-40);
    expect(s.grossProfitRon).toBeCloseTo(-40 * 5, 6);
  });
});

describe("computeYearlyIncome", () => {
  const accounts = [
    account("a", [
      buy("01-01-2025", "AAA", 10, 100),
      dividend("15-03-2025", "AAA", 10, 2, { tax: 2 }), // net $18
      interest("31-12-2025", 50, { tax: 5, currency: "€" }), // net €45
      dividend("15-03-2024", "AAA", 10, 9), // other year, excluded
      sell("01-06-2025", "AAA", 5, 120, { tax: 1 }), // +100 gross, +99 net
      buy("01-01-2025", "LOS", 1, 100),
      sell("01-07-2025", "LOS", 1, 50), // loss: excluded
    ]),
  ];
  const sells = computeSellPnL(accounts, rates);

  it("uses the BNR yearly average rate when one is recorded", () => {
    const usd2025 = AVERAGE_YEARLY_RATES_TO_RON["USD_2025"]!;
    const eur2025 = AVERAGE_YEARLY_RATES_TO_RON["EUR_2025"]!;
    const r = computeYearlyIncome(accounts, sells, 2025, rates);
    expect(r.dividendsNetRon).toBeCloseTo(18 * usd2025, 6);
    expect(r.interestNetRon).toBeCloseTo(45 * eur2025, 6);
    expect(r.dividendCount).toBe(1);
    expect(r.interestCount).toBe(1);
  });

  it("counts only profitable sells, at the sell's RON value", () => {
    const r = computeYearlyIncome(accounts, sells, 2025, rates);
    expect(r.profitableSellCount).toBe(1);
    expect(r.sellsNetRon).toBeCloseTo(99 * 4.5, 6);
    expect(r.totalRon).toBeCloseTo(
      r.dividendsNetRon + r.interestNetRon + r.sellsNetRon,
      6
    );
  });

  it("falls back to the live rate for years without a recorded average", () => {
    const acc = [account("a", [dividend("15-03-2030", "AAA", 1, 10)])];
    const r = computeYearlyIncome(acc, [], 2030, rates);
    expect(r.dividendsNetRon).toBeCloseTo(10 * 4.5, 6);
  });

  it("keeps RON amounts unchanged", () => {
    const acc = [
      account("a", [interest("01-02-2025", 100, { currency: "RON" })]),
    ];
    expect(computeYearlyIncome(acc, [], 2025, rates).interestNetRon).toBe(100);
  });
});

describe("getCountryFromSymbol", () => {
  it("prefers the explicit country, then ISIN, then suffix, then currency", () => {
    expect(getCountryFromSymbol("AAA", "$", "DE0001", "Ireland")).toBe(
      "Ireland"
    );
    expect(getCountryFromSymbol("AAA", "$", "DE0001")).toBe("Germany");
    expect(getCountryFromSymbol("TLV.RO", "RON")).toBe("Romania");
    expect(getCountryFromSymbol("MC.PA", "€")).toBe("France");
    expect(getCountryFromSymbol("SAP.DE", "€")).toBe("Germany");
    expect(getCountryFromSymbol("ASML.AS", "€")).toBe("Netherlands");
    expect(getCountryFromSymbol("AAPL", "$")).toBe("USA");
    expect(getCountryFromSymbol("NOVO", "DKK")).toBe("Other");
  });
});

describe("toRonAtYearlyRate", () => {
  it("uses the recorded yearly average, else the live rate", () => {
    const usd2025 = AVERAGE_YEARLY_RATES_TO_RON["USD_2025"]!;
    expect(toRonAtYearlyRate(10, "$", 2025, rates)).toBeCloseTo(10 * usd2025);
    expect(toRonAtYearlyRate(10, "$", 2030, rates)).toBeCloseTo(45);
    expect(toRonAtYearlyRate(10, "RON", 2025, rates)).toBe(10);
  });
});
