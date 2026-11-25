import { useMemo, useState, useCallback } from "react";

export interface UseTableSortReturn<T, K extends string> {
  sorted: T[];
  sortKey: K;
  sortAsc: boolean;
  handleSort: (key: K) => void;
}

/**
 * Generic table sorting hook. Accepts items and a comparator map keyed by
 * sortable column names. Returns the sorted items plus the sort state, which
 * SortableTh renders as accessible column headers.
 *
 * Clicking the active column flips the direction; a new column starts
 * descending.
 */
export function useTableSort<T, K extends string>(
  items: T[],
  comparators: Record<K, (a: T, b: T) => number>,
  // NoInfer: the column keys come from `comparators`, not the default.
  defaultKey: NoInfer<K>,
  defaultAsc = false
): UseTableSortReturn<T, K> {
  const [sortKey, setSortKey] = useState<K>(defaultKey);
  const [sortAsc, setSortAsc] = useState(defaultAsc);

  const handleSort = useCallback(
    (key: K) => {
      if (sortKey === key) setSortAsc((v) => !v);
      else {
        setSortKey(key);
        setSortAsc(false);
      }
    },
    [sortKey]
  );

  const sorted = useMemo(() => {
    const cmp = comparators[sortKey];
    if (!cmp) return items;
    // Swapping arguments (rather than reversing the result) keeps ties in
    // their original order in both directions.
    return [...items].sort((a, b) => (sortAsc ? cmp(a, b) : cmp(b, a)));
  }, [items, comparators, sortKey, sortAsc]);

  return { sorted, sortKey, sortAsc, handleSort };
}
