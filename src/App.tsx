import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { PortfolioProvider } from "./context/PortfolioContext";
import Layout from "./components/layout/Layout";

// Each page is its own chunk, loaded the first time it is opened, so the
// initial download does not include every page and chart library.
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const HoldingsPage = lazy(() => import("./pages/HoldingsPage"));
const TransactionsPage = lazy(() => import("./pages/TransactionsPage"));
const DividendsPage = lazy(() => import("./pages/DividendsPage"));
const PerformancePage = lazy(() => import("./pages/PerformancePage"));
const WatchlistPage = lazy(() => import("./pages/WatchlistPage"));
const TaxesPage = lazy(() => import("./pages/TaxesPage"));

function PageLoading() {
  return (
    <div role="status" className="text-sm text-muted p-6">
      Loading page…
    </div>
  );
}

export default function App() {
  return (
    <PortfolioProvider>
      <BrowserRouter>
        <Layout>
          <Suspense fallback={<PageLoading />}>
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/holdings" element={<HoldingsPage />} />
              <Route path="/transactions" element={<TransactionsPage />} />
              <Route path="/dividends" element={<DividendsPage />} />
              <Route path="/performance" element={<PerformancePage />} />
              <Route path="/watchlist" element={<WatchlistPage />} />
              <Route path="/taxes" element={<TaxesPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </Layout>
      </BrowserRouter>
    </PortfolioProvider>
  );
}
