import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App";
import { PortfolioProvider } from "./context/PortfolioContext";
import { usePortfolio } from "./context/usePortfolio";
import Header from "./components/layout/Header";
import { PortfolioValidationError } from "./data/validatePortfolio";
import { samplePortfolio } from "./test/samplePortfolio";
import { mockFetch } from "./test/mockFetch";
import { renderWithPortfolio } from "./test/renderWithPortfolio";

const loadPortfolio = vi.hoisted(() => vi.fn());
vi.mock("./data/portfolioLoader", () => ({ loadPortfolio }));

function RatesProbe() {
  const { ratesStatus, rates } = usePortfolio();
  return (
    <div>
      {ratesStatus.source} RON={rates.RON}
    </div>
  );
}

describe("PortfolioProvider", () => {
  it("shows a loading message, then the app", async () => {
    mockFetch();
    loadPortfolio.mockResolvedValue(samplePortfolio);
    render(
      <PortfolioProvider>
        <RatesProbe />
      </PortfolioProvider>
    );
    expect(screen.getByText("Loading portfolio...")).toBeInTheDocument();
    expect(await screen.findByText("live RON=4.5")).toBeInTheDocument();
  });

  it("reports fallback rates when the rates API is down", async () => {
    mockFetch({ ratesDown: true });
    loadPortfolio.mockResolvedValue(samplePortfolio);
    render(
      <PortfolioProvider>
        <RatesProbe />
      </PortfolioProvider>
    );
    expect(await screen.findByText(/^fallback RON=/)).toBeInTheDocument();
  });

  it("shows validation problems instead of hanging", async () => {
    mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
    loadPortfolio.mockRejectedValue(
      new PortfolioValidationError([
        "accounts[0].transactions[3].price: expected a number",
      ])
    );
    render(
      <PortfolioProvider>
        <div>app</div>
      </PortfolioProvider>
    );
    expect(
      await screen.findByRole("heading", { name: "Could not load portfolio" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/accounts\[0\]\.transactions\[3\]\.price/)
    ).toBeInTheDocument();
    expect(screen.queryByText("app")).not.toBeInTheDocument();
  });
});

describe("Header", () => {
  it("shows live rates with their date", () => {
    renderWithPortfolio(<Header />);
    expect(screen.getByText("FX: live rates (2026-11-24)")).toBeInTheDocument();
    expect(screen.getByText("Data updated: 01 Nov 2026")).toBeInTheDocument();
  });

  it("warns when fallback rates are in use", () => {
    renderWithPortfolio(<Header />, {
      ratesStatus: { source: "fallback", asOf: null },
    });
    expect(
      screen.getByText("FX: built-in fallback rates (may be outdated)")
    ).toBeInTheDocument();
  });
});

describe("App routing", () => {
  it.each([
    ["/", "Dashboard"],
    ["/transactions", "Transactions"],
    ["/taxes", "Taxes"],
  ])("loads the page for %s on demand", async (path, heading) => {
    mockFetch();
    loadPortfolio.mockResolvedValue(samplePortfolio);
    window.history.pushState({}, "", path);
    render(<App />);
    expect(
      await screen.findByRole(
        "heading",
        { level: 1, name: heading },
        // The first visit compiles the lazily loaded page module.
        { timeout: 5000 }
      )
    ).toBeInTheDocument();
  });

  it("redirects unknown paths to the dashboard", async () => {
    mockFetch();
    loadPortfolio.mockResolvedValue(samplePortfolio);
    window.history.pushState({}, "", "/no-such-page");
    render(<App />);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Dashboard" })
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe("/");
  });
});
