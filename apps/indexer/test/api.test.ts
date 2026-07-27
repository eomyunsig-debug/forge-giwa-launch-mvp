import { afterEach, describe, expect, it } from "vitest";

import { createApi } from "../src/api.js";
import { IndexerDatabase } from "../src/database.js";
import { IndexerService } from "../src/indexer.js";
import { ApiRepository } from "../src/queries.js";
import {
  ALICE,
  block,
  CHAIN_ID,
  CREATOR,
  hash,
  launchBlock,
  POOL,
  TOKEN,
  transferEvent,
} from "./fixtures.js";

const databases: IndexerDatabase[] = [];

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close();
});

function setup(limit = 100) {
  const database = new IndexerDatabase(":memory:", {
    source: "local-fixture",
    now: () => new Date("2026-01-02T12:00:00.000Z"),
  });
  databases.push(database);
  const indexer = new IndexerService(database, undefined, {
    clock: () => new Date("2026-01-02T12:00:00.000Z"),
  });
  indexer.ingestBlock(
    launchBlock({
      extraEvents: [
        {
          type: "CreatorSocialVerified",
          creatorAddress: CREATOR,
          platform: "website",
          handle: "creator.example",
          proofUrl: "https://creator.example/forge-proof.txt",
          proofHash: hash(55),
          expiresAt: "2027-01-01T00:00:00.000Z",
        },
      ],
    }),
  );
  indexer.ingestBlock(
    block(
      2,
      [
        transferEvent(POOL, ALICE, "100"),
        {
          type: "TradeExecuted",
          tokenAddress: TOKEN,
          poolAddress: POOL,
          traderAddress: ALICE,
          side: "buy",
          nativeAmount: "5000000000000000",
          tokenAmount: "100",
        },
      ],
      { parentHash: hash(1001) },
    ),
  );
  const app = createApi({
    database,
    indexer,
    repository: new ApiRepository(
      database,
      indexer,
      () => new Date("2026-01-02T12:00:00.000Z"),
    ),
    rateLimit: {
      limit,
      windowMs: 60_000,
      clock: () => 1_000,
    },
    defaultChainId: CHAIN_ID,
  });
  return { app, database, indexer };
}

describe("indexer HTTP API", () => {
  it("serves health and source-aware launch envelopes", async () => {
    const { app } = setup();
    const healthResponse = await app.request("/health");
    const health = (await healthResponse.json()) as {
      status: string;
      chains: { indexedBlock: string }[];
    };
    expect(healthResponse.status).toBe(200);
    expect(healthResponse.headers.get("x-content-type-options")).toBe(
      "nosniff",
    );
    expect(health).toMatchObject({
      status: "ok",
      chains: [{ indexedBlock: "2" }],
    });

    const response = await app.request(
      `/api/launches?chainId=${CHAIN_ID.toString()}&sort=new`,
    );
    const payload = (await response.json()) as {
      data: { items: { tokenAddress: string }[]; nextCursor: null };
      meta: {
        source: string;
        indexedBlock: string;
        indexedBlockHash: string;
        updatedAt: string;
      };
    };
    expect(response.status).toBe(200);
    expect(payload.data.items).toHaveLength(1);
    expect(payload.data.items[0]?.tokenAddress).toBe(TOKEN);
    expect(payload.meta).toMatchObject({
      source: "local-fixture",
      indexedBlock: "2",
      indexedBlockHash: hash(1002),
    });
    expect(payload.meta.updatedAt).toBeTruthy();
  });

  it("returns detail, creator and portfolio projections without fake valuation", async () => {
    const { app } = setup();
    const detailResponse = await app.request(
      `/api/tokens/${CHAIN_ID.toString()}/${TOKEN}`,
    );
    const detail = (await detailResponse.json()) as {
      data: {
        tokenAddress: string;
        recentTrades: number;
        trades: { side: string; nativeAmount: string }[];
        admin: { proxyUpgradeable: boolean; mutableParameters: string[] };
        riskFacts: { key: string }[];
      };
      meta: { status: string };
    };
    expect(detail.data).toMatchObject({
      tokenAddress: TOKEN,
      recentTrades: 1,
      admin: {
        proxyUpgradeable: false,
        mutableParameters: ["creationFee"],
      },
    });
    expect(detail.data.trades[0]).toMatchObject({
      side: "buy",
      nativeAmount: "5000000000000000",
    });
    expect(detail.data.riskFacts.map((fact) => fact.key)).toContain(
      "additional-mint",
    );
    expect(detail.meta.status).toBe("synced");

    const creatorResponse = await app.request(
      `/api/creators/${CHAIN_ID.toString()}/${CREATOR}`,
    );
    const creator = (await creatorResponse.json()) as {
      data: {
        socialOwnershipVerified: boolean;
        socialProofs: { meaning: string }[];
      };
    };
    expect(creator.data.socialOwnershipVerified).toBe(true);
    expect(creator.data.socialProofs[0]?.meaning).toContain(
      "신원 또는 프로젝트 신뢰성을 보증하지 않습니다",
    );

    const portfolioResponse = await app.request(
      `/api/portfolio/${CHAIN_ID.toString()}/${ALICE}`,
    );
    const portfolio = (await portfolioResponse.json()) as {
      data: {
        holdings: {
          balance: string;
          averagePurchasePriceNative: null;
          currentValueNative: null;
          valuationStatus: string;
        }[];
      };
    };
    expect(portfolio.data.holdings[0]).toMatchObject({
      balance: "100",
      averagePurchasePriceNative: null,
      currentValueNative: null,
      valuationStatus: "unsupported",
    });
  });

  it("returns explicit 404 and validation errors", async () => {
    const { app } = setup();
    const missing = await app.request(
      `/api/tokens/${CHAIN_ID.toString()}/0x${"9".repeat(40)}`,
    );
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({
      error: { code: "NOT_FOUND" },
      meta: { indexedBlock: "2" },
    });

    const invalid = await app.request("/api/launches?chainId=not-a-chain");
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({
      error: { code: "INVALID_REQUEST" },
    });
  });

  it("rate limits API calls without blocking health checks", async () => {
    const { app } = setup(2);
    const path = `/api/launches?chainId=${CHAIN_ID.toString()}`;
    expect((await app.request(path)).status).toBe(200);
    expect((await app.request(path)).status).toBe(200);
    const limited = await app.request(path);
    expect(limited.status).toBe(429);
    expect(await limited.json()).toMatchObject({
      error: { code: "RATE_LIMITED" },
    });
    expect((await app.request("/health")).status).toBe(200);
  });

  it("serves the web v1 contract and records reports without fake chain fields", async () => {
    const { app, database } = setup();
    const listResponse = await app.request(
      "/api/v1/launches?search=COMM&sort=buyers&limit=50",
    );
    const list = (await listResponse.json()) as {
      data: { tokenAddress: string; metadataHash: string }[];
    };
    expect(listResponse.status).toBe(200);
    expect(list.data).toHaveLength(1);
    expect(list.data[0]).toMatchObject({
      tokenAddress: TOKEN,
      metadataHash: hash(44),
    });

    expect(
      (await app.request(`/api/v1/launches/${CHAIN_ID.toString()}/${TOKEN}`))
        .status,
    ).toBe(200);
    const creator = await app.request(`/api/v1/creators/${CREATOR}`);
    expect(await creator.json()).toMatchObject({
      data: {
        address: CREATOR,
        socialOwnershipVerified: true,
        socialProofStatus: "verified",
      },
    });
    const portfolio = await app.request(
      `/api/v1/portfolio/${CHAIN_ID.toString()}/${ALICE}`,
    );
    expect(await portfolio.json()).toMatchObject({
      data: {
        address: ALICE,
        holdings: [{ launch: { tokenAddress: TOKEN }, balance: "100" }],
      },
    });

    const report = await app.request("/api/v1/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chainId: CHAIN_ID,
        tokenAddress: TOKEN,
        reason: "악성 링크가 의심되어 검토를 요청합니다.",
      }),
    });
    expect(report.status).toBe(201);
    expect(
      database.db
        .prepare(
          `SELECT chain_id, token_address, source, reason
           FROM reports`,
        )
        .get(),
    ).toEqual({
      chain_id: CHAIN_ID,
      token_address: TOKEN,
      source: "api-user-report",
      reason: "악성 링크가 의심되어 검토를 요청합니다.",
    });
  });
});
