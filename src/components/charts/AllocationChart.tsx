import { useMemo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface AllocationData {
  name: string;
  value: number;
}

interface AllocationChartProps {
  actual: AllocationData[];
  target: AllocationData[];
}

const PALETTE = [
  "#3b82f6",
  "#8b5cf6",
  "#06b6d4",
  "#f59e0b",
  "#ef4444",
  "#10b981",
  "#f97316",
  "#ec4899",
];

const TOOLTIP_CONTENT_STYLE = {
  backgroundColor: "#1f2937",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "8px",
  color: "#f1f5f9",
};

export default function AllocationChart({
  actual,
  target,
}: AllocationChartProps) {
  const { colorOf, sortedActual, sortedTarget } = useMemo(() => {
    const canonicalNames = [
      ...target.map((d) => d.name),
      ...actual.map((d) => d.name),
    ];
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const n of canonicalNames) {
      if (!seen.has(n)) {
        seen.add(n);
        ordered.push(n);
      }
    }

    const cMap = new Map<string, string>();
    ordered.forEach((name, i) => cMap.set(name, PALETTE[i % PALETTE.length]));

    const orderIndex = new Map<string, number>();
    ordered.forEach((name, i) => orderIndex.set(name, i));
    const byOrder = (a: AllocationData, b: AllocationData) =>
      (orderIndex.get(a.name) ?? 999) - (orderIndex.get(b.name) ?? 999);

    return {
      colorOf: (name: string) => cMap.get(name) ?? PALETTE[0],
      sortedActual: [...actual].sort(byOrder),
      sortedTarget: [...target].sort(byOrder),
    };
  }, [actual, target]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div>
        <h3 className="text-sm font-medium text-muted mb-3 text-center">
          Current Allocation
        </h3>
        <ResponsiveContainer width="100%" height={250}>
          <PieChart>
            <Pie
              data={sortedActual}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={90}
              startAngle={90}
              endAngle={-270}
              label={({ name, percent }) =>
                `${name} ${(percent * 100).toFixed(0)}%`
              }
              labelLine={false}
              fontSize={11}
            >
              {sortedActual.map((entry) => (
                <Cell
                  key={entry.name}
                  fill={colorOf(entry.name)}
                  stroke="transparent"
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={TOOLTIP_CONTENT_STYLE}
              formatter={(value: number) => `${value.toFixed(1)}%`}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div>
        <h3 className="text-sm font-medium text-muted mb-3 text-center">
          Target Allocation
        </h3>
        <ResponsiveContainer width="100%" height={250}>
          <PieChart>
            <Pie
              data={sortedTarget}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={90}
              startAngle={90}
              endAngle={-270}
              label={({ name, percent }) =>
                `${name} ${(percent * 100).toFixed(0)}%`
              }
              labelLine={false}
              fontSize={11}
            >
              {sortedTarget.map((entry) => (
                <Cell
                  key={entry.name}
                  fill={colorOf(entry.name)}
                  stroke="transparent"
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={TOOLTIP_CONTENT_STYLE}
              formatter={(value: number) => `${value.toFixed(1)}%`}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
