import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { cloneElement, createElement, isValidElement } from "react";
import type { ReactElement } from "react";
import { clearPriceCache } from "../api/priceCache";

afterEach(() => {
  cleanup();
  clearPriceCache();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// lightweight-charts draws on <canvas>, which jsdom lacks. A chainable fake is
// enough: tests check the page around the chart, not the drawing.
vi.mock("lightweight-charts", () => {
  const series = () => ({ setData: vi.fn(), setMarkers: vi.fn() });
  const chart = () => ({
    addCandlestickSeries: vi.fn(series),
    addHistogramSeries: vi.fn(series),
    removeSeries: vi.fn(),
    priceScale: vi.fn(() => ({ applyOptions: vi.fn() })),
    timeScale: vi.fn(() => ({ fitContent: vi.fn() })),
    applyOptions: vi.fn(),
    remove: vi.fn(),
  });
  return {
    createChart: vi.fn(chart),
    ColorType: { Solid: "solid" },
    CrosshairMode: { Normal: 0 },
  };
});

// ResponsiveContainer measures its parent, which is 0x0 in jsdom, and then
// renders nothing. Give charts a fixed size instead.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: unknown }) =>
      createElement(
        "div",
        { style: { width: 800, height: 400 } },
        isValidElement(children)
          ? cloneElement(
              children as ReactElement<object>,
              {
                width: 800,
                height: 400,
              } as object
            )
          : null
      ),
  };
});

// jsdom lacks these browser APIs.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??=
  ResizeObserverStub as unknown as typeof ResizeObserver;

window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
})) as typeof window.matchMedia;
