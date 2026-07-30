import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/wallet", () => ({
  useWallet: () => ({
    account: null,
    chainId: null,
    connecting: false,
    error: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    switchToTargetChain: vi.fn(),
  }),
}));

import { AppShell } from "../src/components";
import { isWalletEmbedSearch, withWalletEmbed } from "../src/embed";

describe("wallet embed query boundary", () => {
  it("accepts only one exact embed=wallet value", () => {
    expect(isWalletEmbedSearch("?embed=wallet")).toBe(true);
    expect(isWalletEmbedSearch("?view=compact&embed=wallet")).toBe(true);
    expect(isWalletEmbedSearch("?embed=WALLET")).toBe(false);
    expect(isWalletEmbedSearch("?embed=wallet&embed=other")).toBe(false);
    expect(isWalletEmbedSearch("?embed=wallet-preview")).toBe(false);
  });

  it("preserves internal query and hash values while carrying wallet mode", () => {
    expect(withWalletEmbed("/about/risk?tab=facts#liquidity", true)).toBe(
      "/about/risk?tab=facts&embed=wallet#liquidity",
    );
    expect(withWalletEmbed("/about/risk", false)).toBe("/about/risk");
  });
});

describe("wallet embed shell", () => {
  it("removes duplicate site navigation and header wallet controls", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/?embed=wallet"]}>
        <AppShell>
          <p>임베드 본문</p>
        </AppShell>
      </MemoryRouter>,
    );

    expect(container.querySelector(".app-shell")).toHaveAttribute(
      "data-embed",
      "wallet",
    );
    expect(screen.getByRole("status", { name: /지갑 내 보기/ })).toBeVisible();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByTestId("connect-wallet")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Forge 홈" })).toHaveAttribute(
      "href",
      "/?embed=wallet",
    );
    expect(screen.getByText("임베드 본문")).toBeInTheDocument();
  });
});
