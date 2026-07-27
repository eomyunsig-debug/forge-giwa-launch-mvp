import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { WalletProvider, useWallet, type Eip1193Provider } from "../src/wallet";

class MockProvider implements Eip1193Provider {
  accounts = ["0x1111111111111111111111111111111111111111"];
  chainId = "0x1";
  rejectTransaction = false;
  calls: string[] = [];
  listeners = new Map<string, ((...args: unknown[]) => void)[]>();

  request(args: {
    method: string;
    params?: readonly unknown[] | object;
  }): Promise<unknown> {
    this.calls.push(args.method);
    if (args.method === "eth_requestAccounts" || args.method === "eth_accounts")
      return Promise.resolve(this.accounts);
    if (args.method === "eth_chainId") return Promise.resolve(this.chainId);
    if (args.method === "wallet_switchEthereumChain") {
      this.chainId = "0x7a69";
      return Promise.resolve(null);
    }
    if (args.method === "eth_sendTransaction") {
      if (this.rejectTransaction) {
        const error = new Error("rejected") as Error & { code: number };
        error.code = 4001;
        return Promise.reject(error);
      }
      return Promise.resolve(`0x${"ab".repeat(32)}`);
    }
    return Promise.resolve(null);
  }

  on(event: string, listener: (...args: unknown[]) => void) {
    const current = this.listeners.get(event) ?? [];
    current.push(listener);
    this.listeners.set(event, current);
  }

  removeListener(event: string, listener: (...args: unknown[]) => void) {
    this.listeners.set(
      event,
      (this.listeners.get(event) ?? []).filter(
        (candidate) => candidate !== listener,
      ),
    );
  }

  emit(event: string, value: unknown) {
    this.listeners.get(event)?.forEach((listener) => listener(value));
  }
}

function Probe() {
  const wallet = useWallet();
  const [message, setMessage] = useState("");
  return (
    <>
      <output data-testid="account">{wallet.account ?? "disconnected"}</output>
      <output data-testid="chain">{wallet.chainId ?? "none"}</output>
      <button onClick={() => void wallet.connect()}>connect</button>
      <button onClick={() => void wallet.switchToTargetChain()}>switch</button>
      <button
        onClick={async () => {
          try {
            if (!wallet.account) return;
            await wallet.sendTransaction({
              account: wallet.account,
              to: "0x2222222222222222222222222222222222222222",
              data: "0x",
              value: 1n,
            });
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "error");
          }
        }}
      >
        send
      </button>
      <output data-testid="message">{message}</output>
    </>
  );
}

function renderWallet(provider: MockProvider) {
  Object.defineProperty(window, "ethereum", {
    configurable: true,
    value: provider,
  });
  return render(
    <WalletProvider>
      <Probe />
    </WalletProvider>,
  );
}

describe("wallet boundary", () => {
  it("starts disconnected and never requests a signature on load", () => {
    const provider = new MockProvider();
    renderWallet(provider);
    expect(screen.getByTestId("account")).toHaveTextContent("disconnected");
    expect(provider.calls).toEqual([]);
  });

  it("connects only after explicit action and exposes wrong network", async () => {
    const provider = new MockProvider();
    renderWallet(provider);
    await userEvent.click(screen.getByRole("button", { name: "connect" }));
    expect(screen.getByTestId("account")).toHaveTextContent("0x1111");
    expect(screen.getByTestId("chain")).toHaveTextContent("1");
    expect(provider.calls).toContain("eth_requestAccounts");
  });

  it("switches to the configured local chain explicitly", async () => {
    const provider = new MockProvider();
    renderWallet(provider);
    await userEvent.click(screen.getByRole("button", { name: "connect" }));
    await userEvent.click(screen.getByRole("button", { name: "switch" }));
    expect(provider.calls).toContain("wallet_switchEthereumChain");
    expect(screen.getByTestId("chain")).toHaveTextContent("31337");
  });

  it("invalidates the displayed account when the wallet changes it", async () => {
    const provider = new MockProvider();
    renderWallet(provider);
    await userEvent.click(screen.getByRole("button", { name: "connect" }));
    provider.emit("accountsChanged", [
      "0x3333333333333333333333333333333333333333",
    ]);
    expect(await screen.findByTestId("account")).toHaveTextContent("0x3333");
  });

  it("renders a wallet rejection as cancellation", async () => {
    const provider = new MockProvider();
    provider.rejectTransaction = true;
    renderWallet(provider);
    await userEvent.click(screen.getByRole("button", { name: "connect" }));
    await userEvent.click(screen.getByRole("button", { name: "switch" }));
    await userEvent.click(screen.getByRole("button", { name: "send" }));
    expect(await screen.findByTestId("message")).toHaveTextContent(
      "지갑에서 요청을 취소했습니다.",
    );
  });

  it("aborts when the account changes immediately before signing", async () => {
    const provider = new MockProvider();
    renderWallet(provider);
    await userEvent.click(screen.getByRole("button", { name: "connect" }));
    await userEvent.click(screen.getByRole("button", { name: "switch" }));
    provider.accounts = ["0x3333333333333333333333333333333333333333"];

    await userEvent.click(screen.getByRole("button", { name: "send" }));

    expect(await screen.findByTestId("message")).toHaveTextContent(
      "WALLET_ACCOUNT_CHANGED",
    );
    expect(
      provider.calls.filter((call) => call === "eth_sendTransaction"),
    ).toHaveLength(0);
  });

  it("aborts when the chain changes immediately before signing", async () => {
    const provider = new MockProvider();
    renderWallet(provider);
    await userEvent.click(screen.getByRole("button", { name: "connect" }));
    await userEvent.click(screen.getByRole("button", { name: "switch" }));
    provider.chainId = "0x1";

    await userEvent.click(screen.getByRole("button", { name: "send" }));

    expect(await screen.findByTestId("message")).toHaveTextContent(
      "WALLET_CHAIN_CHANGED",
    );
    expect(
      provider.calls.filter((call) => call === "eth_sendTransaction"),
    ).toHaveLength(0);
  });
});
