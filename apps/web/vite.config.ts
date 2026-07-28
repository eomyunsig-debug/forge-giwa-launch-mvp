import react from "@vitejs/plugin-react";
import { copyFile, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
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

const isPublicDemoBuild = process.env.VITE_PUBLIC_DEMO === "true";

export default defineConfig({
  plugins: [
    react(),
    ...(isPublicDemoBuild
      ? [
          {
            name: "forge-sites-artifacts",
            apply: "build" as const,
            transformIndexHtml(html: string) {
              return html
                .replace(
                  "Forge · GIWA 테스트넷 런치 마켓",
                  "Forge · 읽기 전용 로컬 실행 데모",
                )
                .replace(
                  "Forge — 온체인 사실을 숨기지 않는 GIWA 테스트넷 커뮤니티 런치 마켓",
                  "Forge — 기록된 로컬 Anvil 실행 결과를 보여주는 읽기 전용 공개 데모",
                );
            },
            async buildStart() {
              await rm(resolve(import.meta.dirname, "dist"), {
                recursive: true,
                force: true,
              });
            },
            async closeBundle() {
              const outputRoot = resolve(import.meta.dirname, "dist");
              const serverDirectory = resolve(outputRoot, "server");
              const metadataDirectory = resolve(outputRoot, ".openai");
              await rm(serverDirectory, { recursive: true, force: true });
              await rm(metadataDirectory, { recursive: true, force: true });
              await mkdir(serverDirectory, { recursive: true });
              await mkdir(metadataDirectory, { recursive: true });
              await copyFile(
                resolve(import.meta.dirname, "worker/index.js"),
                resolve(serverDirectory, "index.js"),
              );
              await copyFile(
                resolve(import.meta.dirname, ".openai/hosting.json"),
                resolve(metadataDirectory, "hosting.json"),
              );
            },
          },
        ]
      : []),
  ],
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
    ...(isPublicDemoBuild ? { outDir: "dist/client" } : {}),
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
