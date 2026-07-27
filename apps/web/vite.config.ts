import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

const securityHeaders = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: http://127.0.0.1:* https:; connect-src 'self' http://127.0.0.1:* https://sepolia-rpc.giwa.io https://sepolia-explorer.giwa.io; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};
const developmentSecurityHeaders = {
  ...securityHeaders,
  // Vite's React fast-refresh preamble is an inline module in development.
  // Production preview keeps the stricter script-src policy above.
  "Content-Security-Policy": securityHeaders["Content-Security-Policy"].replace(
    "script-src 'self'",
    "script-src 'self' 'unsafe-inline'",
  ),
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@forge/shared": fileURLToPath(
        new URL("../../packages/shared/src/index.ts", import.meta.url),
      ),
      "@forge/chain-config": fileURLToPath(
        new URL("../../packages/chain-config/src/index.ts", import.meta.url),
      ),
      "@forge/sdk": fileURLToPath(
        new URL("../../packages/sdk/src/index.ts", import.meta.url),
      ),
      "@forge/ui": fileURLToPath(
        new URL("../../packages/ui/src/index.tsx", import.meta.url),
      ),
    },
  },
  server: {
    headers: developmentSecurityHeaders,
  },
  preview: {
    headers: securityHeaders,
  },
  build: {
    sourcemap: false,
    target: "es2022",
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.{ts,tsx}"],
    css: true,
  },
});
