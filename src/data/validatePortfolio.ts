import {
  CURRENCY_SYMBOLS,
  type CurrencySymbol,
  type PortfolioData,
  type TransactionType,
} from "../types";

const CURRENCIES: readonly CurrencySymbol[] = CURRENCY_SYMBOLS;
const TRANSACTION_TYPES: readonly TransactionType[] = [
  "Buy",
  "Sell",
  "Dividend",
  "Interest",
];
const MAX_REPORTED_ERRORS = 20;

export class PortfolioValidationError extends Error {
  readonly problems: string[];

  constructor(problems: string[]) {
    const shown = problems.slice(0, MAX_REPORTED_ERRORS);
    const more =
      problems.length > shown.length
        ? `\n…and ${problems.length - shown.length} more`
        : "";
    super(`Invalid portfolio file:\n${shown.join("\n")}${more}`);
    this.name = "PortfolioValidationError";
    this.problems = problems;
  }
}

type Json = Record<string, unknown>;

function isObject(v: unknown): v is Json {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** DD-MM-YYYY that is also a real calendar date (rejects 31-02-2024). */
function isValidDate(v: unknown): boolean {
  if (typeof v !== "string") return false;
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(v);
  if (!m) return false;
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(year, month - 1, day);
  return (
    d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day
  );
}

/**
 * Checks that parsed JSON matches PortfolioData, collecting every problem with
 * its path (e.g. "accounts[1].transactions[7].price: expected a number").
 * Returns a converted copy (see normalizePortfolio), or throws
 * PortfolioValidationError.
 */
export function validatePortfolio(data: unknown): PortfolioData {
  const problems: string[] = [];
  const fail = (path: string, msg: string) => problems.push(`${path}: ${msg}`);

  const str = (o: Json, key: string, path: string, optional = false) => {
    const v = o[key];
    if (v === undefined && optional) return;
    if (typeof v !== "string") fail(`${path}.${key}`, "expected a string");
  };
  const num = (o: Json, key: string, path: string) => {
    const v = o[key];
    if (typeof v !== "number" || !Number.isFinite(v)) {
      fail(`${path}.${key}`, "expected a number");
    }
  };
  const date = (o: Json, key: string, path: string, optional = false) => {
    const v = o[key];
    if (v === undefined && optional) return;
    if (!isValidDate(v)) fail(`${path}.${key}`, "expected a date as DD-MM-YYYY");
  };
  const currency = (o: Json, key: string, path: string) => {
    if (!CURRENCIES.includes(o[key] as CurrencySymbol)) {
      fail(`${path}.${key}`, `expected one of ${CURRENCIES.join(", ")}`);
    }
  };

  if (!isObject(data)) {
    throw new PortfolioValidationError(["(root): expected an object"]);
  }

  date(data, "updated_at", "(root)");
  date(data, "w_8ben_activated_at", "(root)", true);

  const targets = data.target_asset_class_distribution;
  if (!isObject(targets)) {
    fail("target_asset_class_distribution", "expected an object");
  } else {
    for (const [k, v] of Object.entries(targets)) {
      if (typeof v !== "number") {
        fail(`target_asset_class_distribution.${k}`, "expected a number");
      }
    }
  }

  if (!Array.isArray(data.accounts)) {
    fail("accounts", "expected an array");
  } else {
    data.accounts.forEach((acct: unknown, ai) => {
      const ap = `accounts[${ai}]`;
      if (!isObject(acct)) return fail(ap, "expected an object");
      str(acct, "account_name", ap);
      num(acct, "cash", ap);
      currency(acct, "currency", ap);
      if (!Array.isArray(acct.transactions)) {
        return fail(`${ap}.transactions`, "expected an array");
      }
      acct.transactions.forEach((tx: unknown, ti) => {
        const tp = `${ap}.transactions[${ti}]`;
        if (!isObject(tx)) return fail(tp, "expected an object");
        date(tx, "date", tp);
        currency(tx, "currency", tp);
        num(tx, "fee", tp);
        str(tx, "note", tp);
        str(tx, "country", tp, true);
        if (!TRANSACTION_TYPES.includes(tx.type as TransactionType)) {
          return fail(
            `${tp}.type`,
            `expected one of ${TRANSACTION_TYPES.join(", ")}`
          );
        }
        if (tx.type === "Interest") {
          num(tx, "amount", tp);
        } else {
          str(tx, "symbol", tp);
          str(tx, "name", tp);
          num(tx, "shares", tp);
          num(tx, "price", tp);
          str(tx, "isin", tp, true);
        }
      });
    });
  }

  if (!Array.isArray(data.watchlist)) {
    fail("watchlist", "expected an array");
  } else {
    data.watchlist.forEach((item: unknown, wi) => {
      const wp = `watchlist[${wi}]`;
      if (!isObject(item)) return fail(wp, "expected an object");
      str(item, "symbol", wp);
      currency(item, "currency", wp);
      str(item, "note", wp);
    });
  }

  if (problems.length > 0) throw new PortfolioValidationError(problems);
  return normalizePortfolio(data);
}

/**
 * Maps the file's single `fee` field to the named field for each type:
 * Buy -> commission, Sell/Dividend/Interest -> taxWithheld. Returns a copy;
 * the input is assumed valid.
 */
function normalizePortfolio(data: Json): PortfolioData {
  const accounts = (data.accounts as Json[]).map((acct) => ({
    ...acct,
    transactions: (acct.transactions as Json[]).map((tx) => {
      const { fee, ...rest } = tx;
      return tx.type === "Buy"
        ? { ...rest, commission: fee }
        : { ...rest, taxWithheld: fee };
    }),
  }));
  return { ...data, accounts } as unknown as PortfolioData;
}
