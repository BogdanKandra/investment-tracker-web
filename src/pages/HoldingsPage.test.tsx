import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import HoldingsPage from "./HoldingsPage";
import { renderWithPortfolio } from "../test/renderWithPortfolio";
import { mockFetch } from "../test/mockFetch";
import { SAMPLE_PRICES } from "../test/samplePortfolio";

// Sample portfolio in $, with 1 € = 5/4.5 $ (see test/fixtures makeRates).
// Live prices: AAA $150, BBB €60, CCC and DDD none.
// Open: AAA 15 sh ($1600 cost), BBB 20 sh (€1000), CCC 3 sh (€30).
// Closed: DDD.

/** Body rows of the current holdings table (the first table). */
const holdingRows = () =>
  within(screen.getAllByRole("table")[0]!).getAllByRole("row").slice(1);

const symbolsInOrder = () =>
  holdingRows().map(
    (r) => within(r).getAllByRole("cell")[0]!.firstChild!.textContent
  );

/** A figure in the summary strip above the table, by its label. */
function summary(label: string) {
  const el = screen
    .getAllByText(label)
    .find((e) => e.closest("table") === null)!;
  return el.parentElement!;
}

/** Waits for prices to load (AAA's price shows in its row). */
const pricesLoaded = () => screen.findByText("$150.00");

describe("HoldingsPage", () => {
  it("lists current holdings by value with live prices", async () => {
    mockFetch();
    renderWithPortfolio(<HoldingsPage />);
    expect(screen.getByRole("heading", { name: "Holdings" })).toBeVisible();
    await pricesLoaded();

    // Values: AAA 15*150 = $2250, BBB 20*€60 = €1200 = $1333.33,
    // CCC at cost 3*€10 = €30 = $33.33
    expect(symbolsInOrder()).toEqual(["AAA", "BBB", "CCC"]);
    const [aaa, bbb, ccc] = holdingRows();
    expect(within(aaa!).getByText("$2,250.00")).toBeVisible();
    expect(within(bbb!).getByText("$66.67")).toBeVisible(); // €60 in $
    expect(within(bbb!).getByText("$1,333.33")).toBeVisible();
    expect(within(ccc!).getByText("n/a")).toBeVisible();

    // $2250 + $1333.33 + $33.33; cash $500 + €100 ($111.11)
    expect(
      within(summary("Holdings Value")).getByText("$3,616.67")
    ).toBeVisible();
    expect(within(summary("Cash")).getByText("$611.11")).toBeVisible();
    expect(within(summary("Total Value")).getByText("$4,227.78")).toBeVisible();
    // +$650 (AAA) + €200 ($222.22, BBB) on $2744.44 invested = 31.78%
    expect(summary("Unrealized P&L")).toHaveTextContent("$872.22+31.78%");
  });

  it("names a held symbol without a live price, but not a former holding", async () => {
    mockFetch();
    renderWithPortfolio(<HoldingsPage />);
    const notice = await screen.findByText(/No live price for/);
    expect(notice).toHaveAttribute("role", "status");
    // DDD has no price either, but it is closed, so it is not mentioned.
    expect(notice).toHaveTextContent(/^No live price for CCC\. It is valued/);
  });

  it("shows no notice when only a former holding lacks a price", async () => {
    mockFetch({ prices: { ...SAMPLE_PRICES, CCC: 11 } });
    renderWithPortfolio(<HoldingsPage />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading live prices…"
    );
    await pricesLoaded();
    // DDD's lookup still fails, but no status message remains.
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  });

  it("sorts by a column header button", async () => {
    const user = userEvent.setup();
    mockFetch();
    renderWithPortfolio(<HoldingsPage />);
    await pricesLoaded();

    expect(
      screen.getByRole("columnheader", { name: /^Value/ })
    ).toHaveAttribute("aria-sort", "descending");

    await user.click(screen.getByRole("button", { name: "Asset" }));
    const assetHeader = screen.getByRole("columnheader", { name: /^Asset/ });
    expect(assetHeader).toHaveAttribute("aria-sort", "descending");
    expect(
      screen.getByRole("columnheader", { name: /^Value/ })
    ).toHaveAttribute("aria-sort", "none");
    expect(symbolsInOrder()).toEqual(["CCC", "BBB", "AAA"]);

    await user.click(screen.getByRole("button", { name: "Asset" }));
    expect(assetHeader).toHaveAttribute("aria-sort", "ascending");
    expect(symbolsInOrder()).toEqual(["AAA", "BBB", "CCC"]);
  });

  it("narrows to one account", async () => {
    const user = userEvent.setup();
    mockFetch();
    renderWithPortfolio(<HoldingsPage />);
    await pricesLoaded();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Account" }),
      "eur_broker"
    );
    expect(symbolsInOrder()).toEqual(["BBB", "CCC"]);
    // Only eur_broker's €100 cash, and BBB $1333.33 + CCC $33.33
    expect(within(summary("Cash")).getByText("$111.11")).toBeVisible();
    expect(
      within(summary("Holdings Value")).getByText("$1,366.67")
    ).toBeVisible();
    // usd_broker's closed DDD is gone too.
    expect(screen.queryByText(/Former Holdings/)).toBeNull();
  });

  it("converts to the chosen display currency", async () => {
    const user = userEvent.setup();
    mockFetch();
    renderWithPortfolio(<HoldingsPage />);
    await pricesLoaded();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Display currency" }),
      "€"
    );
    const aaa = holdingRows()[0]!;
    expect(within(aaa).getByText("€135.00")).toBeVisible(); // $150 * 0.9
    expect(within(aaa).getByText("€2,025.00")).toBeVisible(); // 15 * €135
  });

  it("shows the selected holding's details and lists former holdings", async () => {
    const user = userEvent.setup();
    mockFetch();
    renderWithPortfolio(<HoldingsPage />);
    await pricesLoaded();
    expect(
      screen.getByText("Select a holding to view its price chart")
    ).toBeVisible();

    await user.click(holdingRows()[0]!);
    expect(screen.getByRole("heading", { name: "AAA" })).toBeVisible();
    expect(screen.getByText("Alpha Corp", { selector: "p" })).toBeVisible();
    await waitFor(() =>
      expect(screen.queryByText("Loading chart...")).toBeNull()
    );

    await user.click(
      screen.getByRole("button", { name: /Former Holdings \(1\)/ })
    );
    const former = within(screen.getAllByRole("table")[1]!);
    const ddd = former.getAllByRole("row")[1]!;
    expect(within(ddd).getByText("DDD")).toBeVisible();
    // 4 * (75 - 50) - $3 tax = $97, on $200 bought = 48.50%
    expect(within(ddd).getByText("$97.00")).toBeVisible();
    expect(within(ddd).getByText("+48.50%")).toBeVisible();
  });
});
