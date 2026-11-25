import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DividendsPage from "./DividendsPage";
import { renderWithPortfolio } from "../test/renderWithPortfolio";
import { account, buy, dividend, portfolio, sell } from "../test/fixtures";

// Sample portfolio in $, with 1 € = 5/4.5 $ (see test/fixtures makeRates).
// Dividends: AAA 15 x $2 = $30, $3 withheld (15-03-2025, after the W-8BEN
// date 01-01-2025); BBB 20 x €1 = €20 (= $22.22), €0.5 withheld (20-06-2025).
// The page uses no live prices.

/** The stats card with this label (ignores table headers with the same text). */
function card(label: string) {
  const el = screen
    .getAllByText(label)
    .find((e) => e.closest("table") === null)!;
  return el.parentElement!;
}

/** Body rows of the "Dividend Income by Holding" table. */
const holdingRows = () => screen.getAllByRole("row").slice(1);
const symbolsInOrder = () =>
  holdingRows().map((r) => within(r).getAllByRole("cell")[0]!.textContent);

describe("DividendsPage", () => {
  it("totals gross, withheld and net dividends", () => {
    renderWithPortfolio(<DividendsPage />);
    expect(screen.getByRole("heading", { name: "Dividends" })).toBeVisible();
    // $30 + €20 ($22.22)
    expect(within(card("Gross Dividends")).getByText("$52.22")).toBeVisible();
    // $3 + €0.5 ($0.56)
    expect(within(card("Withholding Tax")).getByText("$3.56")).toBeVisible();
    expect(within(card("Net Dividends")).getByText("$48.67")).toBeVisible();
    // $3.56 / $52.22 = 6.8%
    expect(within(card("Effective Tax Rate")).getByText("6.8%")).toBeVisible();
    // $48.67 net / $2744.44 invested in current holdings
    // ($1600 AAA + €1000 BBB + €30 CCC) = 1.77%
    expect(within(card("Yield on Cost")).getByText("1.77%")).toBeVisible();
  });

  it("shows the W-8BEN treaty impact on USD dividends", () => {
    renderWithPortfolio(<DividendsPage />);
    expect(screen.getByText("W-8BEN Treaty Active")).toBeVisible();
    expect(screen.getByText("01 Jan 2025")).toBeVisible();
    // The only USD dividend (AAA, $30) is after activation.
    expect(
      screen.getByText(/Post-Treaty \(10% rate\) · 1\s+payments/)
    ).toBeVisible();
    // $30 * (30% - 10%)
    const savings = screen.getByText("W-8BEN Savings").parentElement!;
    expect(within(savings).getByText("$6.00")).toBeVisible();
  });

  it("breaks dividends down per holding and sorts the table", async () => {
    const user = userEvent.setup();
    renderWithPortfolio(<DividendsPage />);

    // Default: by net, largest first. AAA $27 vs BBB €19.5 = $21.67.
    expect(screen.getByRole("columnheader", { name: /^Net/ })).toHaveAttribute(
      "aria-sort",
      "descending"
    );
    expect(symbolsInOrder()).toEqual(["AAA", "BBB"]);
    const [aaa, bbb] = holdingRows();
    expect(within(aaa!).getByText("$27.00")).toBeVisible();
    expect(within(aaa!).getByText("10.0%")).toBeVisible(); // $3 / $30
    expect(within(aaa!).getByText("15 Mar 2025")).toBeVisible();
    expect(within(bbb!).getByText("$21.67")).toBeVisible();
    expect(within(bbb!).getByText("2.5%")).toBeVisible(); // €0.5 / €20
    // €19.5 net on €1000 invested
    expect(within(bbb!).getByText("1.95%")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Symbol" }));
    expect(
      screen.getByRole("columnheader", { name: /^Symbol/ })
    ).toHaveAttribute("aria-sort", "descending");
    expect(screen.getByRole("columnheader", { name: /^Net/ })).toHaveAttribute(
      "aria-sort",
      "none"
    );
    expect(symbolsInOrder()).toEqual(["BBB", "AAA"]);
  });

  it("narrows to one account", async () => {
    const user = userEvent.setup();
    renderWithPortfolio(<DividendsPage />);
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Account" }),
      "eur_broker"
    );
    // Only BBB's €20
    expect(within(card("Gross Dividends")).getByText("$22.22")).toBeVisible();
    expect(symbolsInOrder()).toEqual(["BBB"]);
    expect(
      screen.getByText("No post-treaty USD dividends received yet.")
    ).toBeVisible();
  });

  it("converts to the chosen display currency", async () => {
    const user = userEvent.setup();
    renderWithPortfolio(<DividendsPage />);
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Display currency" }),
      "€"
    );
    // $30 * 0.9 + €20
    expect(within(card("Gross Dividends")).getByText("€47.00")).toBeVisible();
  });

  // Regression: the placeholder was once the JSX text —, which JSX
  // shows literally instead of as an em dash.
  it("shows a dash as yield on cost for a symbol no longer held", () => {
    const p = portfolio([
      account("usd", [
        buy("01-01-2025", "XXX", 10, 10),
        dividend("01-02-2025", "XXX", 10, 1),
        sell("01-03-2025", "XXX", 10, 12),
      ]),
    ]);
    renderWithPortfolio(<DividendsPage />, { portfolio: p });
    const yieldCell = within(holdingRows()[0]!).getAllByRole("cell")[5]!;
    expect(yieldCell).toHaveTextContent("—");
  });
});
