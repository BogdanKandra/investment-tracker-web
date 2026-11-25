import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TransactionsPage from "./TransactionsPage";
import { renderWithPortfolio } from "../test/renderWithPortfolio";

// Sample portfolio in $, with 1 € = 5/4.5 $ (see test/fixtures makeRates).
const rows = () => screen.getAllByRole("row").slice(1); // skip header row

/** The stats card with this label (ignores table headers with the same text). */
function card(label: string) {
  const el = screen
    .getAllByText(label)
    .find((e) => e.closest("table") === null)!;
  return el.parentElement!;
}

describe("TransactionsPage", () => {
  it("lists every transaction with summary cards", () => {
    renderWithPortfolio(<TransactionsPage />);
    expect(
      screen.getByRole("heading", { name: "Transactions" })
    ).toBeInTheDocument();
    expect(rows()).toHaveLength(9);
    expect(within(card("Transaction Count")).getByText("9")).toBeVisible();
    // Buys: $1000 + $600 + $200 + €1000 + €30
    expect(within(card("Total Invested")).getByText("$2,944.44")).toBeVisible();
  });

  it("keeps commissions and withheld tax apart", () => {
    renderWithPortfolio(<TransactionsPage />);
    // Commissions: $1 + €2
    expect(within(card("Commissions")).getByText("$3.22")).toBeVisible();
    // Tax: sell $3 + dividend $3 + interest $1 + dividend €0.5
    expect(within(card("Tax Withheld")).getByText("$7.56")).toBeVisible();
  });

  it("shows money received net of tax and money paid including commission", async () => {
    renderWithPortfolio(<TransactionsPage />);
    const sellRow = rows().find((r) => within(r).queryByText("Sell"))!;
    expect(within(sellRow).getByText("$297.00")).toBeVisible(); // 4*75 - 3
    const firstBuy = rows().find((r) => within(r).queryByText("10 Jan 2024"))!;
    expect(within(firstBuy).getByText("$1,001.00")).toBeVisible(); // 10*100 + 1
  });

  it("filters by type and by search text", async () => {
    const user = userEvent.setup();
    renderWithPortfolio(<TransactionsPage />);

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Filter by type" }),
      "Dividend"
    );
    expect(rows()).toHaveLength(2);

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Filter by type" }),
      "__all__"
    );
    await user.type(
      screen.getByRole("textbox", { name: "Search symbol or name" }),
      "beta"
    );
    expect(rows()).toHaveLength(2); // BBB buy + BBB dividend
  });

  it("filters by account", async () => {
    const user = userEvent.setup();
    renderWithPortfolio(<TransactionsPage />);
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Filter by account" }),
      "eur_broker"
    );
    expect(rows()).toHaveLength(3);
  });

  it("sorts from the keyboard and reports the order to assistive tech", async () => {
    const user = userEvent.setup();
    renderWithPortfolio(<TransactionsPage />);

    const dateHeader = screen.getByRole("columnheader", { name: /Date/ });
    expect(dateHeader).toHaveAttribute("aria-sort", "descending");
    expect(within(rows()[0]!).getByText("31 Dec 2025")).toBeVisible();

    const totalButton = screen.getByRole("button", { name: /Total/ });
    totalButton.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("columnheader", { name: /Total/ })).toHaveAttribute(
      "aria-sort",
      "descending"
    );
    expect(dateHeader).toHaveAttribute("aria-sort", "none");
    // Largest cash amount: the €1000 BBB buy plus €2 commission.
    expect(within(rows()[0]!).getByText("BBB")).toBeVisible();

    await user.keyboard(" "); // Space toggles to ascending
    expect(screen.getByRole("columnheader", { name: /Total/ })).toHaveAttribute(
      "aria-sort",
      "ascending"
    );
  });
});
