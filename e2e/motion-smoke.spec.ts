import { expect, test } from "@playwright/test";

import recordedLaunch from "../apps/web/src/publicDemoRecord.json";

test("1440 첫 화면과 지갑 임베드 단일 컬럼 계약", async ({ page }) => {
  const launch = { ...recordedLaunch.data, imageUrl: null };
  await page.route("**/api/v1/launches?*", async (route) => {
    await route.fulfill({
      json: {
        data: [launch],
        meta: recordedLaunch.meta,
      },
    });
  });
  await page.route(
    `**/api/v1/launches/${launch.chainId}/${launch.tokenAddress}`,
    async (route) => {
      await route.fulfill({
        json: {
          data: launch,
          meta: recordedLaunch.meta,
        },
      });
    },
  );

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const firstCard = page.getByTestId("launch-card").first();
  await expect(firstCard).toBeVisible();
  const firstCardBox = await firstCard.boundingBox();
  expect(firstCardBox).not.toBeNull();
  expect((firstCardBox?.y ?? 900) + (firstCardBox?.height ?? 1)).toBeLessThan(
    900,
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?embed=wallet");
  await expect(page.locator('.app-shell[data-embed="wallet"]')).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "위험을 먼저 보고 런치를 선택하세요",
    }),
  ).toBeVisible();
  await expect(page.locator(".desktop-nav")).toHaveCount(0);
  await expect(page.locator(".mobile-nav")).toHaveCount(0);
  await expect(page.locator(".wallet-area")).toHaveCount(0);
  await expect(firstCard).toBeVisible();
  await expect(firstCard.locator("a")).toHaveAttribute(
    "href",
    new RegExp(
      `^/token/${launch.chainId}/${launch.tokenAddress}\\?embed=wallet$`,
    ),
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);

  await firstCard.locator("a").click();
  await expect(page).toHaveURL(
    new RegExp(
      `/token/${launch.chainId}/${launch.tokenAddress}\\?embed=wallet$`,
    ),
  );
  await expect(page.getByTestId("wallet-risk-disclosure")).not.toHaveAttribute(
    "open",
  );

  const singleColumn = await page.evaluate(() => {
    const decision = document.querySelector<HTMLElement>(
      ".token-sidebar__sticky",
    );
    const chart = document.querySelector<HTMLElement>(".chart-card");
    if (!decision || !chart) throw new Error("EMBED_COLUMN_ITEMS_MISSING");
    const decisionBox = decision.getBoundingClientRect();
    const chartBox = chart.getBoundingClientRect();
    return {
      sameLeft: Math.abs(decisionBox.left - chartBox.left) < 1,
      sameWidth: Math.abs(decisionBox.width - chartBox.width) < 1,
      sequential: decisionBox.bottom <= chartBox.top,
      scrollWidth: document.documentElement.scrollWidth,
    };
  });
  expect(singleColumn).toEqual({
    sameLeft: true,
    sameWidth: true,
    sequential: true,
    scrollWidth: 390,
  });

  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/?embed=wallet");
  await expect(page.getByTestId("launch-card")).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
  await expect(page.locator(".wallet-area")).toHaveCount(0);
  await expect(page.locator(".mobile-nav")).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?embed=wallet");
  const embedMotion = await page
    .locator(".wallet-embed-intro")
    .evaluate((element) => {
      const style = getComputedStyle(element);
      const toMilliseconds = (value: string) =>
        value.endsWith("ms")
          ? Number.parseFloat(value)
          : Number.parseFloat(value) * 1_000;
      return {
        animationDurationMs: toMilliseconds(style.animationDuration),
        transitionDurationMs: toMilliseconds(style.transitionDuration),
      };
    });
  expect(embedMotion.animationDurationMs).toBeLessThanOrEqual(1);
  expect(embedMotion.transitionDurationMs).toBeLessThanOrEqual(1);
});

test("페이지 종료·진입과 reduced-motion 계약", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /빠르게 만들고/ }),
  ).toBeVisible();

  let releaseRouteChunk: (() => void) | undefined;
  let routeChunkRequested = false;
  const routeChunkGate = new Promise<void>((resolve) => {
    releaseRouteChunk = resolve;
  });
  await page.route("**/src/pages/OtherPages.tsx*", async (route) => {
    routeChunkRequested = true;
    await routeChunkGate;
    await route.continue();
  });

  await page.evaluate(() => {
    const target = document.querySelector(".route-stage");
    if (!target) throw new Error("ROUTE_STAGE_MISSING");
    const state = window as typeof window & {
      __forgeMotionPhases?: string[];
      __forgeMotionObserver?: MutationObserver;
    };
    state.__forgeMotionPhases = [
      target.getAttribute("data-motion-state") ?? "missing",
    ];
    state.__forgeMotionObserver = new MutationObserver(() => {
      state.__forgeMotionPhases?.push(
        target.getAttribute("data-motion-state") ?? "missing",
      );
    });
    state.__forgeMotionObserver.observe(target, {
      attributes: true,
      attributeFilter: ["data-motion-state"],
    });
  });

  await page.getByRole("link", { name: "위험", exact: true }).click();
  await expect(page).toHaveURL(/\/about\/risk$/);
  await expect.poll(() => routeChunkRequested).toBe(true);
  await page.waitForTimeout(220);
  await expect(
    page.getByRole("heading", { name: /빠르게 만들고/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("status", { name: "페이지 불러오는 중" }),
  ).toBeVisible();
  releaseRouteChunk?.();
  await expect(
    page.getByRole("heading", { name: "점수 대신 사실을 보여줍니다" }),
  ).toBeVisible();
  await page.unroute("**/src/pages/OtherPages.tsx*");

  const routeResult = await page.evaluate(() => {
    const stage = document.querySelector(".route-stage");
    const state = window as typeof window & {
      __forgeMotionPhases?: string[];
    };
    return {
      phases: state.__forgeMotionPhases ?? [],
      inert: stage?.hasAttribute("inert") ?? true,
      mainCount: document.querySelectorAll("main").length,
      activeId: document.activeElement?.id ?? "",
    };
  });
  expect(routeResult.phases).toContain("exit");
  expect(routeResult.phases).toContain("enter");
  expect(routeResult.inert).toBe(false);
  expect(routeResult.mainCount).toBe(1);
  expect(routeResult.activeId).toBe("main");

  await page.getByRole("link", { name: "런치", exact: true }).click();
  await page.goBack();
  await expect(page).toHaveURL(/\/about\/risk$/);
  await expect(
    page.getByRole("heading", { name: "점수 대신 사실을 보여줍니다" }),
  ).toBeVisible();
  await expect(page.locator(".route-stage")).not.toHaveAttribute("inert");
  await expect(page.locator(".route-stage")).not.toHaveAttribute("aria-hidden");

  const touchTargets = await page
    .locator(".mobile-nav a")
    .evaluateAll((links) =>
      links.map((link) => {
        const rect = link.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      }),
    );
  for (const target of touchTargets) {
    expect(target.width).toBeGreaterThanOrEqual(44);
    expect(target.height).toBeGreaterThanOrEqual(44);
  }
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(375);

  for (const width of [721, 768, 1050]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator(".desktop-nav")).toBeVisible();
    await expect(page.locator(".mobile-nav")).toBeHidden();
    await expect(page.locator(".desktop-nav a")).toHaveCount(4);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  }
  await page.setViewportSize({ width: 375, height: 812 });

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect
    .poll(() =>
      page.evaluate(
        () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      ),
    )
    .toBe(true);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /빠르게 만들고/ }),
  ).toBeVisible();

  const reducedStyle = await page.evaluate(() => {
    const reveal = document.querySelector(".motion-reveal");
    if (!reveal) throw new Error("MOTION_REVEAL_MISSING");
    const style = getComputedStyle(reveal);
    const toMilliseconds = (value: string) =>
      value.endsWith("ms")
        ? Number.parseFloat(value)
        : Number.parseFloat(value) * 1_000;
    return {
      animationDurationMs: toMilliseconds(style.animationDuration),
      transitionDurationMs: toMilliseconds(style.transitionDuration),
      scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
    };
  });
  expect(reducedStyle.animationDurationMs).toBeLessThanOrEqual(1);
  expect(reducedStyle.transitionDurationMs).toBeLessThanOrEqual(1);
  expect(reducedStyle.scrollBehavior).toBe("auto");

  await page.getByRole("link", { name: "만들기", exact: true }).click();
  await expect(page).toHaveURL(/\/create$/);
  await expect(
    page.getByRole("heading", { name: "새 커뮤니티 자산 만들기" }),
  ).toBeVisible();
  await expect(page.locator(".route-stage")).not.toHaveAttribute("inert");
});
