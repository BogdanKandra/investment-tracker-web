import { fetchCurrentPrice } from "./marketData";

/**
 * Shared cache of latest prices, so pages don't refetch every symbol on each
 * navigation. A failed lookup is cached as null (shown as "no live price")
 * and retried once the entry expires.
 */

const TTL_MS = 5 * 60 * 1000;

interface Entry {
  price: number | null;
  fetchedAt: number;
}

const cache = new Map<string, Entry>();
const inFlight = new Map<string, Promise<void>>();

function isFresh(entry: Entry | undefined, now: number): entry is Entry {
  return entry !== undefined && now - entry.fetchedAt < TTL_MS;
}

/** Cached entry for a symbol, or undefined if never fetched or expired. */
export function getCachedPrice(
  symbol: string,
  now = Date.now()
): Entry | undefined {
  const entry = cache.get(symbol);
  return isFresh(entry, now) ? entry : undefined;
}

/** Symbols that have no fresh cache entry and no request in progress. */
export function symbolsToFetch(
  symbols: readonly string[],
  now = Date.now()
): string[] {
  return symbols.filter((s) => !isFresh(cache.get(s), now) && !inFlight.has(s));
}

/**
 * Fetches the given symbols that are not freshly cached, sharing requests
 * already in progress. Resolves once all of them are cached.
 */
export async function loadPrices(symbols: readonly string[]): Promise<void> {
  const now = Date.now();
  const pending = symbols.map((symbol) => {
    const existing = inFlight.get(symbol);
    if (existing) return existing;
    if (isFresh(cache.get(symbol), now)) return Promise.resolve();
    const request = fetchCurrentPrice(symbol)
      .catch(() => null)
      .then((price) => {
        cache.set(symbol, { price, fetchedAt: Date.now() });
      })
      .finally(() => inFlight.delete(symbol));
    inFlight.set(symbol, request);
    return request;
  });
  await Promise.all(pending);
}

/** Empties the cache (used by tests). */
export function clearPriceCache(): void {
  cache.clear();
  inFlight.clear();
}
