import { usePortfolio } from "../../context/PortfolioContext";
import { formatDateStr } from "../../utils/dates";

export default function Header() {
  const { portfolio } = usePortfolio();

  return (
    <header className="h-14 bg-card border-b border-white/5 flex items-center justify-between px-6">
      <div />
      <div className="text-sm text-muted">
        Data updated: {formatDateStr(portfolio.updated_at)}
      </div>
    </header>
  );
}
