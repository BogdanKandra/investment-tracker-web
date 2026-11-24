/**
 * One-time script to populate `country` fields in portfolio JSON files.
 * Uses the OpenFIGI API (free, no key required) to resolve ticker → exchange country.
 *
 * Usage:
 *   npx tsx scripts/populate-isins.ts
 *   npx tsx scripts/populate-isins.ts data/portfolio_test.json
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

interface Transaction {
  symbol: string;
  currency: string;
  country?: string;
  [key: string]: unknown;
}

interface Account {
  account_name: string;
  transactions: Transaction[];
  [key: string]: unknown;
}

interface Portfolio {
  accounts: Account[];
  [key: string]: unknown;
}

const CRYPTO_PATTERNS = ["-EUR", "-USD", "-GBP", "-BTC"];

function isCrypto(symbol: string): boolean {
  return CRYPTO_PATTERNS.some((p) => symbol.includes(p));
}

/**
 * Map portfolio symbol suffix → OpenFIGI exchCode.
 * Symbols without a known suffix and with USD currency are assumed US.
 */
function toFigiExchCodes(symbol: string, currency: string): string[] {
  if (symbol.endsWith(".PA")) return ["FP", "PA"];
  if (symbol.endsWith(".DE")) return ["GY", "GR"];
  if (symbol.endsWith(".AS")) return ["NA"];
  if (symbol.endsWith(".RO")) return ["BU"];
  if (symbol.endsWith(".CO")) return ["DC"];
  if (currency === "$" || currency === "USD") return ["US"];
  return [];
}

/**
 * Strip the exchange suffix to get the base ticker for OpenFIGI.
 */
function baseTicker(symbol: string): string {
  const dot = symbol.lastIndexOf(".");
  if (dot > 0 && symbol.length - dot <= 3) {
    return symbol.substring(0, dot);
  }
  return symbol;
}

/**
 * OpenFIGI exchCode → country name mapping.
 */
const EXCH_CODE_TO_COUNTRY: Record<string, string> = {
  US: "USA",
  UN: "USA",
  UW: "USA",
  UQ: "USA",
  UA: "USA",
  PA: "France",
  FP: "France",
  GY: "Germany",
  GR: "Germany",
  NA: "Netherlands",
  LN: "United Kingdom",
  BU: "Romania",
  DC: "Denmark",
  ID: "Ireland",
  BB: "Belgium",
  SM: "Spain",
  IM: "Italy",
  SW: "Switzerland",
  SS: "Sweden",
  NO: "Norway",
  HB: "Finland",
  PL: "Poland",
  AU: "Australia",
  JT: "Japan",
  HK: "Hong Kong",
  KS: "South Korea",
  TT: "Taiwan",
  SP: "Singapore",
  CN: "Canada",
  CT: "Canada",
  BZ: "Brazil",
  IN: "India",
};

interface FigiJob {
  idType: string;
  idValue: string;
  exchCode?: string;
  marketSecDes?: string;
}

interface FigiResult {
  data?: Array<{
    exchCode?: string;
    securityType?: string;
    name?: string;
    [key: string]: unknown;
  }>;
  warning?: string;
  error?: string;
}

async function lookupBatch(jobs: FigiJob[]): Promise<FigiResult[]> {
  const resp = await fetch("https://api.openfigi.com/v3/mapping", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(jobs),
  });

  if (resp.status === 429) {
    console.log("    Rate limited, waiting 60s...");
    await new Promise((r) => setTimeout(r, 60_000));
    return lookupBatch(jobs);
  }

  if (!resp.ok) {
    throw new Error(`OpenFIGI returned ${resp.status}: ${await resp.text()}`);
  }

  return (await resp.json()) as FigiResult[];
}

function resolveCountry(result: FigiResult, exchCodeHint: string | null): string | null {
  if (!result.data || result.data.length === 0) return null;

  const entry = result.data[0]!;
  const code = entry.exchCode ?? exchCodeHint;
  if (code && EXCH_CODE_TO_COUNTRY[code]) {
    return EXCH_CODE_TO_COUNTRY[code]!;
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const files =
    args.length > 0
      ? args.map((f) => resolve(f))
      : [resolve("data/portfolio.json"), resolve("data/portfolio_test.json")];

  for (const filePath of files) {
    console.log(`\nProcessing: ${filePath}`);
    let portfolio: Portfolio;
    try {
      portfolio = JSON.parse(readFileSync(filePath, "utf-8")) as Portfolio;
    } catch (err) {
      console.error(`  Failed to read/parse: ${(err as Error).message}`);
      continue;
    }

    const symbolsInfo = new Map<string, { exchCodes: string[]; currency: string }>();
    for (const account of portfolio.accounts) {
      for (const tx of account.transactions) {
        if (!isCrypto(tx.symbol) && !tx.country) {
          if (!symbolsInfo.has(tx.symbol)) {
            symbolsInfo.set(tx.symbol, {
              exchCodes: toFigiExchCodes(tx.symbol, tx.currency),
              currency: tx.currency,
            });
          }
        }
      }
    }

    if (symbolsInfo.size === 0) {
      console.log("  All transactions already have country (or are crypto). Skipping.");
      continue;
    }

    console.log(`  Found ${symbolsInfo.size} unique symbols to look up...`);

    const countryMap = new Map<string, string>();
    const failed: string[] = [];

    const symbols = [...symbolsInfo.entries()];
    const BATCH_SIZE = 10;

    for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
      const batch = symbols.slice(i, i + BATCH_SIZE);
      const jobs: FigiJob[] = batch.map(([symbol, info]) => {
        const job: FigiJob = {
          idType: "TICKER",
          idValue: baseTicker(symbol),
          marketSecDes: "Equity",
        };
        if (info.exchCodes.length > 0) job.exchCode = info.exchCodes[0];
        return job;
      });

      const results = await lookupBatch(jobs);

      const retryList: Array<{ idx: number; symbol: string; info: { exchCodes: string[]; currency: string } }> = [];

      for (let j = 0; j < batch.length; j++) {
        const [symbol, info] = batch[j]!;
        const result = results[j]!;
        const country = resolveCountry(result, info.exchCodes[0] ?? null);

        if (country) {
          countryMap.set(symbol, country);
          console.log(`    ${symbol} → ${country}`);
        } else if (info.exchCodes.length > 1) {
          retryList.push({ idx: j, symbol, info });
        } else {
          failed.push(symbol);
          console.log(`    ${symbol} → not found`);
        }
      }

      if (retryList.length > 0) {
        await new Promise((r) => setTimeout(r, 2500));
        const retryJobs: FigiJob[] = retryList.map(({ symbol, info }) => ({
          idType: "TICKER",
          idValue: baseTicker(symbol),
          exchCode: info.exchCodes[1],
          marketSecDes: "Equity",
        }));
        const retryResults = await lookupBatch(retryJobs);
        for (let k = 0; k < retryList.length; k++) {
          const { symbol, info } = retryList[k]!;
          const result = retryResults[k]!;
          const country = resolveCountry(result, info.exchCodes[1] ?? null);
          if (country) {
            countryMap.set(symbol, country);
            console.log(`    ${symbol} → ${country} (retry)`);
          } else {
            failed.push(symbol);
            console.log(`    ${symbol} → not found`);
          }
        }
      }

      if (i + BATCH_SIZE < symbols.length) {
        await new Promise((r) => setTimeout(r, 2500));
      }
    }

    let updated = 0;
    for (const account of portfolio.accounts) {
      for (const tx of account.transactions) {
        if (!tx.country && countryMap.has(tx.symbol)) {
          tx.country = countryMap.get(tx.symbol)!;
          updated++;
        }
      }
    }

    writeFileSync(filePath, JSON.stringify(portfolio, null, 4) + "\n", "utf-8");
    console.log(`  Updated ${updated} transactions in ${filePath}`);
    if (failed.length > 0) {
      console.log(`  Could not resolve: ${failed.join(", ")}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
