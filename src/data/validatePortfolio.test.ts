import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PortfolioValidationError,
  validatePortfolio,
} from "./validatePortfolio";
import {
  account,
  buy,
  dividend,
  interest,
  portfolio,
  sell,
  toRawPortfolio,
} from "../test/fixtures";

type Json = Record<string, unknown>;
type RawPortfolio = {
  accounts: Array<{ currency: unknown; transactions: Json[] }>;
  watchlist: unknown;
};

/** A small valid portfolio in portfolio.json form (single `fee` field). */
function rawSample(): RawPortfolio {
  return toRawPortfolio(
    portfolio([
      account("a", [
        buy("01-01-2024", "AAA", 1, 10, { commission: 0.5 }),
        interest("02-01-2024", 1, { tax: 0.1 }),
      ]),
    ])
  ) as unknown as RawPortfolio;
}

function problemsOf(data: unknown): string[] {
  try {
    validatePortfolio(data);
  } catch (e) {
    if (e instanceof PortfolioValidationError) return e.problems;
    throw e;
  }
  return [];
}

describe("validatePortfolio", () => {
  it("accepts the bundled test portfolio", () => {
    const raw = JSON.parse(
      readFileSync(resolve(process.cwd(), "data/portfolio_test.json"), "utf8")
    );
    expect(() => validatePortfolio(raw)).not.toThrow();
  });

  it("maps each type's `fee` to commission or taxWithheld", () => {
    const expected = portfolio([
      account("a", [
        buy("01-01-2024", "AAA", 2, 10, { commission: 1 }),
        sell("01-02-2024", "AAA", 1, 12, { tax: 0.2 }),
        dividend("01-03-2024", "AAA", 1, 1, { tax: 0.1 }),
        interest("01-04-2024", 5, { tax: 0.5 }),
      ]),
    ]);
    const raw = toRawPortfolio(expected);
    expect(
      (raw.accounts as Array<{ transactions: Json[] }>)[0]!.transactions.map(
        (t) => t.fee
      )
    ).toEqual([1, 0.2, 0.1, 0.5]);
    expect(validatePortfolio(raw)).toEqual(expected);
  });

  it("does not modify its input", () => {
    const raw = rawSample();
    const copy = structuredClone(raw);
    validatePortfolio(raw);
    expect(raw).toEqual(copy);
  });

  it("rejects a non-object root", () => {
    expect(problemsOf([])).toEqual(["(root): expected an object"]);
    expect(problemsOf(null)).toEqual(["(root): expected an object"]);
  });

  it("reports every problem with its path", () => {
    const p = rawSample();
    p.accounts[0]!.transactions[0]!.price = "10";
    p.accounts[0]!.transactions[0]!.date = "31-02-2024";
    delete p.accounts[0]!.transactions[1]!.amount;
    p.accounts[0]!.currency = "USD";
    p.watchlist = {};

    expect(problemsOf(p)).toEqual([
      "accounts[0].currency: expected one of $, €, RON, DKK",
      "accounts[0].transactions[0].date: expected a date as DD-MM-YYYY",
      "accounts[0].transactions[0].price: expected a number",
      "accounts[0].transactions[1].amount: expected a number",
      "watchlist: expected an array",
    ]);
  });

  it("requires a numeric fee", () => {
    const p = rawSample();
    delete p.accounts[0]!.transactions[0]!.fee;
    expect(problemsOf(p)).toEqual([
      "accounts[0].transactions[0].fee: expected a number",
    ]);
  });

  it("rejects unknown transaction types", () => {
    const p = rawSample();
    p.accounts[0]!.transactions[0]!.type = "Buyy";
    expect(problemsOf(p)).toEqual([
      "accounts[0].transactions[0].type: expected one of Buy, Sell, Dividend, Interest",
    ]);
  });

  it("limits the message to 20 problems but keeps them all", () => {
    const p = rawSample();
    p.accounts[0]!.transactions = Array.from({ length: 25 }, () => ({
      ...p.accounts[0]!.transactions[0]!,
      fee: "x",
    }));
    try {
      validatePortfolio(p);
      expect.unreachable();
    } catch (e) {
      const err = e as PortfolioValidationError;
      expect(err.problems).toHaveLength(25);
      expect(err.message).toContain("…and 5 more");
    }
  });
});
