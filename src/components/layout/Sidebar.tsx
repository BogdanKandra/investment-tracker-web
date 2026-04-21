import { NavLink } from "react-router-dom";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: "📊" },
  { to: "/holdings", label: "Holdings", icon: "💼" },
  { to: "/transactions", label: "Transactions", icon: "📋" },
  { to: "/dividends", label: "Dividends", icon: "💰" },
  { to: "/performance", label: "Performance", icon: "📈" },
  { to: "/watchlist", label: "Watchlist", icon: "👁" },
  { to: "/taxes", label: "Taxes", icon: "🧾" },
];

export default function Sidebar() {
  return (
    <aside className="w-56 bg-sidebar h-full flex flex-col py-6 px-3 shrink-0 overflow-y-auto">
      <div className="text-xl font-bold text-white px-3 mb-8 tracking-tight">
        InvestTracker
      </div>
      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-white/10 text-white"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`
            }
          >
            <span className="text-base">{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
