import { describe, expect, it } from "vitest";
import { convertCurrency, currencyLabel, formatCurrency } from "./currency";
import {
  formatDateStr,
  parseDate,
  timeRangeToDays,
  toChartDate,
  toIsoDate,
} from "./dates";
import { formatNumber, formatPercent, formatShares } from "./numbers";
import { makeRates } from "../test/fixtures";

// Intl uses non-breaking spaces in some currency formats.
const plain = (s: string) => s.replace(/\s/g, " "); // \s also matches NBSP

describe("currency", () => {
  const rates = makeRates(); // 1 $ = 4.5 RON, 1 € = 5 RON, 1 DKK = 0.5 RON

  it("maps symbols to ISO codes", () => {
    expect(currencyLabel("$")).toBe("USD");
    expect(currencyLabel("€")).toBe("EUR");
    expect(currencyLabel("RON")).toBe("RON");
    expect(currencyLabel("DKK")).toBe("DKK");
  });

  it("converts between every pair of currencies", () => {
    expect(convertCurrency(10, "$", "$", rates)).toBe(10);
    expect(convertCurrency(10, "$", "RON", rates)).toBeCloseTo(45, 9);
    expect(convertCurrency(45, "RON", "$", rates)).toBeCloseTo(10, 9);
    expect(convertCurrency(10, "€", "$", rates)).toBeCloseTo(50 / 4.5, 9);
    expect(convertCurrency(10, "DKK", "€", rates)).toBeCloseTo(1, 9);
    expect(convertCurrency(1, "RON", "DKK", rates)).toBeCloseTo(2, 9);
  });

  it("formats amounts with the currency code and two decimals", () => {
    expect(formatCurrency(1234.5, "$")).toBe("$1,234.50");
    expect(formatCurrency(-3, "€")).toBe("-€3.00");
    expect(plain(formatCurrency(1234.567, "RON"))).toBe("RON 1,234.57");
  });
});

describe("dates", () => {
  it("parses DD-MM-YYYY as a local date", () => {
    const d = parseDate("05-03-2024");
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2024, 2, 5]);
  });

  it("formats ISO and readable dates", () => {
    expect(toIsoDate(new Date(2024, 0, 9))).toBe("2024-01-09");
    expect(toChartDate("31-12-2023")).toBe("2023-12-31");
    expect(formatDateStr("15-02-2022")).toBe("15 Feb 2022");
  });

  it("maps time ranges to days, with ALL as unbounded", () => {
    expect(timeRangeToDays("1W")).toBe(7);
    expect(timeRangeToDays("5Y")).toBe(1825);
    expect(timeRangeToDays("ALL")).toBeNull();
  });
});

describe("numbers", () => {
  it("formats numbers, percents and share counts", () => {
    expect(formatNumber(1234.5)).toBe("1,234.50");
    expect(formatNumber(1.23456, 3)).toBe("1.235");
    expect(formatPercent(5)).toBe("+5.00%");
    expect(formatPercent(-1.234)).toBe("-1.23%");
    expect(formatPercent(0)).toBe("+0.00%");
    expect(formatShares(10)).toBe("10");
    expect(formatShares(1.5)).toBe("1.5000");
    expect(formatShares(0.1234567)).toBe("0.123457");
  });
});
