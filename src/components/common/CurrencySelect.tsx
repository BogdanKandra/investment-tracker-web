import { usePortfolio } from "../../context/PortfolioContext";
import { currencyLabel } from "../../utils/currency";

export default function CurrencySelect() {
  const { allCurrencies, displayCurrency, setDisplayCurrency } = usePortfolio();

  return (
    <select
      value={displayCurrency}
      onChange={(e) => setDisplayCurrency(e.target.value as typeof displayCurrency)}
      className="bg-card border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
    >
      {allCurrencies.map((c) => (
        <option key={c} value={c}>
          {c} ({currencyLabel(c)})
        </option>
      ))}
    </select>
  );
}
