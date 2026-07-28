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
                .replaceAll(
                  "Forge · 온체인 위험 공개 런치패드",
                  "Forge · 읽기 전용 로컬 실행 데모",
                )
                .replace(
                  "Forge — 온체인 위험 사실을 보여주는 커뮤니티 토큰 런치패드 프로토타입. GIWA 공식 서비스가 아닙니다.",
                  "Forge — 기록된 로컬 Anvil 실행 결과를 보여주는 읽기 전용 공개 데모",
                )
                .replace(
                  "추가 민팅, 창작자 베스팅, 유동성 잠금 등 검증 가능한 온체인 사실을 분리해 보여주는 테스트넷 프로토타입입니다.",
                  "실제 로컬 Anvil 수직 흐름에서 기록된 온체인 사실을 보여주는 읽기 전용 공개 데모입니다.",
                )
                .replace(
                  "수익이나 안전을 보증하지 않고 검증 가능한 온체인 위험 사실을 보여주는 테스트넷 프로토타입입니다.",
                  "실시간 GIWA 배포가 아닌 로컬 Anvil 실행 기록이며 수익이나 안전을 보증하지 않습니다.",
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
