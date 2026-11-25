import { describe, expect, it } from "vitest";
import {
  buildShareLedger,
  computePortfolioValueAt,
  findComparisonStart,
  getLastKnownClose,
  getSharesAt,
  scaledBenchmarkValue,
} from "./valuation";
import type { ResolvedBenchmark } from "./benchmarks";
import type { CurrencySymbol } from "../../types";
import { account, buy, dividend, makeRates, sell } from "../../test/fixtures";

const rates = makeRates(); // 1 $ = 4.5 RON, 1 € = 5 RON

const ledger = buildShareLedger([
  account("a", [
    buy("10-01-2024", "AAA", 10, 1),
    sell("10-03-2024", "AAA", 4, 1),
    dividend("10-02-2024", "AAA", 10, 1), // ignored
  ]),
  account("b", [
    buy("20-02-2024", "AAA", 5, 1),
    buy("01-02-2024", "BBB", 2, 1),
  ]),
]);

describe("share ledger", () => {
  it("accumulates buys and sells per symbol across accounts, by date", () => {
    expect(ledger.get("AAA")).toEqual([
      { date: "2024-01-10", cumShares: 10 },
      { date: "2024-02-20", cumShares: 15 },
      { date: "2024-03-10", cumShares: 11 },
    ]);
  });

  it("returns shares held on a date", () => {
    const aaa = ledger.get("AAA")!;
    expect(getSharesAt(aaa, "2024-01-09")).toBe(0);
    expect(getSharesAt(aaa, "2024-01-10")).toBe(10);
    expect(getSharesAt(aaa, "2024-03-01")).toBe(15);
    expect(getSharesAt(aaa, "2030-01-01")).toBe(11);
  });
});

describe("price helpers", () => {
  const history = [
    { time: "2024-01-01", close: 10 },
    { time: "2024-02-01", close: 12 },
  ];

  it("returns the last close on or before a date", () => {
    expect(getLastKnownClose(history, "2023-12-31")).toBeUndefined();
    expect(getLastKnownClose(history, "2024-01-15")).toBe(10);
    expect(getLastKnownClose(history, "2024-02-01")).toBe(12);
  });

  it("scales a baseline by the benchmark's price return", () => {
    expect(scaledBenchmarkValue(12, 10, 1000)).toBe(1200);
    expect(scaledBenchmarkValue(undefined, 10, 1000)).toBeNull();
    expect(scaledBenchmarkValue(12, 0, 1000)).toBeNull();
    expect(scaledBenchmarkValue(12, 10, 0)).toBeNull();
  });
});

describe("portfolio valuation", () => {
  const histories = new Map([
    ["AAA", [{ time: "2024-01-01", close: 2 }]],
    ["BBB", [{ time: "2024-02-15", close: 10 }]],
  ]);
  const currencies = new Map<string, CurrencySymbol>([
    ["AAA", "$"],
    ["BBB", "€"],
  ]);

  it("values held shares in the display currency", () => {
    // 15 AAA * $2 = $30 and 2 BBB * €10 = €20 -> RON 135 + 100
    expect(
      computePortfolioValueAt(
        "2024-03-01",
        ["AAA", "BBB"],
        histories,
        ledger,
        currencies,
        "RON",
        rates
      )
    ).toBe(235);
  });

  it("needs a price for every held symbol unless told otherwise", () => {
    const valueAt = (requireAll: boolean) =>
      computePortfolioValueAt(
        "2024-02-10",
        ["AAA", "BBB"],
        histories,
        ledger,
        currencies,
        "$",
        rates,
        requireAll
      );
    // BBB is held but has no price yet on that date.
    expect(valueAt(true)).toBeNull();
    expect(valueAt(false)).toBe(20); // 10 AAA * $2
  });

  it("starts the comparison at the first date with full portfolio and benchmark prices", () => {
    const bench: ResolvedBenchmark[] = [
      {
        id: "sp500",
        label: "S&P 500",
        color: "#000",
        symbol: "^GSPC",
        currency: "$",
        history: [{ time: "2024-03-01", close: 100 }],
      } as unknown as ResolvedBenchmark,
    ];
    expect(
      findComparisonStart(
        ["2024-01-15", "2024-02-20", "2024-03-01"],
        ["AAA", "BBB"],
        histories,
        ledger,
        currencies,
        "$",
        rates,
        bench
      )
    ).toEqual({ time: "2024-03-01", value: 52.22 }); // $30 + €20 (= $22.22), 2 dp
  });
});
