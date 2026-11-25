import type { PortfolioData } from "../types";
import { account, buy, dividend, interest, portfolio, sell } from "./fixtures";

/**
 * A small two-account portfolio used by the page tests. Values are chosen to
 * be easy to check by hand; prices served by mockFetch (SAMPLE_PRICES) are:
 * AAA $150, BBB €60, CCC has no price (lookup fails).
 *
 * usd_broker ($):
 *   AAA: buy 10 @ 100 (+1 commission) on 10-01-2024, buy 5 @ 120 on 10-06-2024
 *   DDD: buy 4 @ 50 on 01-02-2024, sell 4 @ 75 (tax 3) on 01-03-2025 -> closed
 *   AAA dividend 15 sh x $2, tax $3 on 15-03-2025
 *   Interest $10, tax $1 on 31-12-2025
 * eur_broker (€):
 *   BBB: buy 20 @ 50 (+2 commission) on 05-02-2025
 *   CCC: buy 3 @ 10 on 06-02-2025
 *   BBB dividend 20 sh x €1, tax €0.5 on 20-06-2025
 */
export const samplePortfolio: PortfolioData = portfolio(
  [
    account(
      "usd_broker",
      [
        buy("10-01-2024", "AAA", 10, 100, {
          name: "Alpha Corp",
          commission: 1,
        }),
        buy("01-02-2024", "DDD", 4, 50, { name: "Delta Inc" }),
        buy("10-06-2024", "AAA", 5, 120, { name: "Alpha Corp" }),
        sell("01-03-2025", "DDD", 4, 75, { name: "Delta Inc", tax: 3 }),
        dividend("15-03-2025", "AAA", 15, 2, {
          name: "Alpha Corp",
          tax: 3,
          country: "USA",
        }),
        interest("31-12-2025", 10, { tax: 1, country: "Romania" }),
      ],
      "$",
      500
    ),
    account(
      "eur_broker",
      [
        buy("05-02-2025", "BBB", 20, 50, {
          name: "Beta SE",
          currency: "€",
          commission: 2,
        }),
        buy("06-02-2025", "CCC", 3, 10, { name: "Gamma AG", currency: "€" }),
        dividend("20-06-2025", "BBB", 20, 1, {
          name: "Beta SE",
          currency: "€",
          tax: 0.5,
          country: "Germany",
        }),
      ],
      "€",
      100
    ),
  ],
  {
    updated_at: "01-11-2026",
    w_8ben_activated_at: "01-01-2025",
    watchlist: [
      { symbol: "AAA", currency: "$", note: "Core" },
      { symbol: "ZZZ", currency: "$", note: "Idea" },
    ],
  }
);

/** Latest prices served by mockFetch; symbols not listed return 404. */
export const SAMPLE_PRICES: Record<string, number> = {
  AAA: 150,
  BBB: 60,
  ZZZ: 12,
};
