import { defineChain, type Chain } from "viem";
import { z } from "zod";

const httpUrl = z
  .url()
  .refine(
    (value) => value.startsWith("https://") || value.startsWith("http://"),
  );
const secureUrl = z.url().refine((value) => value.startsWith("https://"));
const address = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const optionalPlaceholder = <Schema extends z.ZodType>(schema: Schema) =>
  z.preprocess(
    (value) => (value === "" ? undefined : value),
    schema.optional(),
  );

const remoteConfigSchema = z.object({
  GIWA_TESTNET_ENABLED: z.literal("true"),
  GIWA_TESTNET_CHAIN_ID: z.coerce.number().int().positive(),
  GIWA_TESTNET_RPC_URL: httpUrl,
  GIWA_TESTNET_WS_URL: optionalPlaceholder(
    z
      .url()
      .refine(
        (value) => value.startsWith("wss://") || value.startsWith("ws://"),
      ),
  ),
  GIWA_TESTNET_EXPLORER_URL: secureUrl,
  GIWA_TESTNET_NATIVE_NAME: z.string().min(1).max(40),
  GIWA_TESTNET_NATIVE_SYMBOL: z.string().min(1).max(12),
  GIWA_TESTNET_NATIVE_DECIMALS: z.coerce.number().int().min(0).max(36),
  GIWA_TESTNET_FINALITY_TAG: z.enum(["safe", "finalized"]),
  GIWA_TESTNET_BRIDGE_URL: optionalPlaceholder(secureUrl),
  GIWA_TESTNET_FAUCET_URL: optionalPlaceholder(secureUrl),
  GIWA_TESTNET_AMM_FACTORY: optionalPlaceholder(address),
  GIWA_TESTNET_AMM_ROUTER: optionalPlaceholder(address),
  GIWA_TESTNET_WRAPPED_NATIVE: optionalPlaceholder(address),
});

export interface ForgeChainConfig {
  chain: Chain;
  rpcUrl: string;
  webSocketUrl?: string;
  confirmations: number;
  finalityTag: "latest" | "safe" | "finalized";
  explorerUrl: string;
  bridgeUrl?: string;
  faucetUrl?: string;
  amm?: {
    factory: `0x${string}`;
    router: `0x${string}`;
    wrappedNative: `0x${string}`;
  };
  environment: "local" | "giwa-testnet";
}

export const giwaSepoliaOfficialReference = {
  checkedAt: "2026-07-28",
  chainId: 91_342,
  rpcUrl: "https://sepolia-rpc.giwa.io",
  flashblocksRpcUrl: "https://sepolia-rpc-flashblocks.giwa.io",
  explorerUrl: "https://sepolia-explorer.giwa.io",
  bridgeUrl: "https://sepolia-bridge.giwa.io/",
  faucetUrl: "https://faucet.giwa.io/",
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18,
  },
} as const;

export const localAnvilConfig: ForgeChainConfig = {
  chain: defineChain({
    id: 31_337,
    name: "Anvil (Forge local fixture)",
    nativeCurrency: {
      name: "Test Ether",
      symbol: "tETH",
      decimals: 18,
    },
    rpcUrls: {
      default: { http: ["http://127.0.0.1:8545"] },
    },
    testnet: true,
  }),
  rpcUrl: "http://127.0.0.1:8545",
  confirmations: 1,
  finalityTag: "latest",
  explorerUrl: "",
  environment: "local",
};

export function loadGiwaTestnetConfig(
  input: Record<string, string | undefined>,
): ForgeChainConfig {
  const parsed = remoteConfigSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(
      `GIWA_TESTNET_CONFIG_INVALID: ${z.prettifyError(parsed.error)}`,
    );
  }

  const config = parsed.data;
  const ammValues = [
    config.GIWA_TESTNET_AMM_FACTORY,
    config.GIWA_TESTNET_AMM_ROUTER,
    config.GIWA_TESTNET_WRAPPED_NATIVE,
  ];
  const configuredAmmCount = ammValues.filter(Boolean).length;
  if (configuredAmmCount !== 0 && configuredAmmCount !== 3) {
    throw new Error(
      "GIWA_AMM_CONFIG_INCOMPLETE: factory, router, wrapped native must be configured together",
    );
  }

  return {
    chain: defineChain({
      id: config.GIWA_TESTNET_CHAIN_ID,
      name: "GIWA Testnet",
      nativeCurrency: {
        name: config.GIWA_TESTNET_NATIVE_NAME,
        symbol: config.GIWA_TESTNET_NATIVE_SYMBOL,
        decimals: config.GIWA_TESTNET_NATIVE_DECIMALS,
      },
      rpcUrls: {
        default: {
          http: [config.GIWA_TESTNET_RPC_URL],
          ...(config.GIWA_TESTNET_WS_URL
            ? { webSocket: [config.GIWA_TESTNET_WS_URL] }
            : {}),
        },
      },
      blockExplorers: {
        default: {
          name: "GIWA Explorer",
          url: config.GIWA_TESTNET_EXPLORER_URL,
        },
      },
      testnet: true,
    }),
    rpcUrl: config.GIWA_TESTNET_RPC_URL,
    ...(config.GIWA_TESTNET_WS_URL
      ? { webSocketUrl: config.GIWA_TESTNET_WS_URL }
      : {}),
    confirmations: 1,
    finalityTag: config.GIWA_TESTNET_FINALITY_TAG,
    explorerUrl: config.GIWA_TESTNET_EXPLORER_URL,
    ...(config.GIWA_TESTNET_BRIDGE_URL
      ? { bridgeUrl: config.GIWA_TESTNET_BRIDGE_URL }
      : {}),
    ...(config.GIWA_TESTNET_FAUCET_URL
      ? { faucetUrl: config.GIWA_TESTNET_FAUCET_URL }
      : {}),
    ...(configuredAmmCount === 3
      ? {
          amm: {
            factory: config.GIWA_TESTNET_AMM_FACTORY as `0x${string}`,
            router: config.GIWA_TESTNET_AMM_ROUTER as `0x${string}`,
            wrappedNative: config.GIWA_TESTNET_WRAPPED_NATIVE as `0x${string}`,
          },
        }
      : {}),
    environment: "giwa-testnet",
  };
}

export function explorerLink(
  config: ForgeChainConfig,
  kind: "address" | "tx" | "block",
  value: string,
): string | null {
  if (!config.explorerUrl) return null;
  if (!/^[a-zA-Z0-9x]+$/.test(value)) {
    throw new Error("EXPLORER_VALUE_INVALID");
  }
  return new URL(`${kind}/${value}`, `${config.explorerUrl}/`).toString();
}
