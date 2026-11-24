import { useMemo, useState, useCallback } from "react";

export interface TableSortState<K extends string> {
  key: K;
  asc: boolean;
}

export interface UseTableSortReturn<T, K extends string> {
  sorted: T[];
  sortKey: K;
  sortAsc: boolean;
  handleSort: (key: K) => void;
  arrow: (key: K) => string;
}

/**
 * Generic table sorting hook. Accepts items and a comparator map keyed by
 * sortable column names. Returns sorted items and UI helpers.
 */
export function useTableSort<T, K extends string>(
  items: T[],
  comparators: Record<K, (a: T, b: T) => number>,
  defaultKey: K,
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

  const arrow = useCallback(
    (key: K) => (sortKey === key ? (sortAsc ? " ↑" : " ↓") : ""),
    [sortKey, sortAsc]
  );

  const sorted = useMemo(() => {
    const cmp = comparators[sortKey];
    if (!cmp) return items;
    const result = [...items].sort(cmp);
    return sortAsc ? result : result.reverse();
  }, [items, comparators, sortKey, sortAsc]);

  return { sorted, sortKey, sortAsc, handleSort, arrow };
}
