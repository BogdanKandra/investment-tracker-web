import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useTableSort } from "./useTableSort";

type Row = { name: string; value: number };
const rows: Row[] = [
  { name: "b", value: 2 },
  { name: "a", value: 3 },
  { name: "c", value: 1 },
];
const comparators = {
  name: (x: Row, y: Row) => x.name.localeCompare(y.name),
  value: (x: Row, y: Row) => x.value - y.value,
};
const names = (r: Row[]) => r.map((x) => x.name).join("");

describe("useTableSort", () => {
  it("sorts descending by the default key", () => {
    const { result } = renderHook(() =>
      useTableSort(rows, comparators, "value")
    );
    expect(names(result.current.sorted)).toBe("abc");
    expect(result.current.sortAsc).toBe(false);
  });

  it("honours an ascending default", () => {
    const { result } = renderHook(() =>
      useTableSort(rows, comparators, "value", true)
    );
    expect(names(result.current.sorted)).toBe("cba");
  });

  it("toggles direction on the same key and resets to descending on a new key", () => {
    const { result } = renderHook(() =>
      useTableSort<Row, "name" | "value">(rows, comparators, "value")
    );
    act(() => result.current.handleSort("value"));
    expect(names(result.current.sorted)).toBe("cba");
    act(() => result.current.handleSort("name"));
    expect(result.current.sortKey).toBe("name");
    expect(names(result.current.sorted)).toBe("cba");
    act(() => result.current.handleSort("name"));
    expect(names(result.current.sorted)).toBe("abc");
  });

  it("does not mutate the input", () => {
    const input = [...rows];
    renderHook(() => useTableSort(input, comparators, "name"));
    expect(input).toEqual(rows);
  });
});
