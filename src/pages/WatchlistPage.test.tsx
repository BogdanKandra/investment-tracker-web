import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WatchlistPage from "./WatchlistPage";
import { renderWithPortfolio } from "../test/renderWithPortfolio";
import { mockFetch } from "../test/mockFetch";

// Sample watchlist: AAA ($, "Core") at $150 and ZZZ ($, "Idea") at $12.

const rows = () => screen.getAllByRole("row").slice(1); // skip header row
const symbolsInOrder = () =>
  rows().map((r) => within(r).getAllByRole("cell")[0]!.textContent);

/** Waits for the latest prices to load into the table. */
const pricesLoaded = () => screen.findByText("$12.00");

describe("WatchlistPage", () => {
  it("lists every watched symbol with its latest price", async () => {
    mockFetch();
    renderWithPortfolio(<WatchlistPage />);
    expect(screen.getByRole("heading", { name: "Watchlist" })).toBeVisible();
    await pricesLoaded();

    expect(symbolsInOrder()).toEqual(["AAA", "ZZZ"]);
    const [aaa, zzz] = rows();
    expect(within(aaa!).getByText("$150.00")).toBeVisible();
    expect(within(aaa!).getByText("Core")).toBeVisible();
    expect(within(zzz!).getByText("$12.00")).toBeVisible();
    expect(within(zzz!).getByText("Idea")).toBeVisible();
  });

  it("sorts by price", async () => {
    const user = userEvent.setup();
    mockFetch();
    renderWithPortfolio(<WatchlistPage />);
    await pricesLoaded();

    const symbolHeader = screen.getByRole("columnheader", { name: /^Symbol/ });
    expect(symbolHeader).toHaveAttribute("aria-sort", "ascending");

    await user.click(screen.getByRole("button", { name: "Price" }));
    const priceHeader = screen.getByRole("columnheader", { name: /^Price/ });
    expect(priceHeader).toHaveAttribute("aria-sort", "descending");
    expect(symbolHeader).toHaveAttribute("aria-sort", "none");
    expect(symbolsInOrder()).toEqual(["AAA", "ZZZ"]); // $150, $12

    await user.click(screen.getByRole("button", { name: "Price" }));
    expect(priceHeader).toHaveAttribute("aria-sort", "ascending");
    expect(symbolsInOrder()).toEqual(["ZZZ", "AAA"]);
  });

  it("shows the selected item's detail panel", async () => {
    const user = userEvent.setup();
    mockFetch();
    renderWithPortfolio(<WatchlistPage />);
    await pricesLoaded();
    expect(
      screen.getByText("Select a watchlist item to view its chart")
    ).toBeVisible();

    await user.click(rows()[1]!); // ZZZ
    expect(screen.getByRole("heading", { name: "ZZZ" })).toBeVisible();
    expect(
      screen.queryByText("Select a watchlist item to view its chart")
    ).toBeNull();
    await waitFor(() =>
      expect(screen.queryByText("Loading chart...")).toBeNull()
    );
    // Not held: the panel's stats are all zero.
    const txCard = screen.getByText("Transactions").parentElement!;
    expect(within(txCard).getByText("0")).toBeVisible();
    // The latest price shows in the panel header as well as the table row.
    expect(screen.getAllByText("$12.00")).toHaveLength(2);
  });
});
