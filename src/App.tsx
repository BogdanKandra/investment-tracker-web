import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { PortfolioProvider } from "./context/PortfolioContext";
import Layout from "./components/layout/Layout";
import DashboardPage from "./pages/DashboardPage";
import HoldingsPage from "./pages/HoldingsPage";
import TransactionsPage from "./pages/TransactionsPage";
import DividendsPage from "./pages/DividendsPage";
import PerformancePage from "./pages/PerformancePage";
import WatchlistPage from "./pages/WatchlistPage";
import TaxesPage from "./pages/TaxesPage";

export default function App() {
  return (
    <PortfolioProvider>
      <BrowserRouter>
        <Layout>
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
        </Layout>
      </BrowserRouter>
    </PortfolioProvider>
  );
}
