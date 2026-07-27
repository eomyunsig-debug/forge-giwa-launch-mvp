import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const rpcUrl = "http://127.0.0.1:8545";
const indexerUrl = "http://127.0.0.1:8787";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

async function installAnvilWallet(page: Page): Promise<void> {
  await page.addInitScript(
    ({ endpoint }) => {
      const eventListeners = new Map<
        string,
        Set<(...values: unknown[]) => void>
      >();
      let rpcId = 0;

      const emit = (event: string, ...values: unknown[]) => {
        for (const listener of eventListeners.get(event) ?? []) {
          listener(...values);
        }
      };

      const provider = {
        async request(input: {
          method: string;
          params?: readonly unknown[] | object;
        }) {
          if (
            input.method === "wallet_switchEthereumChain" ||
            input.method === "wallet_addEthereumChain"
          ) {
            emit("chainChanged", "0x7a69");
            return null;
          }
          const method =
            input.method === "eth_requestAccounts"
              ? "eth_accounts"
              : input.method;
          const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: ++rpcId,
              method,
              params: input.params ?? [],
            }),
          });
          const payload = (await response.json()) as {
            result?: unknown;
            error?: { code?: number; message?: string; data?: unknown };
          };
          if (payload.error) {
            const error = new Error(
              payload.error.message ?? "RPC request failed",
            );
            Object.assign(error, payload.error);
            throw error;
          }
          if (
            method === "eth_sendTransaction" &&
            typeof payload.result === "string"
          ) {
            const transactions =
              (
                window as typeof window & {
                  __forgeTransactions?: string[];
                }
              ).__forgeTransactions ?? [];
            transactions.push(payload.result);
            (
              window as typeof window & {
                __forgeTransactions?: string[];
              }
            ).__forgeTransactions = transactions;
          }
          return payload.result;
        },
        on(event: string, listener: (...values: unknown[]) => void) {
          const listeners = eventListeners.get(event) ?? new Set();
          listeners.add(listener);
          eventListeners.set(event, listeners);
        },
        removeListener(
          event: string,
          listener: (...values: unknown[]) => void,
        ) {
          eventListeners.get(event)?.delete(listener);
        },
      };

      Object.defineProperty(window, "ethereum", {
        configurable: false,
        enumerable: true,
        value: provider,
        writable: false,
      });
      const detail = {
        info: {
          uuid: "1c8b2514-0d4a-4ab3-909d-64a51bd7fe2d",
          name: "Forge Anvil",
          icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E",
          rdns: "local.forge.anvil",
        },
        provider,
      };
      const announce = () => {
        window.dispatchEvent(
          new CustomEvent("eip6963:announceProvider", { detail }),
        );
      };
      window.addEventListener("eip6963:requestProvider", announce);
      queueMicrotask(announce);
    },
    { endpoint: rpcUrl },
  );
}

async function waitForIndexedTrade(
  page: Page,
  tokenAddress: string,
  expectedCount: number,
): Promise<void> {
  await expect
    .poll(
      async () => {
        const response = await page.request.get(
          `${indexerUrl}/api/v1/launches/31337/${tokenAddress}`,
        );
        if (!response.ok()) return 0;
        const payload = (await response.json()) as {
          data?: { trades?: unknown[] };
        };
        return payload.data?.trades?.length ?? 0;
      },
      {
        message: `인덱서가 ${expectedCount}개의 체결을 반영해야 합니다.`,
        timeout: 45_000,
      },
    )
    .toBeGreaterThanOrEqual(expectedCount);
}

test("로컬 생성 → 매수 → 정확한 승인 매도 → 인덱서 복원", async ({ page }) => {
  await installAnvilWallet(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /빠르게 만들고/ }),
  ).toBeVisible();

  await page.getByTestId("connect-wallet").click();
  await expect(
    page.getByRole("button", { name: "지갑 연결 해제" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "만들기" }).first().click();
  await expect(page).toHaveURL(/\/create$/);
  await page.getByTestId("create-name").fill("Forge E2E Friends");
  await page.getByTestId("create-symbol").fill("FE2E");
  await page
    .getByLabel("설명")
    .fill("로컬 Anvil에서 생성·거래·인덱싱 복원을 검증하는 테스트 자산입니다.");
  await page.getByTestId("create-allocation").fill("500");
  await page.getByTestId("create-liquidity").fill("1");
  await page.getByTestId("create-image").setInputFiles({
    name: "forge-e2e.png",
    mimeType: "image/png",
    buffer: png,
  });

  await page.getByTestId("review-launch").click();
  await expect(page.getByTestId("launch-review")).toContainText(
    "Forge E2E Friends · $FE2E",
  );
  await expect(page.getByText("지갑에서 승인할 정확한 전송액")).toBeVisible();
  await page.getByTestId("confirm-launch").click();

  await page.waitForURL(/\/token\/31337\/0x[a-fA-F0-9]{40}$/, {
    timeout: 60_000,
  });
  const tokenAddress = page.url().split("/").at(-1);
  expect(tokenAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
  if (!tokenAddress) throw new Error("Token address missing from URL");

  await expect(
    page.getByRole("heading", { name: "Forge E2E Friends" }),
  ).toBeVisible();
  await expect(page.getByText("위험 사실")).toBeVisible();
  await expect(
    page.getByText("Liquidity Locked", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Contract Template Verified", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("LP 락커", { exact: true })).toBeVisible();
  await expect(page.getByText("베스팅 볼트", { exact: true })).toBeVisible();
  await expect(
    page.getByText("실제 유동성", { exact: true }).first(),
  ).toBeVisible();

  await page.getByTestId("trade-amount").fill("0.05");
  await page.getByTestId("get-quote").click();
  await expect(page.getByText("예상 수령량")).toBeVisible();
  await expect(page.getByTestId("execute-trade")).toContainText(
    "매수 트랜잭션 확인",
  );
  await page.getByTestId("execute-trade").click();
  await waitForIndexedTrade(page, tokenAddress, 1);
  await expect(
    page.locator(".transaction-state[data-status='confirmed']"),
  ).toContainText("거래 영수증 확인됨");

  await page.getByRole("tab", { name: "매도" }).click();
  await page.getByTestId("trade-amount").fill("1000");
  await page.getByTestId("get-quote").click();
  await expect(page.getByTestId("execute-trade")).toContainText(
    /정확히 1,000 FE2E 승인 후 매도/,
  );
  await page.getByTestId("execute-trade").click();
  await waitForIndexedTrade(page, tokenAddress, 2);
  await expect(
    page.locator(".transaction-state[data-status='confirmed']"),
  ).toContainText("거래 영수증 확인됨");

  const transactionCount = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __forgeTransactions?: string[];
        }
      ).__forgeTransactions?.length ?? 0,
  );
  expect(transactionCount).toBe(4);

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Forge E2E Friends" }),
  ).toBeVisible();
  await expect(page.getByText("실제 체결 2건")).toBeVisible();

  const screenshotDirectory = resolve("artifacts/screenshots");
  await mkdir(screenshotDirectory, { recursive: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({
    path: `${screenshotDirectory}/forge-token-375x812.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(375);

  await page.setViewportSize({ width: 430, height: 932 });
  await page.screenshot({
    path: `${screenshotDirectory}/forge-token-430x932.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(430);

  await page.goto("/");
  await expect(
    page.getByTestId("launch-card").filter({ hasText: "Forge E2E Friends" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({
    path: `${screenshotDirectory}/forge-home-1440x900.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(1440);
});
