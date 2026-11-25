import { useMemo } from "react";
import { usePortfolio } from "../context/usePortfolio";
import { computeSellPnL } from "../data/taxCalculator";
import { parseDate } from "../utils/dates";
import SellPnlSection from "./taxes/SellPnlSection";
import W8benSection from "./taxes/W8benSection";
import DividendTaxesSection from "./taxes/DividendTaxesSection";
import InterestTaxesSection from "./taxes/InterestTaxesSection";
import CassSection from "./taxes/CassSection";

export default function TaxesPage() {
  const { portfolio, rates } = usePortfolio();

  // Shared by the Sell P&L and CASS sections.
  const sells = useMemo(
    () => computeSellPnL(portfolio.accounts, rates),
    [portfolio.accounts, rates]
  );

  // Shared by the W-8BEN and Dividend Taxes sections.
  const w8benDate = useMemo(() => {
    if (!portfolio.w_8ben_activated_at) return null;
    return parseDate(portfolio.w_8ben_activated_at);
  }, [portfolio.w_8ben_activated_at]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Taxes</h1>
        <div className="text-xs text-muted uppercase tracking-wide">
          All values in RON
        </div>
      </div>

      <SellPnlSection sells={sells} />
      <W8benSection w8benDate={w8benDate} />
      <DividendTaxesSection w8benDate={w8benDate} />
      <InterestTaxesSection />
      <CassSection sells={sells} />
    </div>
  );
}
