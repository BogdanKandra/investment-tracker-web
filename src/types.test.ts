import { describe, expect, it } from "vitest";
import { isSecurityTransaction, transactionCharges } from "./types";
import { buy, dividend, interest, sell } from "./test/fixtures";

describe("transaction helpers", () => {
  it("reports commission for buys and withheld tax for everything else", () => {
    expect(
      transactionCharges(buy("01-01-2024", "A", 1, 1, { commission: 2 }))
    ).toEqual({ commission: 2, taxWithheld: 0 });
    expect(
      transactionCharges(sell("01-01-2024", "A", 1, 1, { tax: 3 }))
    ).toEqual({ commission: 0, taxWithheld: 3 });
    expect(
      transactionCharges(dividend("01-01-2024", "A", 1, 1, { tax: 4 }))
    ).toEqual({ commission: 0, taxWithheld: 4 });
    expect(transactionCharges(interest("01-01-2024", 1, { tax: 5 }))).toEqual({
      commission: 0,
      taxWithheld: 5,
    });
  });

  it("tells security transactions from interest", () => {
    expect(isSecurityTransaction(buy("01-01-2024", "A", 1, 1))).toBe(true);
    expect(isSecurityTransaction(interest("01-01-2024", 1))).toBe(false);
  });
});
