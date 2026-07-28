import { brandConfig } from "@forge/shared";
import { giwaSepoliaOfficialReference } from "@forge/chain-config";
import { defineChain, getAddress, type Address, type Chain } from "viem";

import type { ContractDeployment } from "@forge/sdk";

function readAddress(value: string | undefined): Address | null {
  if (!value || !/^0x[a-fA-F0-9]{40}$/.test(value)) return null;
  return getAddress(value);
}

export type SupportedChainId = 31_337 | 91_342;

export function parseTargetChainId(
  value: string | undefined,
): SupportedChainId {
  const raw = value ?? "31337";
  if (!/^(?:31337|91342)$/u.test(raw)) {
    throw new Error("CHAIN_ID_UNSUPPORTED");
  }
  return Number(raw) as SupportedChainId;
}

const chainId = parseTargetChainId(import.meta.env.VITE_CHAIN_ID);
const isGiwaNetwork = chainId === giwaSepoliaOfficialReference.chainId;
const rpcUrl = isGiwaNetwork
  ? import.meta.env.VITE_GIWA_RPC_URL
  : (import.meta.env.VITE_LOCAL_RPC_URL ?? "http://127.0.0.1:8545");
const explorerUrl = isGiwaNetwork
  ? import.meta.env.VITE_GIWA_EXPLORER_URL
  : undefined;
if (!rpcUrl) {
  throw new Error("CHAIN_RPC_URL_MISSING");
}
if (
  isGiwaNetwork &&
  (rpcUrl !== giwaSepoliaOfficialReference.rpcUrl ||
    explorerUrl !== giwaSepoliaOfficialReference.explorerUrl)
) {
  throw new Error("GIWA_OFFICIAL_ENDPOINT_ALLOWLIST_MISMATCH");
}

export const appBrand = {
  ...brandConfig,
  appName: import.meta.env.VITE_APP_NAME ?? brandConfig.appName,
  tagline: import.meta.env.VITE_APP_TAGLINE ?? brandConfig.tagline,
};

export const isPublicDemo = import.meta.env.VITE_PUBLIC_DEMO === "true";

export const indexerUrl =
  import.meta.env.VITE_INDEXER_URL ?? "http://127.0.0.1:8787";

export const targetChain: Chain = defineChain({
  id: chainId,
  name:
    import.meta.env.VITE_CHAIN_NAME ??
    (isGiwaNetwork ? "GIWA Sepolia" : "Anvil (Forge local fixture)"),
  nativeCurrency: {
    name: isGiwaNetwork ? "Ether" : "Test Ether",
    symbol: isGiwaNetwork ? "ETH" : "tETH",
    decimals: 18,
  },
  rpcUrls: {
    default: { http: [rpcUrl] },
  },
  ...(explorerUrl
    ? {
        blockExplorers: {
          default: { name: "Explorer", url: explorerUrl },
        },
      }
    : {}),
  testnet: true,
});

const factory = readAddress(import.meta.env.VITE_FACTORY_ADDRESS);
const protocolConfig = readAddress(
  import.meta.env.VITE_PROTOCOL_CONFIG_ADDRESS,
);
const adapter = readAddress(import.meta.env.VITE_LOCAL_AMM_ADAPTER_ADDRESS);

export const deployment: ContractDeployment | null =
  factory && protocolConfig && adapter
    ? {
        chainId,
        factory,
        protocolConfig,
        adapter,
        deployedBlock: 0n,
        adapterKind: chainId === 31_337 ? "local-test-only" : "giwa-disabled",
      }
    : null;

export const isLocalFixture = chainId === 31_337;
export const isGiwaSepolia = isGiwaNetwork;
