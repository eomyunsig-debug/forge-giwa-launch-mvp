import { describe, expect, it } from "vitest";

import { parseTargetChainId } from "../src/config";

describe("web chain allowlist", () => {
  it("accepts only local Anvil and the official GIWA Sepolia chain", () => {
    expect(parseTargetChainId(undefined)).toBe(31_337);
    expect(parseTargetChainId("31337")).toBe(31_337);
    expect(parseTargetChainId("91342")).toBe(91_342);
  });

  it.each(["", "1", "31338", "91342.0", "not-a-chain"])(
    "fails closed for unsupported chain input %s",
    (value) => {
      expect(() => parseTargetChainId(value)).toThrow("CHAIN_ID_UNSUPPORTED");
    },
  );
});
