import type { PortfolioData } from "../types";

export async function loadPortfolio(): Promise<PortfolioData> {
  try {
    const module = await import("../../data/portfolio.json");
    return module.default as unknown as PortfolioData;
  } catch {
    const module = await import("../../data/portfolio_test.json");
    return module.default as unknown as PortfolioData;
  }
}
