import type { PortfolioData } from "../types";
import { validatePortfolio } from "./validatePortfolio";

const REAL_PORTFOLIO = "../../data/portfolio.json";
const TEST_PORTFOLIO = "../../data/portfolio_test.json";

// import.meta.glob only includes files that exist at build time, so a fresh
// clone without the (gitignored) portfolio.json still builds and falls back to
// the test portfolio. A plain import() of a missing file fails the build.
const portfolioFiles = import.meta.glob<{ default: unknown }>([
  "../../data/portfolio.json",
  "../../data/portfolio_test.json",
]);

export async function loadPortfolio(): Promise<PortfolioData> {
  const load = portfolioFiles[REAL_PORTFOLIO] ?? portfolioFiles[TEST_PORTFOLIO];
  if (!load) {
    throw new Error(
      "No portfolio file found. Add data/portfolio.json or data/portfolio_test.json."
    );
  }
  const module = await load();
  return validatePortfolio(module.default);
}
