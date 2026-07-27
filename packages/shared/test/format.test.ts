import { describe, expect, it } from "vitest";

import { formatBps, formatUnits, shortenAddress } from "../src/index.js";

describe("safe formatters", () => {
  it("keeps missing metrics distinct from zero", () => {
    expect(formatUnits(null)).toBe("—");
    expect(formatUnits(0n)).toBe("0");
    expect(formatBps(null)).toBe("—");
    expect(formatBps(0)).toBe("0%");
  });

  it("formats without converting the source bigint to Number", () => {
    expect(formatUnits(1_234_567_890_123_456_789n)).toBe("1.2345");
  });

  it("shortens only present addresses", () => {
    expect(shortenAddress(null)).toBe("—");
    expect(shortenAddress("0x1111111111111111111111111111111111111111")).toBe(
      "0x1111…1111",
    );
  });
});
