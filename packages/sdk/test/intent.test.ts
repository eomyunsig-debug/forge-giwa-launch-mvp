import { describe, expect, it } from "vitest";

import {
  assertIntentFresh,
  buildApprovalRequest,
  buildTradeRequest,
  createTransactionIntent,
  fingerprintTransactionRequest,
  isUserRejectedRequest,
  StaleIntentError,
  type TradeQuote,
  type TransactionIntent,
} from "../src/index.js";

const account = "0x1111111111111111111111111111111111111111";
const target = "0x2222222222222222222222222222222222222222";
const request = {
  account,
  to: target,
  data: "0x1234",
  value: 100n,
} as const;
const fingerprint = fingerprintTransactionRequest(31_337, request);

const intent: TransactionIntent = {
  chainId: 31_337,
  account,
  kind: "buy",
  target,
  token: target,
  amountIn: "100",
  minAmountOut: "90",
  calldata: request.data,
  value: request.value.toString(),
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
        target,
        calldata: request.data,
        value: request.value,
        now: 1_500,
      }),
    ).not.toThrow();
  });

  it.each([
    [
      "expired",
      {
        chainId: 31_337,
        account,
        target,
        calldata: request.data,
        value: request.value,
        now: 2_000,
      },
    ],
    [
      "chain",
      {
        chainId: 91_342,
        account,
        target,
        calldata: request.data,
        value: request.value,
        now: 1_500,
      },
    ],
    [
      "account",
      {
        chainId: 31_337,
        account: "0x3333333333333333333333333333333333333333",
        target,
        calldata: request.data,
        value: request.value,
        now: 1_500,
      },
    ],
    [
      "input",
      {
        chainId: 31_337,
        account,
        target,
        calldata: "0x5678",
        value: request.value,
        now: 1_500,
      },
    ],
    [
      "input",
      {
        chainId: 31_337,
        account,
        target: "0x4444444444444444444444444444444444444444",
        calldata: request.data,
        value: request.value,
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

  it("binds the target, calldata, value, and quote lifetime to one fingerprint", () => {
    const created = createTransactionIntent({
      chainId: 31_337,
      kind: "buy",
      request,
      token: target,
      amountIn: 100n,
      minAmountOut: 90n,
      deadline: 2_000,
      quoteCreatedAt: 1_000,
      quoteExpiresAt: 2_000,
    });

    expect(created.target).toBe(target);
    expect(created.calldata).toBe(request.data);
    expect(created.value).toBe("100");
    expect(created.fingerprint).toBe(fingerprint);
    expect(() =>
      assertIntentFresh(created, {
        chainId: 31_337,
        account,
        target,
        calldata: request.data,
        value: 101n,
        now: 1_500,
      }),
    ).toThrow("STALE_TRANSACTION_INTENT:input");
  });

  it("invalidates calldata when min-out or deadline changes", () => {
    const quote: TradeQuote = {
      chainId: 31_337,
      account,
      token: "0x3333333333333333333333333333333333333333",
      adapter: target,
      side: "buy" as const,
      amountIn: 100n,
      amountOut: 90n,
      minAmountOut: 80n,
      priceImpactBps: 100,
      slippageBps: 100,
      deadline: 2_000,
      createdAt: 1_000,
      expiresAt: 2_000,
      pool: "0x4444444444444444444444444444444444444444",
      feeBps: 30,
    };
    const originalRequest = buildTradeRequest(quote);
    const created = createTransactionIntent({
      chainId: quote.chainId,
      kind: quote.side,
      request: originalRequest,
      token: quote.token,
      amountIn: quote.amountIn,
      minAmountOut: quote.minAmountOut,
      deadline: quote.deadline,
      quoteCreatedAt: quote.createdAt,
      quoteExpiresAt: quote.expiresAt,
    });

    for (const changedRequest of [
      buildTradeRequest({ ...quote, minAmountOut: 79n }),
      buildTradeRequest({ ...quote, deadline: 2_001 }),
    ]) {
      expect(() =>
        assertIntentFresh(created, {
          chainId: quote.chainId,
          account,
          target: changedRequest.to,
          calldata: changedRequest.data,
          value: changedRequest.value,
          now: 1_500,
        }),
      ).toThrow("STALE_TRANSACTION_INTENT:input");
    }
  });

  it("classifies EIP-1193 rejection by structured code through wrapped causes", () => {
    const rejection = Object.assign(new Error("Rejected by wallet"), {
      code: 4001,
    });
    expect(isUserRejectedRequest(rejection)).toBe(true);
    expect(
      isUserRejectedRequest(new Error("wrapped", { cause: rejection })),
    ).toBe(true);
    expect(isUserRejectedRequest(new Error("취소"))).toBe(false);
  });

  it("builds an exact approval, never MaxUint by default", () => {
    const request = buildApprovalRequest(account, target, target, 123n);
    expect(request.value).toBe(0n);
    expect(request.data).not.toContain("f".repeat(64));
  });
});
