import { usePortfolio } from "../../context/PortfolioContext";

export default function AccountSelect() {
  const { portfolio, selectedAccount, setSelectedAccount } = usePortfolio();

  return (
    <select
      value={selectedAccount ?? "__all__"}
      onChange={(e) =>
        setSelectedAccount(
          e.target.value === "__all__" ? undefined : e.target.value
        )
      }
      className="bg-card border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
    >
      <option value="__all__">All Accounts</option>
      {portfolio.accounts.map((a) => (
        <option key={a.account_name} value={a.account_name}>
          {a.account_name} ({a.currency})
        </option>
      ))}
    </select>
  );
}
