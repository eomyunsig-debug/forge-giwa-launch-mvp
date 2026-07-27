import { describe, expect, it } from "vitest";

import {
  assertIntentFresh,
  buildApprovalRequest,
  StaleIntentError,
  type TransactionIntent,
} from "../src/index.js";

const account = "0x1111111111111111111111111111111111111111";
const target = "0x2222222222222222222222222222222222222222";
const fingerprint = `0x${"ab".repeat(32)}`;

const intent: TransactionIntent = {
  chainId: 31_337,
  account,
  kind: "buy",
  target,
  token: target,
  amountIn: "100",
  minAmountOut: "90",
  deadline: 2_000,
  quoteCreatedAt: 1_000,
  quoteExpiresAt: 2_000,
  fingerprint,
};

describe("transaction intent guards", () => {
  it("accepts an unchanged unexpired intent", () => {
    expect(() =>
      assertIntentFresh(intent, {
        chainId: 31_337,
        account,
        fingerprint,
        now: 1_500,
      }),
    ).not.toThrow();
  });

  it.each([
    ["expired", { chainId: 31_337, account, fingerprint, now: 2_000 }],
    ["chain", { chainId: 91_342, account, fingerprint, now: 1_500 }],
    [
      "account",
      {
        chainId: 31_337,
        account: "0x3333333333333333333333333333333333333333",
        fingerprint,
        now: 1_500,
      },
    ],
    [
      "input",
      {
        chainId: 31_337,
        account,
        fingerprint: `0x${"cd".repeat(32)}`,
        now: 1_500,
      },
    ],
  ] as const)("invalidates %s changes", (reason, current) => {
    expect(() => assertIntentFresh(intent, current)).toThrow(StaleIntentError);
    try {
      assertIntentFresh(intent, current);
    } catch (error) {
      expect((error as StaleIntentError).reason).toBe(reason);
    }
  });

  it("builds an exact approval, never MaxUint by default", () => {
    const request = buildApprovalRequest(account, target, target, 123n);
    expect(request.value).toBe(0n);
    expect(request.data).not.toContain("f".repeat(64));
  });
});
