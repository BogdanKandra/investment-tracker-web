import { describe, expect, it } from "vitest";
import {
  getCurrentHoldings,
  getFormerHoldings,
  getHoldings,
} from "./holdingAggregator";
import { account, buy, dividend, interest, sell } from "../test/fixtures";

const accounts = [
  account("broker_a", [
    interest("05-01-2024", 3),
    buy("10-01-2024", "AAA", 10, 100, { name: "Alpha" }),
    buy("10-02-2024", "BBB", 5, 20, { name: "Beta" }),
    sell("10-03-2024", "BBB", 5, 30, { name: "Beta" }),
    dividend("10-04-2024", "AAA", 10, 1, { name: "Alpha" }),
  ]),
  account("broker_b", [buy("15-01-2024", "AAA", 10, 200, { name: "Alpha" })]),
];

describe("getHoldings", () => {
  it("builds one holding per symbol per account when an account is selected", () => {
    const h = getHoldings(accounts, "broker_a");
    expect(h.map((x) => x.symbol).sort()).toEqual(["AAA", "BBB"]);
    const aaa = h.find((x) => x.symbol === "AAA")!;
    expect(aaa.accountName).toBe("broker_a");
    expect(aaa.name).toBe("Alpha");
    expect(aaa.totalShares).toBe(10);
    // Interest has no symbol and must not create a holding.
    expect(aaa.transactions.every((t) => t.symbol === "AAA")).toBe(true);
  });

  it("marks fully sold positions as closed with their realized P&L", () => {
    const bbb = getHoldings(accounts, "broker_a").find(
      (x) => x.symbol === "BBB"
    )!;
    expect(bbb.isClosed).toBe(true);
    expect(bbb.realizedPnL).toBe(50);
  });

  it("merges the same symbol across accounts when no account is selected", () => {
    const aaa = getHoldings(accounts).find((x) => x.symbol === "AAA")!;
    expect(aaa.accountName).toBe("All");
    expect(aaa.totalShares).toBe(20);
    expect(aaa.totalInvested).toBe(10 * 100 + 10 * 200);
    expect(aaa.averageCost).toBe(150);
    expect(aaa.lots).toHaveLength(2);
  });
});

describe("current and former holdings", () => {
  it("splits open and closed positions", () => {
    expect(getCurrentHoldings(accounts).map((h) => h.symbol)).toEqual([
      "AAA",
    ]);
    expect(getFormerHoldings(accounts).map((h) => h.symbol)).toEqual(["BBB"]);
  });
});
