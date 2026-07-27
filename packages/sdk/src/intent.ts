import { z } from "zod";

const hexAddress = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const unsignedDecimal = z.string().regex(/^(0|[1-9]\d*)$/);

export const transactionIntentSchema = z.object({
  chainId: z.number().int().positive(),
  account: hexAddress,
  kind: z.enum(["launch", "approve", "buy", "sell", "claim"]),
  target: hexAddress,
  token: hexAddress.optional(),
  amountIn: unsignedDecimal,
  minAmountOut: unsignedDecimal.optional(),
  deadline: z.number().int().positive(),
  quoteCreatedAt: z.number().int().nonnegative(),
  quoteExpiresAt: z.number().int().positive(),
  fingerprint: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
});

export type TransactionIntent = z.infer<typeof transactionIntentSchema>;

export class StaleIntentError extends Error {
  constructor(
    public readonly reason: "expired" | "account" | "chain" | "input",
  ) {
    super(`STALE_TRANSACTION_INTENT:${reason}`);
    this.name = "StaleIntentError";
  }
}

export function assertIntentFresh(
  intent: TransactionIntent,
  current: {
    chainId: number;
    account: string;
    fingerprint: string;
    now?: number;
  },
): void {
  const now = current.now ?? Date.now();
  if (now >= intent.quoteExpiresAt) throw new StaleIntentError("expired");
  if (current.chainId !== intent.chainId) throw new StaleIntentError("chain");
  if (current.account.toLowerCase() !== intent.account.toLowerCase()) {
    throw new StaleIntentError("account");
  }
  if (current.fingerprint !== intent.fingerprint) {
    throw new StaleIntentError("input");
  }
}
