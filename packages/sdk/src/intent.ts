import { z } from "zod";
import {
  encodeAbiParameters,
  getAddress,
  keccak256,
  type Address,
  type Hex,
} from "viem";

const hexAddress = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const hexData = z.string().regex(/^0x(?:[a-fA-F0-9]{2})*$/);
const unsignedDecimal = z.string().regex(/^(0|[1-9]\d*)$/);

export const transactionIntentSchema = z.object({
  chainId: z.number().int().positive(),
  account: hexAddress,
  kind: z.enum(["launch", "approve", "buy", "sell", "claim"]),
  target: hexAddress,
  token: hexAddress.optional(),
  amountIn: unsignedDecimal,
  minAmountOut: unsignedDecimal.optional(),
  calldata: hexData,
  value: unsignedDecimal,
  deadline: z.number().int().positive(),
  quoteCreatedAt: z.number().int().nonnegative(),
  quoteExpiresAt: z.number().int().positive(),
  fingerprint: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
});

export type TransactionIntent = z.infer<typeof transactionIntentSchema>;

export interface IntentTransactionRequest {
  account: Address;
  to: Address;
  data: Hex;
  value: bigint;
}

export class StaleIntentError extends Error {
  constructor(
    public readonly reason: "expired" | "account" | "chain" | "input",
  ) {
    super(`STALE_TRANSACTION_INTENT:${reason}`);
    this.name = "StaleIntentError";
  }
}

export function fingerprintTransactionRequest(
  chainId: number,
  request: IntentTransactionRequest,
): Hex {
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new Error("INVALID_INTENT_CHAIN_ID");
  }
  if (request.value < 0n) throw new Error("INVALID_INTENT_VALUE");

  return keccak256(
    encodeAbiParameters(
      [
        { name: "chainId", type: "uint256" },
        { name: "account", type: "address" },
        { name: "target", type: "address" },
        { name: "value", type: "uint256" },
        { name: "calldata", type: "bytes" },
      ],
      [
        BigInt(chainId),
        getAddress(request.account),
        getAddress(request.to),
        request.value,
        request.data,
      ],
    ),
  );
}

export function createTransactionIntent(input: {
  chainId: number;
  kind: TransactionIntent["kind"];
  request: IntentTransactionRequest;
  token?: Address;
  amountIn: bigint;
  minAmountOut?: bigint;
  deadline: number;
  quoteCreatedAt: number;
  quoteExpiresAt: number;
}): TransactionIntent {
  return transactionIntentSchema.parse({
    chainId: input.chainId,
    account: getAddress(input.request.account),
    kind: input.kind,
    target: getAddress(input.request.to),
    token: input.token ? getAddress(input.token) : undefined,
    amountIn: input.amountIn.toString(),
    minAmountOut: input.minAmountOut?.toString(),
    calldata: input.request.data,
    value: input.request.value.toString(),
    deadline: input.deadline,
    quoteCreatedAt: input.quoteCreatedAt,
    quoteExpiresAt: input.quoteExpiresAt,
    fingerprint: fingerprintTransactionRequest(input.chainId, input.request),
  });
}

export function assertIntentFresh(
  intent: TransactionIntent,
  current: {
    chainId: number;
    account: string;
    target: Address;
    calldata: Hex;
    value: bigint;
    now?: number;
  },
): void {
  const now = current.now ?? Date.now();
  if (now >= intent.quoteExpiresAt) throw new StaleIntentError("expired");
  if (current.chainId !== intent.chainId) throw new StaleIntentError("chain");
  if (current.account.toLowerCase() !== intent.account.toLowerCase()) {
    throw new StaleIntentError("account");
  }
  if (
    current.target.toLowerCase() !== intent.target.toLowerCase() ||
    current.calldata.toLowerCase() !== intent.calldata.toLowerCase() ||
    current.value.toString() !== intent.value
  ) {
    throw new StaleIntentError("input");
  }
  const fingerprint = fingerprintTransactionRequest(current.chainId, {
    account: getAddress(current.account),
    to: current.target,
    data: current.calldata,
    value: current.value,
  });
  if (fingerprint !== intent.fingerprint) throw new StaleIntentError("input");
}

export function isUserRejectedRequest(error: unknown): boolean {
  const visited = new Set<object>();

  function inspect(value: unknown, depth: number): boolean {
    if (depth > 8 || typeof value !== "object" || value === null) return false;
    if (visited.has(value)) return false;
    visited.add(value);

    const record = value as Record<string, unknown>;
    if (
      record.code === 4001 ||
      record.code === "4001" ||
      record.code === "ACTION_REJECTED"
    ) {
      return true;
    }

    return (
      inspect(record.cause, depth + 1) ||
      inspect(record.error, depth + 1) ||
      inspect(record.data, depth + 1)
    );
  }

  return inspect(error, 0);
}
