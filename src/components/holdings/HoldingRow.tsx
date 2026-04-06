import type { Holding, CurrencySymbol, ExchangeRates } from "../../types";
import { formatCurrency, convertCurrency } from "../../utils/currency";
import { formatShares, formatPercent } from "../../utils/numbers";

interface HoldingRowProps {
  holding: Holding;
  currentPrice: number | null;
  displayCurrency: CurrencySymbol;
  rates: ExchangeRates;
  isSelected: boolean;
  onClick: () => void;
  totalPortfolioValue: number;
}

export default function HoldingRow({
  holding,
  currentPrice,
  displayCurrency,
  rates,
  isSelected,
  onClick,
  totalPortfolioValue,
}: HoldingRowProps) {
  const price = currentPrice ?? holding.averageCost;
  const marketValue = holding.totalShares * price;
  const unrealizedPnL = marketValue - holding.totalInvested;
  const unrealizedPct =
    holding.totalInvested > 0
      ? (unrealizedPnL / holding.totalInvested) * 100
      : 0;
  const weight =
    totalPortfolioValue > 0 ? (marketValue / totalPortfolioValue) * 100 : 0;

  const displayValue = convertCurrency(
    marketValue,
    holding.currency,
    displayCurrency,
    rates
  );
  const displayPnL = convertCurrency(
    unrealizedPnL,
    holding.currency,
    displayCurrency,
    rates
  );
  const displayAvgCost = convertCurrency(
    holding.averageCost,
    holding.currency,
    displayCurrency,
    rates
  );
  const displayPrice = convertCurrency(
    price,
    holding.currency,
    displayCurrency,
    rates
  );

  const pnlColor = unrealizedPnL >= 0 ? "text-gain" : "text-loss";

  return (
    <tr
      onClick={onClick}
      className={`cursor-pointer transition-colors border-b border-white/5 ${
        isSelected
          ? "bg-blue-500/10"
          : "hover:bg-white/5"
      }`}
    >
      <td className="py-3 px-3">
        <div className="font-medium text-white">{holding.symbol}</div>
        <div className="text-xs text-muted truncate max-w-[120px]">
          {holding.name}
        </div>
      </td>
      <td className="py-3 px-3 text-right text-sm">
        {formatShares(holding.totalShares)}
      </td>
      <td className="py-3 px-3 text-right text-sm">
        {formatCurrency(displayAvgCost, displayCurrency)}
      </td>
      <td className="py-3 px-3 text-right text-sm">
        {currentPrice != null
          ? formatCurrency(displayPrice, displayCurrency)
          : "..."}
      </td>
      <td className="py-3 px-3 text-right text-sm">
        {formatCurrency(displayValue, displayCurrency)}
      </td>
      <td className={`py-3 px-3 text-right text-sm ${pnlColor}`}>
        <div>{formatCurrency(displayPnL, displayCurrency)}</div>
        <div className="text-xs">{formatPercent(unrealizedPct)}</div>
      </td>
      <td className="py-3 px-3 text-right text-sm text-muted">
        {weight.toFixed(1)}%
      </td>
    </tr>
  );
}
