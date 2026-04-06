import type { PortfolioData } from "../types";
import rawData from "../../data/portfolio.json";

export function loadPortfolio(): PortfolioData {
  return rawData as unknown as PortfolioData;
}
