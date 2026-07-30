import { brandConfig } from "@forge/shared";
import { giwaSepoliaOfficialReference } from "@forge/chain-config";
import {
  defineChain,
  getAddress,
  isAddressEqual,
  zeroAddress,
  type Address,
  type Chain,
} from "viem";

import type { ContractDeployment } from "@forge/sdk";

function readAddress(value: string | undefined): Address | null {
  if (!value || !/^0x[a-fA-F0-9]{40}$/.test(value)) return null;
  return getAddress(value);
}

function readRequiredGiwaAddress(
  label: string,
  value: string | undefined,
): Address {
  if (!value || !/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new Error(`GIWA_SELF_HOSTED_${label}_ADDRESS_INVALID`);
  }
  const address = getAddress(value);
  if (isAddressEqual(address, zeroAddress)) {
    throw new Error(`GIWA_SELF_HOSTED_${label}_ADDRESS_INVALID`);
  }
  return address;
}

function readRequiredGiwaDeployedBlock(value: string | undefined): bigint {
  if (!value || !/^[1-9][0-9]*$/u.test(value)) {
    throw new Error("GIWA_SELF_HOSTED_DEPLOYED_BLOCK_INVALID");
  }
  return BigInt(value);
}

export type SupportedChainId = 31_337 | 91_342;
export type GiwaDeploymentMode = "disabled" | "giwa-self-hosted-test-only";

export interface WebDeploymentEnvironment {
  publicDemo?: boolean;
  giwaDeploymentMode?: string | undefined;
  localFactoryAddress?: string | undefined;
  localProtocolConfigAddress?: string | undefined;
  localAdapterAddress?: string | undefined;
  giwaFactoryAddress?: string | undefined;
  giwaProtocolConfigAddress?: string | undefined;
  giwaSelfHostedAdapterAddress?: string | undefined;
  giwaDeployedBlock?: string | undefined;
}

export function parseTargetChainId(
  value: string | undefined,
): SupportedChainId {
  const raw = value ?? "31337";
  if (!/^(?:31337|91342)$/u.test(raw)) {
    throw new Error("CHAIN_ID_UNSUPPORTED");
  }
  return Number(raw) as SupportedChainId;
}

export function resolveContractDeployment(
  targetChainId: SupportedChainId,
  environment: WebDeploymentEnvironment,
): ContractDeployment | null {
  if (environment.publicDemo) return null;

  if (targetChainId === 31_337) {
    const factory = readAddress(environment.localFactoryAddress);
    const protocolConfig = readAddress(environment.localProtocolConfigAddress);
    const adapter = readAddress(environment.localAdapterAddress);
    return factory && protocolConfig && adapter
      ? {
          chainId: targetChainId,
          factory,
          protocolConfig,
          adapter,
          deployedBlock: 0n,
          adapterKind: "local-test-only",
        }
      : null;
  }

  const mode = environment.giwaDeploymentMode ?? "disabled";
  if (mode === "disabled") return null;
  if (mode !== "giwa-self-hosted-test-only") {
    throw new Error("GIWA_DEPLOYMENT_MODE_UNSUPPORTED");
  }

  const factory = readRequiredGiwaAddress(
    "FACTORY",
    environment.giwaFactoryAddress,
  );
  const protocolConfig = readRequiredGiwaAddress(
    "PROTOCOL_CONFIG",
    environment.giwaProtocolConfigAddress,
  );
  const adapter = readRequiredGiwaAddress(
    "ADAPTER",
    environment.giwaSelfHostedAdapterAddress,
  );
  if (
    isAddressEqual(factory, protocolConfig) ||
    isAddressEqual(factory, adapter) ||
    isAddressEqual(protocolConfig, adapter)
  ) {
    throw new Error("GIWA_SELF_HOSTED_DEPLOYMENT_ADDRESSES_NOT_DISTINCT");
  }

  return {
    chainId: targetChainId,
    factory,
    protocolConfig,
    adapter,
    deployedBlock: readRequiredGiwaDeployedBlock(environment.giwaDeployedBlock),
    adapterKind: "giwa-self-hosted-test-only",
  };
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

export const deployment = resolveContractDeployment(chainId, {
  publicDemo: isPublicDemo,
  giwaDeploymentMode: import.meta.env.VITE_GIWA_DEPLOYMENT_MODE,
  localFactoryAddress: import.meta.env.VITE_FACTORY_ADDRESS,
  localProtocolConfigAddress: import.meta.env.VITE_PROTOCOL_CONFIG_ADDRESS,
  localAdapterAddress: import.meta.env.VITE_LOCAL_AMM_ADAPTER_ADDRESS,
  giwaFactoryAddress: import.meta.env.VITE_GIWA_FACTORY_ADDRESS,
  giwaProtocolConfigAddress: import.meta.env.VITE_GIWA_PROTOCOL_CONFIG_ADDRESS,
  giwaSelfHostedAdapterAddress: import.meta.env
    .VITE_GIWA_SELF_HOSTED_AMM_ADAPTER_ADDRESS,
  giwaDeployedBlock: import.meta.env.VITE_GIWA_DEPLOYED_BLOCK,
});

export const isLocalFixture = chainId === 31_337;
export const isGiwaSepolia = isGiwaNetwork;
