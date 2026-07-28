import {
  dataMetaSchema,
  launchDetailSchema,
  launchSummarySchema,
} from "@forge/shared";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
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
      "로컬 Anvil에서 생성·거래·인덱싱 복원을 검증하는 테스트 자산입니다.",
    );
    expect(publicDemoLaunch.imageUrl).toBeNull();
    expect(publicDemoProvenance.originalImageUrl).toContain("127.0.0.1");
    expect(publicDemoProvenance.transformations).toHaveLength(3);
    expect(publicDemoLaunch).toMatchObject({
      symbol: "FE2E",
      recentTrades: 13,
      uniqueHolders: 12,
      circulatingSupply: "183379810391264582308502447",
      topTenOrdinaryHolderBps: 8_610,
    });
    expect(publicDemoLaunch.trades).toHaveLength(13);
    expect(
      publicDemoLaunch.holders.filter(
        (holder) => holder.category === "ordinary",
      ),
    ).toHaveLength(12);
    const rootRecordPath = resolve(
      process.cwd(),
      "apps/web/src/publicDemoRecord.json",
    );
    expect(
      createHash("sha256")
        .update(
          readFileSync(
            existsSync(rootRecordPath)
              ? rootRecordPath
              : resolve(process.cwd(), "src/publicDemoRecord.json"),
          ),
        )
        .digest("hex"),
    ).toBe(publicDemoProvenance.canonicalResponseSha256);
  });

  it("never represents the recorded snapshot as a GIWA deployment", () => {
    expect(publicDemoLaunch.chainId).toBe(31_337);
    expect(publicDemoMeta.error).toContain("실시간 체인 연결이 아닙니다");
    expect(
      publicDemoLaunch.riskFacts.find((fact) => fact.key === "contract-source"),
    ).toBeUndefined();
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
      ).toMatchObject({ status: "recorded-confirmed" });
    }
  });
});
