import { defineConfig, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

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
});
