import {
  dataMetaSchema,
  launchDetailSchema,
  launchSummarySchema,
} from "@forge/shared";
import { describe, expect, it } from "vitest";

import {
  publicDemoLaunch,
  publicDemoLaunches,
  publicDemoMeta,
  publicDemoProvenance,
} from "../src/publicDemoSnapshot";

describe("public demo snapshot", () => {
  it("preserves a schema-valid local Anvil execution record", () => {
    expect(() => dataMetaSchema.parse(publicDemoMeta)).not.toThrow();
    expect(() => launchDetailSchema.parse(publicDemoLaunch)).not.toThrow();
    expect(() =>
      launchSummarySchema.array().parse(publicDemoLaunches),
    ).not.toThrow();
    expect(publicDemoMeta).toMatchObject({
      chainId: 31_337,
      source: "onchain-indexer",
      indexedBlock: "18",
      status: "lagging",
    });
    expect(publicDemoLaunch.description).toBe(
      "서울 랜드마크 밈 토큰. 아무것도 보장하지 않습니다.",
    );
    expect(publicDemoLaunch.imageUrl).toBeNull();
    expect(publicDemoProvenance.originalImageUrl).toContain("127.0.0.1");
    expect(publicDemoProvenance.transformations).toHaveLength(3);
    expect(publicDemoLaunch).toMatchObject({
      circulatingSupply: "174471524104302413245727742",
      topTenOrdinaryHolderBps: 10_000,
    });
  });

  it("never represents the recorded snapshot as a GIWA deployment", () => {
    expect(publicDemoLaunch.chainId).toBe(31_337);
    expect(publicDemoMeta.error).toContain("실시간 체인 연결이 아닙니다");
    expect(
      publicDemoLaunch.riskFacts.find((fact) => fact.key === "contract-source"),
    ).toMatchObject({
      status: "collecting",
      value: null,
    });
    for (const key of [
      "additional-mint",
      "pause",
      "blacklist",
      "transfer-tax",
      "proxy-upgrade",
      "liquidity-lock",
    ]) {
      expect(
        publicDemoLaunch.riskFacts.find((fact) => fact.key === key),
      ).toMatchObject({ status: "collecting" });
    }
  });
});
