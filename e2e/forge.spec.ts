import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";
import { format } from "prettier";

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
      let selectedAccountIndex = 0;

      const emit = (event: string, ...values: unknown[]) => {
        for (const listener of eventListeners.get(event) ?? []) {
          listener(...values);
        }
      };

      const requestRpc = async (method: string, params: unknown[] = []) => {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: ++rpcId,
            method,
            params,
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
        return payload.result;
      };

      const selectedAccounts = async () => {
        const accounts = await requestRpc("eth_accounts");
        if (!Array.isArray(accounts)) return [];
        const selected = (accounts as unknown[])[selectedAccountIndex];
        return typeof selected === "string" ? [selected] : [];
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
          if (method === "eth_accounts") return await selectedAccounts();
          const result = await requestRpc(
            method,
            Array.isArray(input.params)
              ? Array.from(input.params as readonly unknown[])
              : [],
          );
          if (method === "eth_sendTransaction" && typeof result === "string") {
            const transactions =
              (
                window as typeof window & {
                  __forgeTransactions?: string[];
                }
              ).__forgeTransactions ?? [];
            transactions.push(result);
            (
              window as typeof window & {
                __forgeTransactions?: string[];
              }
            ).__forgeTransactions = transactions;
          }
          return result;
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

      Object.defineProperty(window, "__forgeSelectAccount", {
        configurable: false,
        enumerable: false,
        async value(index: number) {
          selectedAccountIndex = index;
          const accounts = await selectedAccounts();
          if (!accounts[0]) {
            throw new Error(`Anvil account ${index} is unavailable`);
          }
          emit("accountsChanged", accounts);
          return accounts[0];
        },
        writable: false,
      });

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

async function selectAnvilAccount(page: Page, index: number): Promise<string> {
  const address = await page.evaluate(async (selectedIndex) => {
    const select = (
      window as typeof window & {
        __forgeSelectAccount?: (index: number) => Promise<string>;
      }
    ).__forgeSelectAccount;
    if (!select) throw new Error("Anvil account selector is unavailable");
    return await select(selectedIndex);
  }, index);
  await expect
    .poll(async () =>
      (await page.locator(".account-chip").textContent())?.toLowerCase(),
    )
    .toContain(address.slice(-4).toLowerCase());
  return address;
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
  await expect(page.getByText("Liquidity Locked", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByText("Contract Template Verified", { exact: true }),
  ).toHaveCount(0);
  const liquidityLockFact = page.locator("article.risk-fact").filter({
    has: page.getByRole("heading", { name: "유동성 잠금 방식" }),
  });
  await expect(liquidityLockFact).toContainText("데이터 수집 중");
  await expect(liquidityLockFact).toContainText("락커 주소 기록됨");
  await expect(page.getByText("LP 락커", { exact: true })).toBeVisible();
  await expect(page.getByText("베스팅 볼트", { exact: true })).toBeVisible();
  await expect(
    page.getByText("실제 유동성", { exact: true }).first(),
  ).toBeVisible();

  const detailResponse = await page.request.get(
    `${indexerUrl}/api/v1/launches/31337/${tokenAddress}`,
  );
  expect(detailResponse.ok()).toBe(true);
  const detail = (await detailResponse.json()) as {
    data: { lockerAddress: string };
  };
  const principalResponse = await page.request.post(rpcUrl, {
    data: {
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [
        {
          to: detail.data.lockerAddress,
          data: "0x8ca020ce",
        },
        "latest",
      ],
    },
  });
  expect(principalResponse.ok()).toBe(true);
  const principal = (await principalResponse.json()) as { result?: string };
  expect(BigInt(principal.result ?? "0x0")).toBe(1n);

  const tokenFocusOrder = await page
    .locator(
      ".token-layout a[href], .token-layout button:not([disabled]), .token-layout input:not([disabled])",
    )
    .evaluateAll((elements) =>
      elements.map((element) => element.textContent.trim()),
    );
  const buyControlIndex = tokenFocusOrder.findIndex((label) =>
    label.includes("매수"),
  );
  const riskLinkIndex = tokenFocusOrder.findIndex((label) =>
    label.includes("배지 의미 보기"),
  );
  const creatorLinkIndex = tokenFocusOrder.findIndex((label) =>
    label.includes("창작자 프로필"),
  );
  expect(buyControlIndex).toBeGreaterThanOrEqual(0);
  expect(riskLinkIndex).toBeGreaterThan(buyControlIndex);
  expect(creatorLinkIndex).toBeGreaterThan(riskLinkIndex);

  const buyAmounts = Array.from({ length: 12 }, () => "0.02");
  for (const [index, buyAmount] of buyAmounts.entries()) {
    await selectAnvilAccount(page, index + 1);
    await page.getByTestId("trade-amount").fill(buyAmount);
    await page
      .locator(".trade-action-motion .motion-swap__incoming")
      .getByTestId("get-quote")
      .click();
    await expect(
      page
        .locator(".quote-motion .motion-swap__incoming")
        .getByText("예상 수령량"),
    ).toBeVisible();
    const executeTrade = page
      .locator(".trade-action-motion .motion-swap__incoming")
      .getByTestId("execute-trade");
    await expect(executeTrade).toContainText("매수 트랜잭션 확인");
    await expect(executeTrade).toBeFocused();
    await executeTrade.click();
    await waitForIndexedTrade(page, tokenAddress, index + 1);
    await expect(
      page.locator(".transaction-state[data-status='confirmed']"),
    ).toContainText("거래 영수증 확인됨");
  }

  await selectAnvilAccount(page, 1);
  await page.getByRole("button", { name: "매도", exact: true }).click();
  await page.getByTestId("trade-amount").fill("1000");
  await page
    .locator(".trade-action-motion .motion-swap__incoming")
    .getByTestId("get-quote")
    .click();
  const executeSell = page
    .locator(".trade-action-motion .motion-swap__incoming")
    .getByTestId("execute-trade");
  await expect(executeSell).toContainText(/정확히 1,000 FE2E 승인 후 매도/);
  await executeSell.click();
  await waitForIndexedTrade(page, tokenAddress, 13);
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
  // launch + twelve buys from distinct accounts + exact approval + sell
  expect(transactionCount).toBe(15);

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Forge E2E Friends" }),
  ).toBeVisible();
  await expect(page.getByText(/실제 체결 13건/)).toBeVisible();
  await expect(page.getByText(/저점 대비/).first()).toBeVisible();
  await expect(page.getByText(/1 tETH ≈/).first()).toBeVisible();

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

  if (process.env.FORGE_CAPTURE_PUBLIC_DEMO === "1") {
    const captureResponse = await page.request.get(
      `${indexerUrl}/api/v1/launches/31337/${tokenAddress}`,
    );
    expect(captureResponse.ok()).toBe(true);
    const canonicalJson = await format(
      JSON.stringify(await captureResponse.json()),
      { parser: "json" },
    );
    await writeFile(
      resolve("apps/web/src/publicDemoRecord.json"),
      canonicalJson,
      "utf8",
    );
  }
});
