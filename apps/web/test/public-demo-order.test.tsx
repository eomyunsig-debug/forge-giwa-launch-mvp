import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import type { ComponentType } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let TokenPage: ComponentType;
let publicDemoLaunch: {
  chainId: number;
  tokenAddress: string;
  riskFacts: unknown[];
};

beforeAll(async () => {
  vi.stubEnv("VITE_PUBLIC_DEMO", "true");
  vi.stubEnv("VITE_CHAIN_ID", "31337");
  vi.resetModules();
  ({ TokenPage } = await import("../src/pages/TokenPage"));
  ({ publicDemoLaunch } = await import("../src/publicDemoSnapshot"));
});

afterAll(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("public demo reading order", () => {
  function renderToken(search = "") {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const path = `/token/${publicDemoLaunch.chainId}/${publicDemoLaunch.tokenAddress}${search}`;
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/token/:chainId/:address" element={<TokenPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("keeps recorded metrics, chart, read-only disclosure, and risk facts in visual DOM order", async () => {
    const { container } = renderToken();

    await screen.findByRole("heading", { name: "가격 흐름" });

    const chart = container.querySelector<HTMLElement>(".chart-card");
    const metrics =
      chart?.querySelector<HTMLElement>(":scope > .metric-strip") ?? null;
    const priceChart =
      chart?.querySelector<HTMLElement>(":scope > .price-chart") ?? null;
    const disclosure =
      container.querySelector<HTMLElement>(".public-demo-trade");
    const facts = container.querySelector<HTMLElement>(".facts-card");

    expect(chart).not.toBeNull();
    expect(metrics).not.toBeNull();
    expect(priceChart).not.toBeNull();
    expect(disclosure).not.toBeNull();
    expect(facts).not.toBeNull();
    if (!chart || !metrics || !priceChart || !disclosure || !facts) {
      throw new Error("PUBLIC_DEMO_LINEAR_ORDER_MISSING");
    }
    expect(
      metrics.compareDocumentPosition(priceChart) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      chart.compareDocumentPosition(disclosure) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      disclosure.compareDocumentPosition(facts) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("puts the read-only decision card first and collapses risk detail in wallet mode", async () => {
    const { container } = renderToken("?embed=wallet");

    await screen.findByRole("heading", { name: "가격 흐름" });

    const page = container.querySelector<HTMLElement>(".token-page");
    const disclosure =
      container.querySelector<HTMLElement>(".public-demo-trade");
    const chart = container.querySelector<HTMLElement>(".chart-card");
    const riskDisclosure = container.querySelector<HTMLDetailsElement>(
      '[data-testid="wallet-risk-disclosure"]',
    );

    expect(page).toHaveClass("token-page--wallet-embed");
    expect(disclosure).not.toBeNull();
    expect(chart).not.toBeNull();
    expect(riskDisclosure).not.toBeNull();
    if (!disclosure || !chart || !riskDisclosure) {
      throw new Error("WALLET_EMBED_DECISION_ORDER_MISSING");
    }
    expect(
      disclosure.compareDocumentPosition(chart) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(riskDisclosure).not.toHaveAttribute("open");
    expect(
      within(riskDisclosure).getByText(
        `위험 사실 ${publicDemoLaunch.riskFacts.length}개`,
      ),
    ).toBeInTheDocument();
    expect(within(disclosure).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("trade-connect")).not.toBeInTheDocument();
    expect(screen.queryByTestId("get-quote")).not.toBeInTheDocument();
    expect(screen.queryByTestId("execute-trade")).not.toBeInTheDocument();
  });
});
