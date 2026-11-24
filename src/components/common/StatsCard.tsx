interface StatsCardProps {
  label: string;
  value: string;
  subValue?: string;
  trend?: "up" | "down" | "neutral";
}

export default function StatsCard({
  label,
  value,
  subValue,
  trend,
}: StatsCardProps) {
  const trendColor =
    trend === "up"
      ? "text-gain"
      : trend === "down"
        ? "text-loss"
        : "text-muted";

  return (
    <div className="bg-card rounded-xl p-4 border border-white/5">
      <div className="text-xs text-muted mb-1 uppercase tracking-wide">
        {label}
      </div>
      <div className="text-xl font-semibold text-white">{value}</div>
      {subValue && (
        <div className={`text-sm mt-0.5 ${trendColor}`}>{subValue}</div>
      )}
    </div>
  );
}
