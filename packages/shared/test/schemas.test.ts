import { describe, expect, it } from "vitest";

import { createLaunchInputSchema } from "../src/index.js";

const validInput = {
  name: "Forge Friends",
  symbol: "FORGE",
  description: "Community test token",
  imageUrl: "http://127.0.0.1:8787/uploads/image.png",
  metadataUri: "http://127.0.0.1:8787/uploads/metadata.json",
  metadataHash: `0x${"ab".repeat(32)}`,
  creatorAllocationBps: 500,
  nativeLiquidityWei: "1000000000000000000",
};

describe("create launch input", () => {
  it("accepts a content-addressed metadata commitment", () => {
    expect(createLaunchInputSchema.parse(validInput).metadataHash).toBe(
      validInput.metadataHash,
    );
  });

  it("rejects an empty bytes32 commitment", () => {
    expect(() =>
      createLaunchInputSchema.parse({
        ...validInput,
        metadataHash: `0x${"0".repeat(64)}`,
      }),
    ).toThrow();
  });
});
