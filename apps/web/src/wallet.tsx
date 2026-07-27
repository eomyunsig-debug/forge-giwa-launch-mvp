import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getAddress, type Address, type Hash, type Hex } from "viem";

import { targetChain } from "./config";

export interface Eip1193Provider {
  request(args: {
    method: string;
    params?: readonly unknown[] | object;
  }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
}

interface Eip6963Info {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

interface Eip6963ProviderDetail {
  info: Eip6963Info;
  provider: Eip1193Provider;
}

declare global {
  interface WindowEventMap {
    "eip6963:announceProvider": CustomEvent<Eip6963ProviderDetail>;
  }

  interface Window {
    ethereum?: Eip1193Provider;
  }
}

export interface WalletConnector {
  id: string;
  name: string;
  icon?: string;
  provider: Eip1193Provider;
}

interface WalletContextValue {
  connectors: WalletConnector[];
  provider: Eip1193Provider | null;
  account: Address | null;
  chainId: number | null;
  connecting: boolean;
  error: string | null;
  connect: (connectorId?: string) => Promise<void>;
  disconnect: () => void;
  switchToTargetChain: () => Promise<void>;
  assertCurrentIntent: (
    expectedAccount: Address,
    expectedChainId: number,
  ) => Promise<void>;
  sendTransaction: (request: {
    account: Address;
    to: Address;
    data: Hex;
    value: bigint;
  }) => Promise<Hash>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

function parseChainId(value: unknown): number {
  if (typeof value !== "string" || !/^0x[a-fA-F0-9]+$/.test(value)) {
    throw new Error("WALLET_CHAIN_ID_INVALID");
  }
  return Number.parseInt(value.slice(2), 16);
}

function parseAccounts(value: unknown): Address[] {
  if (!Array.isArray(value)) throw new Error("WALLET_ACCOUNTS_INVALID");
  return value
    .filter(
      (account): account is string =>
        typeof account === "string" && /^0x[a-fA-F0-9]{40}$/.test(account),
    )
    .map((account) => getAddress(account));
}

function providerErrorMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 4001
  ) {
    return "지갑에서 요청을 취소했습니다.";
  }
  return error instanceof Error ? error.message : "지갑 요청에 실패했습니다.";
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [connectors, setConnectors] = useState<WalletConnector[]>([]);
  const [provider, setProvider] = useState<Eip1193Provider | null>(null);
  const [account, setAccount] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const known = new Map<string, WalletConnector>();
    const announce = (event: WindowEventMap["eip6963:announceProvider"]) => {
      const { info, provider: announcedProvider } = event.detail;
      known.set(info.uuid, {
        id: info.uuid,
        name: info.name,
        icon: info.icon,
        provider: announcedProvider,
      });
      setConnectors(Array.from(known.values()));
    };
    window.addEventListener("eip6963:announceProvider", announce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    if (window.ethereum) {
      known.set("injected", {
        id: "injected",
        name: "브라우저 지갑",
        provider: window.ethereum,
      });
      setConnectors(Array.from(known.values()));
    }
    return () =>
      window.removeEventListener("eip6963:announceProvider", announce);
  }, []);

  useEffect(() => {
    if (!provider?.on) return;
    const handleAccounts = (...args: unknown[]) => {
      const next = parseAccounts(args[0]);
      setAccount(next[0] ?? null);
    };
    const handleChain = (...args: unknown[]) => {
      setChainId(parseChainId(args[0]));
    };
    provider.on("accountsChanged", handleAccounts);
    provider.on("chainChanged", handleChain);
    return () => {
      provider.removeListener?.("accountsChanged", handleAccounts);
      provider.removeListener?.("chainChanged", handleChain);
    };
  }, [provider]);

  const connect = useCallback(
    async (connectorId?: string) => {
      const connector =
        connectors.find((candidate) => candidate.id === connectorId) ??
        connectors[0];
      if (!connector) {
        setError("호환되는 EVM 지갑을 찾지 못했습니다.");
        return;
      }
      setConnecting(true);
      setError(null);
      try {
        const [accountsValue, chainValue] = await Promise.all([
          connector.provider.request({ method: "eth_requestAccounts" }),
          connector.provider.request({ method: "eth_chainId" }),
        ]);
        const accounts = parseAccounts(accountsValue);
        if (!accounts[0]) throw new Error("WALLET_ACCOUNT_MISSING");
        setProvider(connector.provider);
        setAccount(accounts[0]);
        setChainId(parseChainId(chainValue));
      } catch (cause) {
        setError(providerErrorMessage(cause));
      } finally {
        setConnecting(false);
      }
    },
    [connectors],
  );

  const disconnect = useCallback(() => {
    setProvider(null);
    setAccount(null);
    setChainId(null);
    setError(null);
  }, []);

  const switchToTargetChain = useCallback(async () => {
    if (!provider) throw new Error("WALLET_DISCONNECTED");
    const chainHex = `0x${targetChain.id.toString(16)}`;
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: chainHex }],
      });
    } catch (cause) {
      const code =
        typeof cause === "object" && cause !== null && "code" in cause
          ? (cause as { code?: unknown }).code
          : null;
      if (code !== 4902) throw cause;
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: chainHex,
            chainName: targetChain.name,
            nativeCurrency: targetChain.nativeCurrency,
            rpcUrls: targetChain.rpcUrls.default.http,
            blockExplorerUrls: targetChain.blockExplorers
              ? [targetChain.blockExplorers.default.url]
              : [],
          },
        ],
      });
    }
    setChainId(targetChain.id);
  }, [provider]);

  const assertCurrentIntent = useCallback(
    async (expectedAccount: Address, expectedChainId: number) => {
      if (!provider) throw new Error("WALLET_DISCONNECTED");
      const [accountsValue, chainValue] = await Promise.all([
        provider.request({ method: "eth_accounts" }),
        provider.request({ method: "eth_chainId" }),
      ]);
      const accounts = parseAccounts(accountsValue);
      if (accounts[0]?.toLowerCase() !== expectedAccount.toLowerCase()) {
        throw new Error("WALLET_ACCOUNT_CHANGED");
      }
      if (parseChainId(chainValue) !== expectedChainId) {
        throw new Error("WALLET_CHAIN_CHANGED");
      }
    },
    [provider],
  );

  const sendTransaction = useCallback(
    async (request: {
      account: Address;
      to: Address;
      data: Hex;
      value: bigint;
    }) => {
      if (!provider) throw new Error("WALLET_DISCONNECTED");
      try {
        const [accountsValue, chainValue] = await Promise.all([
          provider.request({ method: "eth_accounts" }),
          provider.request({ method: "eth_chainId" }),
        ]);
        const accounts = parseAccounts(accountsValue);
        if (accounts[0]?.toLowerCase() !== request.account.toLowerCase()) {
          throw new Error("WALLET_ACCOUNT_CHANGED");
        }
        if (parseChainId(chainValue) !== targetChain.id) {
          throw new Error("WALLET_CHAIN_CHANGED");
        }
        const result = await provider.request({
          method: "eth_sendTransaction",
          params: [
            {
              from: request.account,
              to: request.to,
              data: request.data,
              value: `0x${request.value.toString(16)}`,
            },
          ],
        });
        if (typeof result !== "string" || !/^0x[a-fA-F0-9]{64}$/.test(result)) {
          throw new Error("WALLET_TRANSACTION_HASH_INVALID");
        }
        return result as Hash;
      } catch (cause) {
        const message = providerErrorMessage(cause);
        const wrapped = new Error(message);
        wrapped.cause = cause;
        throw wrapped;
      }
    },
    [provider],
  );

  const value = useMemo<WalletContextValue>(
    () => ({
      connectors,
      provider,
      account,
      chainId,
      connecting,
      error,
      connect,
      disconnect,
      switchToTargetChain,
      assertCurrentIntent,
      sendTransaction,
    }),
    [
      connectors,
      provider,
      account,
      chainId,
      connecting,
      error,
      connect,
      disconnect,
      switchToTargetChain,
      assertCurrentIntent,
      sendTransaction,
    ],
  );

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

export function useWallet(): WalletContextValue {
  const value = useContext(WalletContext);
  if (!value) throw new Error("WalletProvider is missing");
  return value;
}
