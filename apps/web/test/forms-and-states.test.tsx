import { describe, expect, it } from "vitest";

import { draftSchema, statusLabel } from "../src/pages/CreatePage";
import {
  beginTradeSubmission,
  formatTradeUnitPrice,
  hasSufficientGas,
  isQuoteExpired,
  isTradeSubmissionLocked,
  latestTradePrice,
  parsePendingTransaction,
  pendingTransactionStorageKey,
  quoteSecondsRemaining,
  shouldConfirmIndexedTrade,
  statusAfterExecutionError,
  statusCopy,
  type TradeStatus,
} from "../src/pages/TokenPage";
import type { Trade } from "@forge/shared";

describe("create form validation", () => {
  const valid = {
    name: "Forge Friends",
    symbol: "FORGE",
    description: "테스트넷 커뮤니티 토큰",
    socialUrl: "",
    creatorAllocationBps: 500,
    nativeLiquidity: "1",
  };

  it("accepts the bounded default allocation", () => {
    expect(draftSchema.safeParse(valid).success).toBe(true);
  });

  it.each(["forge", "1FORGE", "FO-RGE", "F"])(
    "rejects an invalid symbol: %s",
    (symbol) => {
      expect(draftSchema.safeParse({ ...valid, symbol }).success).toBe(false);
    },
  );

  it("rejects creator allocation above 10%", () => {
    expect(
      draftSchema.safeParse({
        ...valid,
        creatorAllocationBps: 1_001,
      }).success,
    ).toBe(false);
  });

  it("rejects non-HTTPS social links", () => {
    expect(
      draftSchema.safeParse({
        ...valid,
        socialUrl: "javascript:alert(1)",
      }).success,
    ).toBe(false);
  });
});

describe("transaction states use precise language", () => {
  it.each<[TradeStatus, string]>([
    ["rejected", "지갑에서 취소됨"],
    ["reverted", "컨트랙트 실행 실패"],
    ["confirmed", "거래 영수증 확인됨"],
    ["quote-expired", "견적이 만료되었습니다. 다시 조회하세요."],
    ["slippage-exceeded", "최소 수령량 조건을 충족하지 못했습니다."],
    ["insufficient-balance", "입력 자산 잔액이 부족합니다."],
    ["insufficient-gas", "네트워크 수수료용 잔액이 부족합니다."],
    ["reconciling", "영수증 확인됨 · 인덱서 반영 대기"],
  ])("maps %s without optimistic success", (status, copy) => {
    expect(statusCopy(status)).toBe(copy);
  });

  it("keeps submitted separate from confirmed", () => {
    expect(statusCopy("submitted")).not.toBe(statusCopy("confirmed"));
    expect(statusLabel("reconciling")).toContain("인덱서");
  });

  it("uses the insufficient-gas state for sell approval or trade cost", () => {
    expect(hasSufficientGas(1n, 2n)).toBe(false);
    expect(hasSufficientGas(2n, 2n)).toBe(true);
    expect(hasSufficientGas(0n, null)).toBe(true);
  });

  it("locks repeat submission through receipt confirmation and reconciliation", () => {
    expect(isTradeSubmissionLocked("submitted")).toBe(true);
    expect(isTradeSubmissionLocked("confirming")).toBe(true);
    expect(isTradeSubmissionLocked("reconciling")).toBe(true);
    expect(isTradeSubmissionLocked("quoted")).toBe(false);
    expect(isTradeSubmissionLocked("confirmed")).toBe(false);
  });

  it("uses an immediate lock to reject a rapid second submission", () => {
    const lock = { current: false };
    expect(beginTradeSubmission(lock, "quoted")).toBe(true);
    expect(beginTradeSubmission(lock, "quoted")).toBe(false);
  });

  it("keeps a broadcast transaction locked when receipt lookup is unknown", () => {
    const hash = `0x${"ab".repeat(32)}` as const;
    expect(statusAfterExecutionError(hash)).toBe("confirming");
    expect(isTradeSubmissionLocked("confirming")).toBe(true);
    expect(statusAfterExecutionError(null)).toBe("reverted");
    expect(
      parsePendingTransaction(JSON.stringify({ hash, kind: "trade" })),
    ).toEqual({ hash, kind: "trade" });
    expect(parsePendingTransaction('{"hash":"bad","kind":"trade"}')).toBeNull();
    expect(
      pendingTransactionStorageKey(31_337, "0xABCDEF", "0x123456"),
    ).toContain("31337:0xabcdef:0x123456");
  });

  it("recovers a receipt-unknown trade from its indexed hash only", () => {
    const hash = `0x${"ab".repeat(32)}` as const;
    expect(
      shouldConfirmIndexedTrade("confirming", true, "trade", hash, [hash]),
    ).toBe(true);
    expect(
      shouldConfirmIndexedTrade("confirming", true, "approval", hash, [hash]),
    ).toBe(false);
    expect(
      shouldConfirmIndexedTrade("confirming", false, "trade", hash, [hash]),
    ).toBe(false);
  });

  it("shows the quote lifetime from the same expiry enforced onchain", () => {
    expect(quoteSecondsRemaining({ expiresAt: 31_000 }, 1_000)).toBe(30);
    expect(quoteSecondsRemaining({ expiresAt: 31_000 }, 30_001)).toBe(1);
    expect(quoteSecondsRemaining({ expiresAt: 31_000 }, 31_000)).toBe(0);
    expect(isQuoteExpired({ expiresAt: 31_000 }, 30_999)).toBe(false);
    expect(isQuoteExpired({ expiresAt: 31_000 }, 31_000)).toBe(true);
  });

  it("formats the latest indexed fill price without Number coercion", () => {
    const trade = (blockNumber: string, nativeAmount: string): Trade => ({
      chainId: 31_337,
      tokenAddress: "0x1111111111111111111111111111111111111111",
      poolAddress: "0x2222222222222222222222222222222222222222",
      transactionHash: `0x${blockNumber.padStart(64, "0")}`,
      logIndex: 0,
      traderAddress: "0x3333333333333333333333333333333333333333",
      side: "buy",
      nativeAmount,
      tokenAmount: "1000000000000",
      blockNumber,
      blockTimestamp: new Date(Number(blockNumber) * 1_000).toISOString(),
    });

    expect(formatTradeUnitPrice("1810", "1000000000000")).toBe("1.81e-9");
    expect(formatTradeUnitPrice("9999999", "10000000000000")).toBe("1e-6");
    expect(formatTradeUnitPrice("9999999", "1")).toBe("1e7");
    expect(latestTradePrice([trade("2", "1810"), trade("1", "559")])).toBe(
      "1.81e-9",
    );
  });
});
