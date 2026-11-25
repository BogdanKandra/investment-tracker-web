import { describe, expect, it } from "vitest";
import { computeFifo, matchFifo } from "./fifoCalculator";
import { buy, dividend, sell } from "../test/fixtures";

describe("computeFifo", () => {
  it("returns zeros for no transactions", () => {
    expect(computeFifo([])).toEqual({
      remainingLots: [],
      totalShares: 0,
      totalCost: 0,
      averageCost: 0,
      realizedPnL: 0,
      totalCommission: 0,
      totalTaxWithheld: 0,
    });
  });

  it("averages the cost of open lots", () => {
    const r = computeFifo([
      buy("01-01-2024", "AAA", 10, 100),
      buy("01-02-2024", "AAA", 10, 200),
    ]);
    expect(r.totalShares).toBe(20);
    expect(r.totalCost).toBe(3000);
    expect(r.averageCost).toBe(150);
    expect(r.remainingLots).toHaveLength(2);
  });

  it("sells the oldest lots first and books realized P&L net of the tax withheld on the sell", () => {
    const r = computeFifo([
      buy("01-01-2024", "AAA", 10, 100, { commission: 1 }),
      buy("01-02-2024", "AAA", 10, 200, { commission: 2 }),
      sell("01-03-2024", "AAA", 15, 300, { tax: 5 }),
    ]);
    // 10 shares from the 100 lot and 5 from the 200 lot.
    expect(r.realizedPnL).toBe(10 * 200 + 5 * 100 - 5);
    expect(r.totalShares).toBe(5);
    expect(r.remainingLots).toEqual([
      { date: "01-02-2024", shares: 5, price: 200, commission: 2 },
    ]);
    expect(r.averageCost).toBe(200);
    expect(r.totalCommission).toBe(1 + 2);
    expect(r.totalTaxWithheld).toBe(5);
  });

  it("processes transactions by date, not input order", () => {
    const r = computeFifo([
      sell("01-03-2024", "AAA", 5, 300),
      buy("01-02-2024", "AAA", 5, 200),
      buy("01-01-2024", "AAA", 5, 100),
    ]);
    expect(r.realizedPnL).toBe(5 * 200);
    expect(r.remainingLots[0]?.price).toBe(200);
  });

  it("ignores dividends", () => {
    const r = computeFifo([
      buy("01-01-2024", "AAA", 10, 100),
      dividend("01-06-2024", "AAA", 10, 1, { tax: 0.3 }),
    ]);
    expect(r.totalShares).toBe(10);
    expect(r.totalCommission).toBe(0);
    expect(r.totalTaxWithheld).toBe(0);
    expect(r.realizedPnL).toBe(0);
  });

  it("closes the position when everything is sold", () => {
    const r = computeFifo([
      buy("01-01-2024", "AAA", 3, 10),
      sell("01-02-2024", "AAA", 3, 12),
    ]);
    expect(r.totalShares).toBe(0);
    expect(r.remainingLots).toEqual([]);
    expect(r.realizedPnL).toBe(6);
  });

  it("only realizes P&L on shares actually held when overselling", () => {
    const r = computeFifo([
      buy("01-01-2024", "AAA", 2, 10),
      sell("01-02-2024", "AAA", 5, 20),
    ]);
    expect(r.realizedPnL).toBe(2 * 10);
    expect(r.totalShares).toBe(0);
  });
});

describe("matchFifo", () => {
  it("reports cost basis and matched shares per sell, in date order", () => {
    const { sells, openLots } = matchFifo([
      buy("01-01-2024", "AAA", 10, 100),
      sell("01-02-2024", "AAA", 4, 150),
      buy("01-03-2024", "AAA", 10, 200),
      sell("01-04-2024", "AAA", 10, 250),
    ]);
    expect(sells.map((s) => [s.tx.date, s.matchedShares, s.costBasis])).toEqual(
      [
        ["01-02-2024", 4, 400],
        ["01-04-2024", 10, 6 * 100 + 4 * 200],
      ]
    );
    expect(openLots).toEqual([
      { date: "01-03-2024", shares: 6, price: 200, commission: 0 },
    ]);
  });

  it("matches only the shares held when overselling", () => {
    const { sells } = matchFifo([
      buy("01-01-2024", "AAA", 2, 10),
      sell("01-02-2024", "AAA", 5, 20),
    ]);
    expect(sells[0]).toMatchObject({ matchedShares: 2, costBasis: 20 });
  });

  it("treats float residue from fractional shares as fully sold", () => {
    const { openLots } = matchFifo([
      buy("01-01-2024", "AAA", 0.1, 10),
      buy("02-01-2024", "AAA", 0.2, 10),
      sell("01-02-2024", "AAA", 0.3, 20), // 0.1 + 0.2 !== 0.3 in floats
    ]);
    expect(openLots).toEqual([]);
  });
});
