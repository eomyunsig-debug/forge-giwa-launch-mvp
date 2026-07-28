import {
  encodeFunctionData,
  getAddress,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";

import { createLaunchInputSchema, type CreateLaunchInput } from "@forge/shared";

import {
  ammAdapterAbi,
  erc20Abi,
  launchFactoryAbi,
  protocolConfigAbi,
} from "./abis.js";

const BPS = 10_000n;
export const DEFAULT_TRADE_QUOTE_TTL_MS = 30_000;

export interface ContractDeployment {
  chainId: number;
  factory: Address;
  protocolConfig: Address;
  adapter: Address;
  deployedBlock: bigint;
  adapterKind: "local-test-only" | "giwa-disabled" | "giwa-reviewed";
}

export interface TransactionRequest {
  account: Address;
  to: Address;
  data: Hex;
  value: bigint;
}

export interface TradeQuote {
  chainId: number;
  account: Address;
  token: Address;
  adapter: Address;
  side: "buy" | "sell";
  amountIn: bigint;
  amountOut: bigint;
  minAmountOut: bigint;
  priceImpactBps: number | null;
  slippageBps: number;
  deadline: number;
  createdAt: number;
  expiresAt: number;
  pool: Address;
  feeBps: number | null;
}

export async function buildLaunchRequest(
  client: PublicClient,
  deployment: ContractDeployment,
  account: Address,
  input: CreateLaunchInput,
  options: { now?: number; deadlineSeconds?: number } = {},
): Promise<TransactionRequest> {
  const parsed = createLaunchInputSchema.parse(input);
  if (deployment.adapterKind === "giwa-disabled") {
    throw new Error("GIWA_AMM_INTEGRATION_DISABLED");
  }
  const [creationFee, minimumLiquidity, adapterEnabled, configured] =
    await Promise.all([
      client.readContract({
        address: deployment.protocolConfig,
        abi: protocolConfigAbi,
        functionName: "creationFee",
      }),
      client.readContract({
        address: deployment.protocolConfig,
        abi: protocolConfigAbi,
        functionName: "minimumInitialLiquidity",
      }),
      client.readContract({
        address: deployment.protocolConfig,
        abi: protocolConfigAbi,
        functionName: "adapterEnabled",
        args: [deployment.adapter],
      }),
      client.readContract({
        address: deployment.adapter,
        abi: ammAdapterAbi,
        functionName: "isConfigured",
      }),
    ]);

  const nativeLiquidity = BigInt(parsed.nativeLiquidityWei);
  if (nativeLiquidity < minimumLiquidity) {
    throw new Error("INITIAL_LIQUIDITY_BELOW_PROTOCOL_MINIMUM");
  }
  if (!adapterEnabled || !configured) {
    throw new Error("AMM_ADAPTER_DISABLED");
  }

  const now = options.now ?? Math.floor(Date.now() / 1000);
  const deadline = now + (options.deadlineSeconds ?? 600);

  return {
    account: getAddress(account),
    to: deployment.factory,
    value: creationFee + nativeLiquidity,
    data: encodeFunctionData({
      abi: launchFactoryAbi,
      functionName: "launch",
      args: [
        {
          name: parsed.name,
          symbol: parsed.symbol,
          metadataURI: parsed.metadataUri,
          metadataHash: parsed.metadataHash as Hex,
          creatorAllocationBps: parsed.creatorAllocationBps,
          initialNativeLiquidity: nativeLiquidity,
          minLiquidityTokens: 1n,
          deadline: BigInt(deadline),
          adapter: deployment.adapter,
        },
      ],
    }),
  };
}

export async function fetchTradeQuote(
  client: PublicClient,
  deployment: ContractDeployment,
  account: Address,
  token: Address,
  side: "buy" | "sell",
  amountIn: bigint,
  options: {
    slippageBps: number;
    ttlMs?: number;
    deadlineSeconds?: number;
    nowMs?: number;
  },
): Promise<TradeQuote> {
  if (deployment.adapterKind === "giwa-disabled") {
    throw new Error("GIWA_AMM_INTEGRATION_DISABLED");
  }
  if (amountIn <= 0n) throw new Error("INVALID_TRADE_AMOUNT");
  if (
    !Number.isInteger(options.slippageBps) ||
    options.slippageBps < 1 ||
    options.slippageBps > 2_000
  ) {
    throw new Error("INVALID_SLIPPAGE_BPS");
  }

  const [amountOut, state] = await Promise.all([
    client.readContract({
      address: deployment.adapter,
      abi: ammAdapterAbi,
      functionName: "quoteExactInput",
      args: [token, side === "buy", amountIn],
    }),
    client.readContract({
      address: deployment.adapter,
      abi: ammAdapterAbi,
      functionName: "getPoolState",
      args: [token],
    }),
  ]);
  if (!state.initialized || amountOut <= 0n)
    throw new Error("QUOTE_UNAVAILABLE");

  const slippage = BigInt(options.slippageBps);
  const minAmountOut = (amountOut * (BPS - slippage)) / BPS;
  const spotOut =
    side === "buy"
      ? (amountIn * state.tokenReserve) / state.nativeReserve
      : (amountIn * state.nativeReserve) / state.tokenReserve;
  const impact =
    spotOut > amountOut && spotOut > 0n
      ? Number(((spotOut - amountOut) * BPS) / spotOut)
      : 0;
  const nowMs = options.nowMs ?? Date.now();
  const ttlMs = options.ttlMs ?? DEFAULT_TRADE_QUOTE_TTL_MS;
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 1_000) {
    throw new Error("INVALID_QUOTE_TTL");
  }
  if (
    options.deadlineSeconds != null &&
    (!Number.isSafeInteger(options.deadlineSeconds) ||
      options.deadlineSeconds <= 0)
  ) {
    throw new Error("INVALID_TRADE_DEADLINE");
  }

  const ttlDeadlineMs = nowMs + ttlMs;
  const requestedDeadlineMs =
    options.deadlineSeconds == null
      ? ttlDeadlineMs
      : nowMs + options.deadlineSeconds * 1_000;
  const deadline = Math.floor(
    Math.min(ttlDeadlineMs, requestedDeadlineMs) / 1_000,
  );
  const expiresAt = deadline * 1_000;
  if (expiresAt <= nowMs) throw new Error("INVALID_QUOTE_TTL");

  return {
    chainId: deployment.chainId,
    account: getAddress(account),
    token: getAddress(token),
    adapter: deployment.adapter,
    side,
    amountIn,
    amountOut,
    minAmountOut,
    priceImpactBps: impact,
    slippageBps: options.slippageBps,
    deadline,
    createdAt: nowMs,
    expiresAt,
    pool: state.pool,
    feeBps: deployment.adapterKind === "local-test-only" ? 30 : null,
  };
}

export function buildApprovalRequest(
  account: Address,
  token: Address,
  spender: Address,
  exactAmount: bigint,
): TransactionRequest {
  if (exactAmount <= 0n) throw new Error("INVALID_APPROVAL_AMOUNT");
  return {
    account: getAddress(account),
    to: getAddress(token),
    value: 0n,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [getAddress(spender), exactAmount],
    }),
  };
}

export function buildTradeRequest(quote: TradeQuote): TransactionRequest {
  const common = {
    account: quote.account,
    to: quote.adapter,
  };
  return quote.side === "buy"
    ? {
        ...common,
        value: quote.amountIn,
        data: encodeFunctionData({
          abi: ammAdapterAbi,
          functionName: "buy",
          args: [
            quote.token,
            quote.minAmountOut,
            BigInt(quote.deadline),
            quote.account,
          ],
        }),
      }
    : {
        ...common,
        value: 0n,
        data: encodeFunctionData({
          abi: ammAdapterAbi,
          functionName: "sell",
          args: [
            quote.token,
            quote.amountIn,
            quote.minAmountOut,
            BigInt(quote.deadline),
            quote.account,
          ],
        }),
      };
}
