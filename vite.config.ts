/// <reference types="vitest/config" />
import { defineConfig, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Yahoo Finance blocks browser requests (CORS), so the app calls the
// same-origin /api/yahoo path and this proxy forwards it. It only exists in
// `vite dev` and `vite preview`; a static deployment has no live prices.
const yahooProxy: Record<string, ProxyOptions> = {
  "/api/yahoo": {
    target: "https://query1.finance.yahoo.com",
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api\/yahoo/, ""),
    configure: (proxy) => {
      proxy.on("proxyReq", (proxyReq) => {
        proxyReq.setHeader(
          "User-Agent",
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36"
        );
        proxyReq.setHeader("Accept", "application/json");
      });
    },
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: yahooProxy },
  preview: { proxy: yahooProxy },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    // Fixed time zone so DD-MM-YYYY parsing and month bucketing are stable.
    env: { TZ: "UTC" },
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/test/**", "src/**/*.test.{ts,tsx}", "src/main.tsx"],
    },
  },
});
