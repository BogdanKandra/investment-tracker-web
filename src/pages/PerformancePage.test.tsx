import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PerformancePage from "./PerformancePage";
import { renderWithPortfolio } from "../test/renderWithPortfolio";
import { mockFetch } from "../test/mockFetch";
import { SAMPLE_PRICES } from "../test/samplePortfolio";

// Sample portfolio in $, with 1 € = 5/4.5 $ (see test/fixtures makeRates).
// Live prices: AAA $150, BBB €60, CCC none (valued at its €10 average cost).
// Open: AAA 15 sh ($1600 cost), BBB 20 sh (€1000), CCC 3 sh (€30).
// Closed: DDD, sold 4 @ 75 against 4 @ 50 (gross +$100, $3 tax).

/** The Returns Summary card with this label. */
function summaryCard(label: string) {
  const section = screen.getByRole("heading", {
    name: /Returns Summary/,
  }).parentElement!;
  return within(section).getByText(label).parentElement!;
}

/** Body rows of the holding performance table (the page's only table). */
const holdingRows = () =>
  within(
    within(screen.getByRole("table")).getAllByRole("rowgroup")[1]!
  ).getAllByRole("row");
const symbolsInOrder = () =>
  holdingRows().map((r) => within(r).getAllByRole("cell")[0]!.textContent);

const pricesLoaded = () => screen.findByText(/No live price for CCC/);

describe("PerformancePage", () => {
  it("summarises realized and unrealized returns", async () => {
    mockFetch();
    renderWithPortfolio(<PerformancePage />);
    expect(screen.getByRole("heading", { name: "Performance" })).toBeVisible();
    await pricesLoaded();

    expect(
      screen.getByRole("heading", { name: "All Accounts — Returns Summary" })
    ).toBeVisible();
    // AAA 15*150 - 1600 = +$650, BBB 20*60 - 1000 = €200 ($222.22), CCC 0;
    // $872.22 on $2744.44 invested = 31.78%
    const unrealized = summaryCard("Unrealized P&L");
    expect(within(unrealized).getByText("$872.22")).toBeVisible();
    expect(within(unrealized).getByText("+31.78%")).toBeVisible();
    const realized = summaryCard("Realized P&L");
    expect(within(realized).getByText("$100.00")).toBeVisible();
    expect(within(realized).getByText("1 trades")).toBeVisible();
    // $872.22 + $100
    expect(
      within(summaryCard("Combined P&L")).getByText("$972.22")
    ).toBeVisible();
    // AAA and BBB gained, CCC is flat: 2 of 3
    const winOpen = summaryCard("Win Rate (Open)");
    expect(within(winOpen).getByText("67%")).toBeVisible();
    expect(within(winOpen).getByText("2W / 0L")).toBeVisible();
    expect(
      within(summaryCard("Active Positions")).getByText("3")
    ).toBeVisible();
  });

  it("names the holding that has no live price", async () => {
    mockFetch();
    renderWithPortfolio(<PerformancePage />);
    const notice = await pricesLoaded();
    expect(notice).toHaveAttribute("role", "status");
    expect(notice).toHaveTextContent(/^No live price for CCC\./);
  });

  it("lists each holding's return and sorts the table", async () => {
    const user = userEvent.setup();
    mockFetch();
    renderWithPortfolio(<PerformancePage />);
    await pricesLoaded();

    // Default: by return, best first. AAA 650/1600 = 40.6%, BBB 20%, CCC 0%.
    expect(
      screen.getByRole("columnheader", { name: /^Return/ })
    ).toHaveAttribute("aria-sort", "descending");
    expect(symbolsInOrder()).toEqual(["AAA", "BBB", "CCC"]);
    const bbb = holdingRows()[1]!;
    expect(within(bbb).getByText("$1,111.11")).toBeVisible(); // €1000
    expect(within(bbb).getByText("$1,333.33")).toBeVisible(); // €1200
    expect(within(bbb).getByText("+20.00%")).toBeVisible();
    // $1333.33 of $3616.67 total value
    expect(within(bbb).getByText("36.9%")).toBeVisible();

    const footer = within(
      within(screen.getByRole("table")).getAllByRole("rowgroup")[2]!
    ).getByRole("row");
    expect(within(footer).getByText("Total")).toBeVisible();
    expect(within(footer).getByText("$2,744.44")).toBeVisible();
    expect(within(footer).getByText("$3,616.67")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Invested" }));
    expect(
      screen.getByRole("columnheader", { name: /^Invested/ })
    ).toHaveAttribute("aria-sort", "descending");
    expect(
      screen.getByRole("columnheader", { name: /^Return/ })
    ).toHaveAttribute("aria-sort", "none");
    // $1600, $1111.11, $33.33: same order, so flip to check it re-sorts.
    await user.click(screen.getByRole("button", { name: "Invested" }));
    expect(symbolsInOrder()).toEqual(["CCC", "BBB", "AAA"]);
  });

  it("narrows to one account", async () => {
    const user = userEvent.setup();
    mockFetch();
    renderWithPortfolio(<PerformancePage />);
    await pricesLoaded();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Account" }),
      "eur_broker"
    );
    expect(
      screen.getByRole("heading", { name: "eur_broker — Returns Summary" })
    ).toBeVisible();
    // BBB only: €200 = $222.22; no sells in this account.
    expect(
      within(summaryCard("Unrealized P&L")).getByText("$222.22")
    ).toBeVisible();
    expect(
      within(summaryCard("Realized P&L")).getByText("0 trades")
    ).toBeVisible();
    expect(
      within(summaryCard("Active Positions")).getByText("2")
    ).toBeVisible();
    expect(symbolsInOrder()).toEqual(["BBB", "CCC"]);
  });

  it("converts to the chosen display currency", async () => {
    const user = userEvent.setup();
    mockFetch();
    renderWithPortfolio(<PerformancePage />);
    await pricesLoaded();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Display currency" }),
      "€"
    );
    // $650 * 0.9 + €200
    expect(
      within(summaryCard("Unrealized P&L")).getByText("€785.00")
    ).toBeVisible();
    // $100 * 0.9
    expect(
      within(summaryCard("Realized P&L")).getByText("€90.00")
    ).toBeVisible();
  });

  it("marks benchmarks unavailable when their history can't be fetched", async () => {
    mockFetch();
    renderWithPortfolio(<PerformancePage />);
    const sp500 = await screen.findByRole("checkbox", {
      name: "S&P 500 — unavailable",
    });
    expect(sp500).toBeDisabled();
    expect(
      screen.getByRole("checkbox", { name: "Nasdaq 100 — unavailable" })
    ).toBeDisabled();
  });

  it("compares the portfolio with benchmarks when histories load", async () => {
    // Every held symbol needs a history for a full valuation, so give CCC
    // one too, and serve the first candidate of each benchmark.
    mockFetch({
      prices: { ...SAMPLE_PRICES, CCC: 10, "^GSPC": 5000, "SXRV.DE": 900 },
    });
    renderWithPortfolio(<PerformancePage />);

    expect(
      await screen.findByRole("checkbox", { name: "S&P 500 (^GSPC)" })
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Nasdaq 100 (SXRV.DE)" })
    ).toBeEnabled();
    // First weekly close (2026-10-01) is 98% of each price:
    // AAA 15 * 147 = $2205, BBB 20 * €58.8 = €1176 = $1306.67,
    // CCC 3 * €9.8 = €29.4 = $32.67 -> $3544.33
    expect(
      await screen.findByText(/Comparison starts Oct 1, 26 at \$3,544\.33/)
    ).toBeVisible();
  });
});
