import { describe, expect, it } from "vitest";

import { draftSchema, statusLabel } from "../src/pages/CreatePage";
import { statusCopy, type TradeStatus } from "../src/pages/TokenPage";

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
});
