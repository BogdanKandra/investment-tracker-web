import type { PortfolioData } from "../types";
import { validatePortfolio } from "./validatePortfolio";

type JsonModule = { default: unknown };

// import.meta.glob only includes files that exist at build time, so a fresh
// clone without the (gitignored) portfolio.json still builds and falls back to
// the test portfolio. A plain import() of a missing file fails the build.
//
// `vite build --mode demo` (npm run build:demo) leaves the real portfolio out
// of the build entirely: the condition is a constant, so the unused branch and
// its import are dropped. Use it for any build you publish.
const realPortfolio: Record<string, () => Promise<JsonModule>> =
  import.meta.env.MODE === "demo"
    ? {}
    : import.meta.glob<JsonModule>("../../data/portfolio.json");
const testPortfolio = import.meta.glob<JsonModule>(
  "../../data/portfolio_test.json"
);

export async function loadPortfolio(): Promise<PortfolioData> {
  const load =
    Object.values(realPortfolio)[0] ?? Object.values(testPortfolio)[0];
  if (!load) {
    throw new Error(
      "No portfolio file found. Add data/portfolio.json or data/portfolio_test.json."
    );
  }
  const module = await load();
  return validatePortfolio(module.default);
}
