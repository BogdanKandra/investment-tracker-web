import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { Holding, CurrencySymbol, ExchangeRates } from "../../types";
import { convertCurrency, formatCurrency } from "../../utils/currency";

interface HoldingsPieChartProps {
  holdings: Holding[];
  prices: Map<string, number>;
  displayCurrency: CurrencySymbol;
  rates: ExchangeRates;
}

const COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#06b6d4",
  "#f59e0b",
  "#ef4444",
  "#10b981",
  "#f97316",
  "#ec4899",
  "#6366f1",
  "#14b8a6",
  "#a855f7",
  "#eab308",
];

interface SliceData {
  name: string;
  symbol: string;
  value: number;
}

export default function HoldingsPieChart({
  holdings,
  prices,
  displayCurrency,
  rates,
}: HoldingsPieChartProps) {
  const data: SliceData[] = holdings
    .map((h) => {
      const price = prices.get(h.symbol);
      if (!price) return null;
      const marketValue = h.totalShares * price;
      const converted = convertCurrency(
        marketValue,
        h.currency,
        displayCurrency,
        rates
      );
      return { name: h.name, symbol: h.symbol, value: converted };
    })
    .filter((d): d is SliceData => d !== null && d.value > 0)
    .sort((a, b) => b.value - a.value);

  const total = data.reduce((sum, d) => sum + d.value, 0);


  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[280px] text-muted text-sm">
        Waiting for price data...
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-sm font-medium text-muted mb-2 text-center">
        Holdings Allocation
      </h3>
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={100}
            innerRadius={50}
            label={({ name, percent }) =>
              percent > 0.04 ? `${name.split(" ")[0]} ${(percent * 100).toFixed(0)}%` : ""
            }
            labelLine={false}
            fontSize={11}
          >
            {data.map((_, i) => (
              <Cell
                key={i}
                fill={COLORS[i % COLORS.length]}
                stroke="transparent"
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: "#1f2937",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "8px",
              color: "#f1f5f9",
            }}
            formatter={(value: number) => [
              `${formatCurrency(value, displayCurrency)} (${((value / total) * 100).toFixed(1)}%)`,
              "Value",
            ]}
            labelFormatter={(name) => {
              const item = data.find((d) => d.name === name);
              return item ? `${item.name} (${item.symbol})` : name;
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
