import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

const tsxCli = resolve(process.cwd(), "node_modules/tsx/dist/cli.mjs");
const localStackCommand = `exec "${process.execPath}" "${tsxCli}" scripts/local-stack.ts`;
const webPort = process.env.FORGE_WEB_PORT ?? "5173";
const webUrl = `http://127.0.0.1:${webPort}`;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./artifacts/playwright",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 180_000,
  expect: {
    timeout: 30_000,
  },
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never" }]]
    : [["line"]],
  use: {
    baseURL: webUrl,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        viewport: { width: 375, height: 812 },
      },
    },
  ],
  webServer: {
    command: localStackCommand,
    url: webUrl,
    timeout: 180_000,
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe",
    gracefulShutdown: {
      signal: "SIGTERM",
      timeout: 5_000,
    },
  },
});
