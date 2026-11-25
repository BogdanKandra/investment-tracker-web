import { useEffect, useMemo, useState } from "react";
import { getCachedPrice, loadPrices } from "../api/priceCache";

export interface CurrentPrices {
  /** Latest price per symbol; symbols without a live price are absent. */
  prices: Map<string, number>;
  /** True while any requested symbol is still being fetched. */
  loading: boolean;
  /** Symbols whose price lookup failed. */
  missing: string[];
}

/**
 * Latest prices for the given symbols, from the shared cache. Fetches only
 * symbols that are not cached yet (or whose entry expired).
 */
export function useCurrentPrices(symbols: readonly string[]): CurrentPrices {
  const key = useMemo(() => [...new Set(symbols)].sort().join("|"), [symbols]);
  // Bumped when a fetch completes, to re-read the cache.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const wanted = key ? key.split("|") : [];
    // Includes symbols another component is already fetching, so this
    // component re-renders when those finish too.
    const pending = wanted.filter((s) => !getCachedPrice(s));
    if (pending.length === 0) return;
    let cancelled = false;
    loadPrices(pending).then(() => {
      if (!cancelled) setVersion((v) => v + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return useMemo(() => {
    const wanted = key ? key.split("|") : [];
    const prices = new Map<string, number>();
    const missing: string[] = [];
    let loading = false;
    for (const s of wanted) {
      const entry = getCachedPrice(s);
      if (!entry) loading = true;
      else if (entry.price == null) missing.push(s);
      else prices.set(s, entry.price);
    }
    return { prices, loading, missing };
    // `version` re-reads the module-level cache after a fetch completes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version]);
}
