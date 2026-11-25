# investment-tracker-web

A personal investment tracker that runs locally in the browser. It reads your
portfolio from a JSON file and shows holdings, transactions, dividends,
performance against benchmarks, a watchlist, and Romanian tax estimates
(dividend tax, interest tax, CASS).

There is no backend and no database: the portfolio file is bundled into the
app, live prices come from Yahoo Finance through the Vite dev server's proxy,
and exchange rates come from a public API.

## Getting started

Requires Node.js 20 or later (developed on Node 24).

```sh
npm install
npm run dev        # http://localhost:5173
```

Without your own data the app shows `data/portfolio_test.json`. To use your
own, create `data/portfolio.json` in the same format (see below). That file is
gitignored, so it never gets committed.

## Scripts

| Script                              | What it does                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| `npm run dev`                       | Dev server with hot reload and the Yahoo proxy                                                   |
| `npm run build`                     | Type-check, then production build into `dist/`                                                   |
| `npm run build:demo`                | Same, but with only the test portfolio (see [Privacy](#privacy))                                 |
| `npm run preview`                   | Serve `dist/` locally, with the Yahoo proxy                                                      |
| `npm test`                          | Run the test suite once (`test:watch` to keep it running, `test:coverage` for a coverage report) |
| `npm run lint`                      | ESLint                                                                                           |
| `npm run format` / `format:check`   | Prettier: rewrite / verify formatting                                                            |
| `npm run check`                     | All gates in order: types, lint, format, tests, build                                            |
| `npm run populate-countries [file]` | Fill in missing `country` fields via the OpenFIGI API                                            |

On Windows, run the tests from PowerShell, cmd or the VS Code terminal. In
Git Bash, Vitest fails with "failed to find the current suite" if the working
directory looks like `/c/Users/...`; `cd "C:/Users/..."` first.

## The portfolio file

```jsonc
{
  "updated_at": "05-06-2026", // shown in the header
  "w_8ben_activated_at": "15-05-2023", // optional; US dividends after this date use the 10% treaty rate
  "target_asset_class_distribution": { "US Stocks": 50, "ETF": 30, "Cash": 20 },
  "accounts": [
    {
      "account_name": "broker_usd",
      "cash": 2840.5,
      "currency": "$", // "$", "€", "RON" or "DKK"
      "transactions": [
        {
          "date": "15-02-2022",
          "type": "Buy",
          "symbol": "AAPL",
          "name": "Apple",
          "shares": 10,
          "price": 172.5,
          "currency": "$",
          "fee": 1,
          "note": "",
          "country": "USA",
        },
        {
          "date": "20-01-2022",
          "type": "Interest",
          "amount": 1.42,
          "currency": "$",
          "fee": 0,
          "note": "Free Funds Interest",
          "country": "Romania",
        },
      ],
    },
  ],
  "watchlist": [{ "symbol": "MSFT", "currency": "$", "note": "" }],
}
```

- Dates are always `DD-MM-YYYY`.
- `Buy`, `Sell` and `Dividend` need `symbol`, `name`, `shares` and `price`. For
  a dividend, `shares` is the number of shares held and `price` the dividend
  per share. `Interest` needs `amount` instead.
- `fee` means something different per type, and the app names it accordingly:
  - **Buy**: the broker's commission (paid on top of `shares × price`).
  - **Sell, Dividend, Interest**: the tax withheld at source.
- `country` (optional) is the country of the issuer, used to group dividends
  for tax. Without it the app guesses from `isin`, the symbol suffix
  (`.RO`, `.PA`, `.DE`, `.AS`) or the currency.

The file is validated when it loads. If something is wrong, the app shows
every problem with its location (for example
`accounts[1].transactions[7].price: expected a number`) instead of loading.

## Live data

- **Prices** come from Yahoo Finance's chart API. Browsers can't call it
  directly (CORS), so the app calls `/api/yahoo/...` and the Vite server
  forwards it. **That proxy only exists in `npm run dev` and `npm run preview`**:
  a static deployment of `dist/` has no live prices.
- When a holding has no live price, it is valued at its average cost and the
  page says so ("No live price for …"), since its gain would otherwise show
  as 0% with no explanation. Price lookups are cached for 5 minutes and shared
  between pages.
- **Exchange rates** come from exchangerate-api.com. If that fails, built-in
  rates from mid-2024 are used and the header shows
  "FX: built-in fallback rates".

## Taxes: assumptions and yearly upkeep

The tax pages are estimates to help prepare the Romanian _declarația unică_.
They are not tax advice; check the figures before filing.

Rules the app uses:

- **CASS** (health contribution) on investment income from year N is based on
  the minimum gross wage in force on **1 January of year N**. Raises during the
  year (such as 1 July 2026) don't change that year's brackets.
- **Dividends** are taxed at the Romanian rate for the year
  (`DIVIDEND_TAX`). Amounts in other currencies are converted at the BNR
  yearly average (`AVERAGE_YEARLY_RATES_TO_RON`). When a year has no average
  recorded yet, today's live rate is used.
- **Interest** tax is a flat 10%, waived when it would be 0.5 or less per payment.
- **Gains on sells** use first-in, first-out (FIFO) cost basis per account.

Known gaps, still to be addressed:

- Tax already withheld abroad on dividends isn't credited against the
  Romanian tax.
- W-8BEN status is inferred from the payment currency (`$`), not the account.
- Sells are converted to RON at today's rate rather than the yearly average.
- The interest tax rate doesn't change by year.

### Each new tax year

All of these live in `src/data/taxCalculator.ts`:

1. Add any minimum-wage change to `ROMANIAN_MINIMUM_WAGE_HISTORY`, with its
   start date and the government decision (HG) that set it.
2. Add the year's dividend tax rate to `DIVIDEND_TAX`.
3. Once the BNR publishes the yearly averages, add `USD_<year>`, `EUR_<year>`
   and `DKK_<year>` to `AVERAGE_YEARLY_RATES_TO_RON`.
4. Run `npm test`; `taxCalculator.test.ts` checks the wage lookups.

## Privacy

`npm run build` puts your `data/portfolio.json` into `dist/` (it's what the
app displays). Don't publish that build. `npm run build:demo` builds with only
the test portfolio and is safe to share.

## Project layout

```
src/
  api/          Yahoo prices (with a shared cache) and exchange rates
  components/   Layout, charts, holdings tables, shared UI (SortableTh, notices)
  context/      PortfolioProvider and the usePortfolio hook
  data/         Loading and validating the portfolio, FIFO, holdings, taxes
  hooks/        useTableSort, useCurrentPrices
  pages/        One file per page; Taxes and Performance split into sections
  test/         Test setup, fixtures, sample portfolio, fetch mock
data/           portfolio_test.json (committed) and your portfolio.json (ignored)
scripts/        Maintenance scripts (populate-countries)
```
