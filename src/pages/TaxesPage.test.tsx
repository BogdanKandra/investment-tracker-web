import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TaxesPage from "./TaxesPage";
import { renderWithPortfolio } from "../test/renderWithPortfolio";
import { samplePortfolio } from "../test/samplePortfolio";
import { account, buy, dividend, portfolio } from "../test/fixtures";

// All values in RON. Sells and the W-8BEN section use the live test rates
// (1 $ = 4.5 RON, 1 € = 5 RON); dividend, interest and CASS income use the
// recorded 2025 yearly averages (USD 4.4705, EUR 5.0415).
// Sample income, all in 2025 (so taxes are due in 2026):
//   DDD sell: 4 @ 75 against 4 @ 50 -> gross $100, tax $3, net $97
//   AAA dividend $30, $3 withheld (USA, after W-8BEN on 01-01-2025)
//   BBB dividend €20, €0.5 withheld (Germany)
//   Interest $10, $1 withheld (Romania)

/** The stats card with this label (ignores table headers with the same text). */
function card(label: string) {
  const el = screen
    .getAllByText(label)
    .find((e) => e.closest("table") === null)!;
  return el.parentElement!;
}

/** The <section> under the h2 whose name matches. */
function section(name: RegExp) {
  return screen.getByRole("heading", { level: 2, name }).closest("section")!;
}

/** The block holding a label and its value (label's parent). */
const labelled = (scope: HTMLElement, label: string) =>
  within(scope).getByText(label).parentElement!;

/** A portfolio with RON dividends only (no conversion, no withholding). */
const ronDividends = (...txs: Array<[date: string, amount: number]>) =>
  portfolio([
    account(
      "ron",
      [
        buy("01-01-2024", "RRR", 1, 1, { currency: "RON" }),
        ...txs.map(([date, amount]) =>
          dividend(date, "RRR", 1, amount, { currency: "RON" })
        ),
      ],
      "RON"
    ),
  ]);

describe("TaxesPage", () => {
  // Several sections default to the current year.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 25));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("totals the realised profit for the year", async () => {
    const user = userEvent.setup();
    renderWithPortfolio(<TaxesPage />);
    expect(screen.getByRole("heading", { name: "Taxes" })).toBeVisible();

    const pnl = section(/Realised Profit/);
    expect(within(pnl).getByRole("combobox", { name: /^Year/ })).toHaveValue(
      "2025"
    );
    expect(
      within(card("Sell Transactions (incl. losses)")).getByText("1")
    ).toBeVisible();
    // $3 * 4.5, $100 * 4.5, $97 * 4.5
    expect(
      within(card("Income Tax Paid")).getByText("RON 13.50")
    ).toBeVisible();
    expect(within(card("Gross Profit")).getByText("RON 450.00")).toBeVisible();
    expect(within(card("Net Profit")).getByText("RON 436.50")).toBeVisible();

    const row = within(within(pnl).getAllByRole("row")[1]!);
    expect(row.getByText("DDD")).toBeVisible();
    expect(row.getByText("RON 1,350.00")).toBeVisible(); // 4 * 75 * 4.5
    expect(row.getByText("RON 900.00")).toBeVisible(); // 4 * 50 * 4.5
    expect(within(pnl).getByText("Total for 2025 (RON)")).toBeVisible();

    await user.selectOptions(
      within(pnl).getByRole("combobox", { name: /^Currency/ }),
      "$"
    );
    expect(within(card("Gross Profit")).getByText("$100.00")).toBeVisible();
    expect(within(card("Net Profit")).getByText("$97.00")).toBeVisible();
    expect(within(pnl).getByText("Total for 2025 (USD)")).toBeVisible();
  });

  it("shows the W-8BEN tax saved on post-treaty USD dividends", () => {
    renderWithPortfolio(<TaxesPage />);
    const w8 = section(/^W-8BEN Treaty/);
    expect(within(w8).getByText("Active since 01 Jan 2025")).toBeVisible();
    // $30 gross = 135 RON; saved 135 * (30% - 10%)
    expect(
      within(labelled(w8, "Total Tax Saved (RON)")).getByText("RON 27.00")
    ).toBeVisible();
    const row = within(within(w8).getAllByRole("row")[1]!);
    expect(row.getByText("2025")).toBeVisible();
    expect(row.getByText("RON 135.00")).toBeVisible();
    expect(row.getByText("RON 13.50")).toBeVisible(); // $3 withheld
  });

  it("hides the W-8BEN section when the treaty is not active", () => {
    const noTreaty = { ...samplePortfolio };
    delete noTreaty.w_8ben_activated_at;
    renderWithPortfolio(<TaxesPage />, { portfolio: noTreaty });
    expect(
      screen.queryByRole("heading", { name: /^W-8BEN Treaty/ })
    ).toBeNull();
    // The rest of the page still renders.
    expect(
      screen.getByRole("heading", { name: "Dividend Taxes" })
    ).toBeVisible();
  });

  it("taxes only non-treaty foreign dividends", () => {
    renderWithPortfolio(<TaxesPage />);
    const div = section(/^Dividend Taxes$/);
    // AAA is post W-8BEN, so nothing is due on it. BBB (Germany):
    // €20 * 5.0415 = 100.83 RON at the 2025 rate of 10% = 10.08 RON
    expect(
      within(labelled(div, "Total dividend tax due in 2026")).getByText(
        "RON 10.08"
      )
    ).toBeVisible();
  });

  // Regression: without a W-8BEN date, USA dividends were once counted both
  // as "pre W-8BEN" and as "no W-8BEN", doubling the tax (RON 26.82).
  it("taxes USA dividends once when no W-8BEN is on file", () => {
    const p = portfolio([
      account("usd", [
        buy("01-01-2025", "AAA", 15, 100),
        dividend("15-03-2025", "AAA", 15, 2, { tax: 3, country: "USA" }),
      ]),
    ]);
    renderWithPortfolio(<TaxesPage />, { portfolio: p });
    const div = section(/^Dividend Taxes$/);
    // $30 * 4.4705 = 134.115 RON at 10% = 13.41 RON
    expect(
      within(labelled(div, "Total dividend tax due in 2026")).getByText(
        "RON 13.41"
      )
    ).toBeVisible();
  });

  it("computes the interest income tax", () => {
    renderWithPortfolio(<TaxesPage />);
    const int = section(/^Interest Income Taxes$/);
    // 10% of $10 = $1 > 0.5, so taxed: 10 * 4.4705 * 10% = 4.47 RON
    expect(
      within(int).getByText("total tax").previousSibling
    ).toHaveTextContent("RON 4.47");
    // ($10 - $1) * 4.4705 = 40.23 RON
    expect(
      within(
        labelled(int, "Net interest income (contributes to CASS base)")
      ).getByText("RON 40.23")
    ).toBeVisible();
  });

  it("hides the interest section when there is no interest income", () => {
    renderWithPortfolio(<TaxesPage />, {
      portfolio: ronDividends(["01-06-2025", 100]),
    });
    expect(
      screen.queryByRole("heading", { name: "Interest Income Taxes" })
    ).toBeNull();
  });

  it("computes CASS from the previous year's income", () => {
    renderWithPortfolio(<TaxesPage />);
    const cass = section(/^CASS Tax Contribution$/);
    expect(
      within(cass).getByRole("combobox", { name: /Due for year/ })
    ).toHaveValue("2026");
    expect(
      within(labelled(cass, "Minimum wage (1 Jan 2025)")).getByText(
        "RON 4,050.00"
      )
    ).toBeVisible();
    // Dividends: $27 * 4.4705 + €19.5 * 5.0415 = 120.70 + 98.31 = 219.01
    expect(labelled(cass, "Net dividends 2025")).toHaveTextContent(
      "RON 219.01(2 payments)"
    );
    // Interest: $9 * 4.4705
    expect(labelled(cass, "Net interest 2025")).toHaveTextContent("RON 40.23");
    // Sells: $97 * 4.5 (live rate)
    expect(labelled(cass, "Profitable sell net 2025")).toHaveTextContent(
      "RON 436.50(1 sells)"
    );
    // 219.01275 + 40.2345 + 436.5 = 695.75, under 6 * 4050 = 24,300
    expect(labelled(cass, "Total income (2025)")).toHaveTextContent(
      "RON 695.75"
    );
    expect(labelled(cass, "6 × minimum wage")).toHaveTextContent(
      "RON 24,300.00"
    );
    expect(
      within(cass).getByText("Under 6 × minimum wage — no CASS due")
    ).toBeVisible();
    expect(labelled(cass, "CASS tax due in 2026")).toHaveTextContent(
      "RON 0.00"
    );
  });

  it("uses the minimum wage in force on 1 January of the income year", async () => {
    vi.setSystemTime(new Date(2028, 2, 1));
    const user = userEvent.setup();
    // Income years 2024, 2026 and 2027 -> CASS due 2025, 2027 and 2028.
    renderWithPortfolio(<TaxesPage />, {
      portfolio: ronDividends(
        ["01-06-2024", 1000],
        ["01-06-2026", 30000],
        ["01-06-2027", 60000]
      ),
    });
    const cass = section(/^CASS Tax Contribution$/);
    const year = within(cass).getByRole("combobox", { name: /Due for year/ });
    expect(year).toHaveValue("2028"); // the current year

    // Income 2027: wage 4325 (raised 1 Jul 2026). 60,000 is between
    // 12 * 4325 = 51,900 and 24 * 4325 = 103,800 -> 10% of 51,900.
    expect(labelled(cass, "Minimum wage (1 Jan 2027)")).toHaveTextContent(
      "RON 4,325.00"
    );
    expect(
      within(cass).getByText("Between 12 and 24 × minimum wage")
    ).toBeVisible();
    expect(labelled(cass, "CASS tax due in 2028")).toHaveTextContent(
      "RON 5,190.00"
    );

    // Income 2026: still 4050 on 1 Jan 2026 (the July raise doesn't count).
    // 30,000 is between 6 * 4050 = 24,300 and 48,600 -> 10% of 24,300.
    await user.selectOptions(year, "2027");
    expect(labelled(cass, "Minimum wage (1 Jan 2026)")).toHaveTextContent(
      "RON 4,050.00"
    );
    expect(labelled(cass, "CASS tax due in 2027")).toHaveTextContent(
      "RON 2,430.00"
    );

    // Income 2024: 3300 on 1 Jan 2024 (the July 2024 raise doesn't count).
    // 1,000 is under 6 * 3300 = 19,800.
    await user.selectOptions(year, "2025");
    expect(labelled(cass, "Minimum wage (1 Jan 2024)")).toHaveTextContent(
      "RON 3,300.00"
    );
    expect(labelled(cass, "6 × minimum wage")).toHaveTextContent(
      "RON 19,800.00"
    );
    expect(labelled(cass, "CASS tax due in 2025")).toHaveTextContent(
      "RON 0.00"
    );
  });
});
