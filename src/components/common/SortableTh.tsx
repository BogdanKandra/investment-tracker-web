import type { ReactNode } from "react";

export interface SortControls<K extends string> {
  sortKey: K;
  sortAsc: boolean;
  handleSort: (key: K) => void;
}

interface SortableThProps<K extends string> {
  sort: SortControls<K>;
  sortKey: K;
  className?: string;
  children: ReactNode;
}

/**
 * Column header that sorts its table. The sort control is a real button, so
 * it is reachable with Tab and works with Enter/Space; aria-sort tells
 * screen readers the current order.
 */
export default function SortableTh<K extends string>({
  sort,
  sortKey,
  className,
  children,
}: SortableThProps<K>) {
  const active = sort.sortKey === sortKey;
  const ariaSort = active
    ? sort.sortAsc
      ? "ascending"
      : "descending"
    : "none";
  return (
    <th className={className} aria-sort={ariaSort}>
      <button
        type="button"
        onClick={() => sort.handleSort(sortKey)}
        className="w-full [text-align:inherit] uppercase tracking-wide cursor-pointer hover:text-white select-none rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
      >
        {children}
        <span aria-hidden="true">
          {active ? (sort.sortAsc ? " ↑" : " ↓") : ""}
        </span>
      </button>
    </th>
  );
}
