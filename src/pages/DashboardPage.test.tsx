import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DashboardPage from "./DashboardPage";
import { renderWithPortfolio } from "../test/renderWithPortfolio";
import { mockFetch } from "../test/mockFetch";

// Sample portfolio in $, with 1 € = 5/4.5 $ (see test/fixtures makeRates).
// Live prices: AAA $150, BBB €60, CCC none (valued at its €10 average cost).
// Holdings at cost (commissions excluded): AAA $1600, BBB €1000, CCC €30.

/** The stats card with this label (ignores table headers with the same text). */
function card(label: string) {
  const el = screen
    .getAllByText(label)
    .find((e) => e.closest("table") === null)!;
  return el.parentElement!;
}

/** Body rows of the Account Breakdown table. */
const accountRows = () => screen.getAllByRole("row").slice(1);

/** Waits until prices have loaded (CCC's lookup fails, so the notice shows). */
const pricesLoaded = () => screen.findByText(/No live price for CCC/);

describe("DashboardPage", () => {
  it("shows the portfolio totals once prices have loaded", async () => {
    mockFetch();
    renderWithPortfolio(<DashboardPage />);
    expect(
      screen.getByRole("heading", { name: "Dashboard" })
    ).toBeInTheDocument();
    await pricesLoaded();

    // Holdings: AAA 15*150 = 2250, BBB 20*€60 = €1200 = $1333.33,
    // CCC 3*€10 = €30 = $33.33 -> $3616.67; cash $500 + €100 ($111.11).
    expect(within(card("Total Value")).getByText("$4,227.78")).toBeVisible();
    // $1600 + €1000 + €30 = $1600 + $1144.44
    expect(within(card("Total Invested")).getByText("$2,744.44")).toBeVisible();
    // AAA +$650, BBB +€200 ($222.22), CCC 0 -> $872.22 = 31.78% of $2744.44
    const unrealized = card("Unrealized P&L");
    expect(within(unrealized).getByText("$872.22")).toBeVisible();
    expect(within(unrealized).getByText("+31.78%")).toBeVisible();
    // DDD: sold 4 @ 75 against 4 @ 50 -> gross $100
    expect(within(card("Realized P&L")).getByText("$100.00")).toBeVisible();
    // AAA $30 - $3, BBB €20 - €0.5 = €19.5 ($21.67)
    expect(within(card("Net Dividends")).getByText("$48.67")).toBeVisible();
    expect(within(card("Cash")).getByText("$611.11")).toBeVisible();
  });

  it("names the holding that has no live price", async () => {
    mockFetch();
    renderWithPortfolio(<DashboardPage />);
    const notice = await pricesLoaded();
    expect(notice).toHaveAttribute("role", "status");
    expect(notice).toHaveTextContent(
      "No live price for CCC. It is valued at average cost, so its gain shows as 0%."
    );
  });

  it("converts the figures to the chosen display currency", async () => {
    const user = userEvent.setup();
    mockFetch();
    renderWithPortfolio(<DashboardPage />);
    await pricesLoaded();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Display currency" }),
      "€"
    );
    // Cash: $500 * 0.9 + €100
    expect(within(card("Cash")).getByText("€550.00")).toBeVisible();
    // AAA $2250 = €2025, BBB €1200, CCC €30, cash €550
    expect(within(card("Total Value")).getByText("€3,805.00")).toBeVisible();
  });

  it("breaks the value down per account and sorts the breakdown", async () => {
    const user = userEvent.setup();
    mockFetch();
    renderWithPortfolio(<DashboardPage />);
    await pricesLoaded();

    // Default: by total, largest first.
    // usd_broker: AAA $2250 + $500 cash = $2750 (65.0% of $4227.78)
    // eur_broker: $1333.33 + $33.33 + $111.11 = $1477.78 (35.0%)
    expect(screen.getByRole("columnheader", { name: /Total/ })).toHaveAttribute(
      "aria-sort",
      "descending"
    );
    const [usd, eur] = accountRows();
    expect(within(usd!).getByText("usd_broker")).toBeVisible();
    expect(within(usd!).getByText("$2,750.00")).toBeVisible();
    expect(within(usd!).getByText("65.0%")).toBeVisible();
    expect(within(eur!).getByText("eur_broker")).toBeVisible();
    expect(within(eur!).getByText("$1,477.78")).toBeVisible();
    expect(within(eur!).getByText("35.0%")).toBeVisible();

    // A new column starts descending (usd_broker > eur_broker), then flips.
    await user.click(screen.getByRole("button", { name: "Account" }));
    await user.click(screen.getByRole("button", { name: "Account" }));
    expect(
      screen.getByRole("columnheader", { name: /Account/ })
    ).toHaveAttribute("aria-sort", "ascending");
    expect(screen.getByRole("columnheader", { name: /Total/ })).toHaveAttribute(
      "aria-sort",
      "none"
    );
    expect(within(accountRows()[0]!).getByText("eur_broker")).toBeVisible();
  });
});
