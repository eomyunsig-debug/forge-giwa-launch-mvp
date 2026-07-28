import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchCreator: vi.fn(),
  fetchPortfolio: vi.fn(),
  wallet: {
    account: "0x1111111111111111111111111111111111111111",
    connect: vi.fn(),
    assertCurrentIntent: vi.fn(),
    sendTransaction: vi.fn(),
  },
}));

vi.mock("../src/api", () => ({
  fetchCreator: mocks.fetchCreator,
  fetchPortfolio: mocks.fetchPortfolio,
}));

vi.mock("../src/wallet", () => ({
  useWallet: () => mocks.wallet,
}));

import { RuntimeErrorBoundary } from "../src/App";
import { CreatorPage, PortfolioPage, RiskPage } from "../src/pages/OtherPages";

const meta = {
  chainId: 31_337,
  source: "onchain-indexer" as const,
  indexedBlock: "100",
  indexedBlockHash: `0x${"ab".repeat(32)}`,
  updatedAt: "2026-07-28T00:00:00.000Z",
  status: "synced" as const,
  error: null,
};

function renderRoute(path: string, route: string, children: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={route} element={children} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mocks.fetchCreator.mockReset();
  mocks.fetchPortfolio.mockReset();
  mocks.wallet.connect.mockReset();
  mocks.wallet.assertCurrentIntent.mockReset();
  mocks.wallet.sendTransaction.mockReset();
  mocks.wallet.account = "0x1111111111111111111111111111111111111111";
});

describe("runtime recovery", () => {
  it("replaces a crashed lazy/runtime subtree with a clear recovery screen", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    function BrokenPage(): never {
      throw new Error("DYNAMIC_IMPORT_FAILED");
    }

    render(
      <RuntimeErrorBoundary>
        <BrokenPage />
      </RuntimeErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "페이지를 안전하게 불러오지 못했습니다",
    );
    expect(
      screen.getByRole("button", { name: "페이지 다시 불러오기" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "런치 피드로 이동" }),
    ).toHaveAttribute("href", "/");
  });
});

describe("indexer failures are not empty data", () => {
  it("shows a creator loading failure instead of a not-found state", async () => {
    mocks.fetchCreator.mockRejectedValue(new Error("INDEXER_HTTP_503"));

    renderRoute(
      "/creator/0x1111111111111111111111111111111111111111",
      "/creator/:address",
      <CreatorPage />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "창작자 데이터를 불러오지 못했습니다",
    );
    expect(
      screen.queryByText("창작자 데이터를 찾지 못했습니다"),
    ).not.toBeInTheDocument();
  });

  it("shows a portfolio loading failure instead of zero holdings", async () => {
    mocks.fetchPortfolio.mockRejectedValue(new Error("INDEXER_HTTP_503"));

    renderRoute("/portfolio", "/portfolio", <PortfolioPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "포트폴리오 데이터를 불러오지 못했습니다",
    );
    expect(
      screen.queryByText("인덱싱된 보유 토큰이 없습니다"),
    ).not.toBeInTheDocument();
  });
});

describe("unsupported verification disclosure", () => {
  it("does not promote a social verification badge without a complete verifier", async () => {
    mocks.fetchCreator.mockResolvedValue({
      data: {
        address: mocks.wallet.account,
        socialOwnershipVerified: true,
        socialProofStatus: "verified",
        launches: [],
        launchesWithLiquidity: 0,
      },
      meta,
    });

    renderRoute(
      `/creator/${mocks.wallet.account}`,
      "/creator/:address",
      <CreatorPage />,
    );

    expect(
      await screen.findByText("소셜 검증 지원되지 않음"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Social Ownership Verified"),
    ).not.toBeInTheDocument();
  });

  it("labels source and social verification as unsupported on the risk page", () => {
    render(
      <MemoryRouter>
        <RiskPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByText("컨트랙트 소스 검증 — 지원되지 않음"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("소셜 소유권 검증 — 지원되지 않음"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/nonce·도메인/)).not.toBeInTheDocument();
  });
});

describe("share metadata", () => {
  it("describes the prototype honestly with its reviewed social card", () => {
    const localIndex = resolve(process.cwd(), "index.html");
    const html = readFileSync(
      existsSync(localIndex)
        ? localIndex
        : resolve(process.cwd(), "apps/web/index.html"),
      "utf8",
    );

    expect(html).toContain('property="og:title"');
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
    expect(html).toContain("GIWA 공식 서비스가 아닙니다");
    expect(html).toContain(
      "https://forge-giwa-launch-eomyunsig.eomyunsig.chatgpt.site/og.jpg",
    );
  });
});
