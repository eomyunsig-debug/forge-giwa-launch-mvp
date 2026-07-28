import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { IndexerDatabase } from "../src/database.js";
import { IndexerService } from "../src/indexer.js";
import { ApiRepository } from "../src/queries.js";
import { RpcSynchronizer } from "../src/rpc.js";
import {
  DEAD_ADDRESS,
  serializeDecodedEvent,
  ZERO_ADDRESS,
} from "../src/types.js";
import {
  address,
  ALICE,
  block,
  BOB,
  CHAIN_ID,
  CREATOR,
  FACTORY,
  hash,
  launchBlock,
  launchEvent,
  LOCKER,
  POOL,
  TOKEN,
  transferEvent,
  VAULT,
} from "./fixtures.js";

const databases: IndexerDatabase[] = [];
const directories: string[] = [];

afterEach(async () => {
  while (databases.length > 0) databases.pop()?.close();
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

function setup() {
  const database = new IndexerDatabase(":memory:", {
    source: "local-fixture",
    now: () => new Date("2026-01-02T12:00:00.000Z"),
  });
  databases.push(database);
  const indexer = new IndexerService(database, undefined, {
    clock: () => new Date("2026-01-02T12:00:00.000Z"),
  });
  const repository = new ApiRepository(
    database,
    indexer,
    () => new Date("2026-01-02T12:00:00.000Z"),
  );
  return { database, indexer, repository };
}

describe("event-sourced indexer", () => {
  it("does not seed a source-verification fact without a producer", () => {
    const { indexer, repository } = setup();
    indexer.ingestBlock(launchBlock());

    const beforeEvidence = repository.getLaunchDetail(CHAIN_ID, TOKEN) as {
      riskFacts: { key: string; status: string }[];
    };
    expect(
      beforeEvidence.riskFacts.some((fact) => fact.key === "contract-source"),
    ).toBe(false);

    indexer.ingestBlock(
      block(
        2,
        [
          {
            type: "ContractSourceStatus",
            contractAddress: TOKEN,
            verified: true,
            explorerUrl: "https://explorer.example/address/token",
          },
        ],
        { parentHash: hash(1001) },
      ),
    );

    const afterEvidence = repository.getLaunchDetail(CHAIN_ID, TOKEN) as {
      riskFacts: { key: string; status: string }[];
    };
    expect(
      afterEvidence.riskFacts.find((fact) => fact.key === "contract-source"),
    ).toMatchObject({ status: "confirmed" });
  });

  it("deduplicates the exact raw log identity", () => {
    const { database, indexer } = setup();
    const first = indexer.ingestBlock(launchBlock());
    const second = indexer.ingestBlock(launchBlock());

    expect(first.insertedLogs).toBe(4);
    expect(second.insertedLogs).toBe(0);
    expect(second.duplicateLogs).toBe(4);
    const counts = database.db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM raw_logs) AS raw,
           (SELECT COUNT(*) FROM transfers) AS transfers,
           (SELECT COUNT(*) FROM launches) AS launches`,
      )
      .get() as { raw: number; transfers: number; launches: number };
    expect(counts).toEqual({ raw: 4, transfers: 3, launches: 1 });
  });

  it("replays reversed logs in canonical transaction and log order", () => {
    const { database, indexer } = setup();
    indexer.ingestBlock({
      ...launchBlock(),
      logs: [...launchBlock().logs].reverse(),
    });

    const balances = database.db
      .prepare(
        `SELECT holder_address, balance, category
         FROM holder_balances
         WHERE token_address = ?
         ORDER BY holder_address`,
      )
      .all(TOKEN) as {
      holder_address: string;
      balance: string;
      category: string;
    }[];
    expect(balances).toEqual([
      { holder_address: FACTORY, balance: "0", category: "ordinary" },
      { holder_address: VAULT, balance: "100", category: "vesting" },
      { holder_address: POOL, balance: "900", category: "pool" },
    ]);
  });

  it("projects an initial AMM reserve update emitted before LaunchCreated", () => {
    const { indexer, repository } = setup();
    const original = launchBlock();
    const launchLog = original.logs.find(
      (log) => log.decoded?.type === "LaunchCreated",
    );
    if (!launchLog) throw new Error("Expected the launch log fixture");

    indexer.ingestBlock({
      ...original,
      logs: [
        ...original.logs.filter((log) => log.decoded?.type !== "LaunchCreated"),
        {
          ...launchLog,
          logIndex: launchLog.logIndex,
          transactionHash: hash(990),
          decoded: {
            type: "LiquidityUpdated",
            tokenAddress: TOKEN,
            poolAddress: POOL,
            nativeReserve: "777",
            tokenReserve: "888",
          },
        },
        {
          ...launchLog,
          logIndex: launchLog.logIndex + 1,
        },
      ],
    });

    expect(repository.getLaunchDetail(CHAIN_ID, TOKEN)).toMatchObject({
      actualLiquidityNative: "777",
    });
  });

  it("accepts independent blocks out of arrival order and checkpoints the head", () => {
    const { indexer, repository } = setup();
    indexer.ingestBlock(
      block(
        2,
        [
          {
            type: "CreatorSocialVerified",
            creatorAddress: CREATOR,
            platform: "x",
            handle: "@creator",
            proofUrl: "https://x.com/creator/status/1",
            proofHash: hash(88),
            expiresAt: "2027-01-01T00:00:00.000Z",
          },
        ],
        { parentHash: hash(1001) },
      ),
    );
    indexer.ingestBlock(launchBlock());

    expect(indexer.getCheckpoint(CHAIN_ID).blockNumber).toBe("2");
    const creator = repository.getCreator(CHAIN_ID, CREATOR) as {
      launchCount: number;
      socialOwnershipVerified: boolean;
    };
    expect(creator).toMatchObject({
      launchCount: 1,
      socialOwnershipVerified: true,
    });
  });

  it("restores checkpoint and projections after process restart", async () => {
    const directory = await mkdtemp(join(tmpdir(), "forge-indexer-"));
    directories.push(directory);
    const path = join(directory, "indexer.sqlite");
    const firstDatabase = new IndexerDatabase(path, {
      source: "local-fixture",
    });
    const firstIndexer = new IndexerService(firstDatabase);
    firstIndexer.ingestBlock(launchBlock());
    firstDatabase.close();

    const restartedDatabase = new IndexerDatabase(path, {
      source: "local-fixture",
    });
    databases.push(restartedDatabase);
    const restartedIndexer = new IndexerService(restartedDatabase);
    const repository = new ApiRepository(restartedDatabase, restartedIndexer);

    expect(restartedIndexer.getCheckpoint(CHAIN_ID)).toMatchObject({
      blockNumber: "1",
      blockHash: hash(1001),
      status: "synced",
    });
    expect(repository.listLaunches(CHAIN_ID).items).toHaveLength(1);
  });

  it("does not expose zero-claim vesting schedules as claimable", () => {
    const { database, indexer } = setup();
    indexer.ingestBlock(launchBlock());
    const beforeCliff = new ApiRepository(
      database,
      indexer,
      () => new Date("2026-01-01T12:00:00.000Z"),
    );

    const portfolio = beforeCliff.getPortfolio(CHAIN_ID, CREATOR) as {
      claimableCreatorVestings: unknown[];
    };
    expect(portfolio.claimableCreatorVestings).toEqual([]);
  });

  it("hydrates transiently missing committed metadata and persists it in replay", () => {
    const { indexer, repository } = setup();
    const original = launchBlock();
    indexer.ingestBlock({
      ...original,
      logs: original.logs.map((log) =>
        log.decoded?.type === "LaunchCreated"
          ? {
              ...log,
              decoded: {
                ...log.decoded,
                imageUrl: null,
                description: null,
              },
            }
          : log,
      ),
    });

    const [pending] = indexer.getPendingLaunchMetadata(CHAIN_ID);
    expect(pending).toBeDefined();
    if (!pending) throw new Error("Expected a pending metadata record");
    expect(
      indexer.hydrateLaunchMetadata(pending, {
        imageUrl: "https://metadata.example/restored.png",
        description: "재시도 후 해시가 일치한 메타데이터",
      }),
    ).toBe(true);

    indexer.rebuild(CHAIN_ID);
    expect(repository.getLaunchDetail(CHAIN_ID, TOKEN)).toMatchObject({
      imageUrl: "https://metadata.example/restored.png",
      description: "재시도 후 해시가 일치한 메타데이터",
    });
    expect(indexer.getPendingLaunchMetadata(CHAIN_ID)).toEqual([]);
  });

  it("persists metadata backoff without starving later launches", () => {
    const { database, indexer } = setup();
    database.ensureChain(CHAIN_ID);
    const insert = database.db.prepare(
      `INSERT INTO raw_logs
         (chain_id, block_number, block_hash, transaction_hash,
          transaction_index, log_index, contract_address, topics_json, data,
          block_timestamp, decoded_event_json, ingested_at)
       VALUES (?, ?, ?, ?, 0, 0, ?, '[]', '0x', ?, ?, ?)`,
    );
    for (let launchIndex = 1; launchIndex <= 6; launchIndex += 1) {
      const timestamp = new Date(
        Date.UTC(2026, 0, 2, 0, 0, launchIndex),
      ).toISOString();
      insert.run(
        CHAIN_ID,
        launchIndex,
        hash(4_000 + launchIndex),
        hash(5_000 + launchIndex),
        FACTORY,
        timestamp,
        serializeDecodedEvent(
          launchEvent({
            tokenAddress: address(100 + launchIndex),
            poolAddress: address(200 + launchIndex),
            vestingVaultAddress: address(300 + launchIndex),
            lockerAddress: address(400 + launchIndex),
            lpTokenAddress: address(500 + launchIndex),
            metadataHash: hash(6_000 + launchIndex),
            metadataUri: `https://metadata.example/${launchIndex.toString()}.json`,
            imageUrl: null,
            description: null,
          }),
        ),
        timestamp,
      );
    }

    const firstBatch = indexer.getPendingLaunchMetadata(
      CHAIN_ID,
      5,
      new Date("2026-01-02T12:00:00.000Z"),
    );
    expect(firstBatch).toHaveLength(5);
    for (const pending of firstBatch) {
      expect(
        indexer.deferLaunchMetadata(
          pending,
          new Date("2026-01-02T12:01:00.000Z"),
        ),
      ).toBe(true);
    }

    const restarted = new IndexerService(database, undefined, {
      clock: () => new Date("2026-01-02T12:00:01.000Z"),
    });
    const nextBatch = restarted.getPendingLaunchMetadata(CHAIN_ID, 5);
    expect(nextBatch).toHaveLength(1);
    expect(nextBatch[0]).toMatchObject({
      metadataUri: "https://metadata.example/6.json",
      attempts: 0,
    });
    const nextPending = nextBatch[0];
    if (!nextPending) throw new Error("Expected the sixth metadata record");
    expect(
      restarted.deferLaunchMetadata(
        nextPending,
        new Date("2026-01-02T12:02:00.000Z"),
      ),
    ).toBe(true);

    const retryBatch = restarted.getPendingLaunchMetadata(
      CHAIN_ID,
      5,
      new Date("2026-01-02T12:01:01.000Z"),
    );
    expect(retryBatch).toHaveLength(5);
    expect(retryBatch.every((pending) => pending.attempts === 1)).toBe(true);
  });

  it("rolls projections back when a known block hash changes", () => {
    const { database, indexer } = setup();
    indexer.ingestBlock(launchBlock());
    indexer.ingestBlock(
      block(2, [transferEvent(POOL, ALICE, "200")], {
        parentHash: hash(1001),
        blockHash: hash(2002),
      }),
    );
    const replacement = block(2, [transferEvent(POOL, BOB, "150")], {
      parentHash: hash(1001),
      blockHash: hash(3002),
    });

    const result = indexer.ingestBlock(replacement);

    expect(result.reorgFromBlock).toBe("2");
    expect(result.checkpoint.blockHash).toBe(hash(3002));
    const holders = database.db
      .prepare(
        `SELECT holder_address, balance
         FROM holder_balances
         WHERE token_address = ? AND holder_address IN (?, ?)
         ORDER BY holder_address`,
      )
      .all(TOKEN, ALICE, BOB) as {
      holder_address: string;
      balance: string;
    }[];
    expect(holders).toEqual([{ holder_address: BOB, balance: "150" }]);
  });

  it("keeps integer amounts exact far beyond Number.MAX_SAFE_INTEGER", () => {
    const { indexer, repository } = setup();
    const huge = "123456789012345678901234567890123456789";
    indexer.ingestBlock(
      launchBlock({
        totalSupply: huge,
        creatorAllocation: "1",
        poolAllocation: "123456789012345678901234567890123456788",
      }),
    );
    indexer.ingestBlock(
      block(
        2,
        [
          {
            type: "TradeExecuted",
            tokenAddress: TOKEN,
            poolAddress: POOL,
            traderAddress: ALICE,
            side: "buy",
            nativeAmount: huge,
            tokenAmount: "42",
          },
        ],
        { parentHash: hash(1001) },
      ),
    );

    const detail = repository.getLaunchDetail(CHAIN_ID, TOKEN) as {
      totalSupply: string;
      trades: { nativeAmount: string }[];
      recentVolumeNative: string;
    };
    expect(detail.totalSupply).toBe(huge);
    expect(detail.trades[0]?.nativeAmount).toBe(huge);
    expect(detail.recentVolumeNative).toBe(huge);
  });

  it("uses only tradable ordinary supply for holder concentration and shares", () => {
    const { indexer, repository } = setup();
    indexer.ingestBlock(
      launchBlock({
        totalSupply: "1000",
        creatorAllocation: "100",
        poolAllocation: "500",
        extraEvents: [
          transferEvent(FACTORY, LOCKER, "100"),
          transferEvent(FACTORY, DEAD_ADDRESS, "50"),
          transferEvent(FACTORY, ZERO_ADDRESS, "50"),
          transferEvent(FACTORY, ALICE, "200"),
        ],
      }),
    );

    const detail = repository.getLaunchDetail(CHAIN_ID, TOKEN) as {
      topTenOrdinaryHolderBps: number;
      circulatingSupply: string;
      uniqueHolders: number;
      holders: {
        address: string;
        category: string;
        circulatingShareBps: number | null;
      }[];
      riskFacts: { key: string; explanation: string }[];
    };
    expect(detail.circulatingSupply).toBe("200");
    expect(detail.topTenOrdinaryHolderBps).toBe(10_000);
    expect(detail.uniqueHolders).toBe(1);
    expect(
      Object.fromEntries(
        detail.holders.map((holder) => [
          holder.address,
          {
            category: holder.category,
            share: holder.circulatingShareBps,
          },
        ]),
      ),
    ).toMatchObject({
      [POOL]: { category: "pool", share: null },
      [LOCKER]: { category: "locker", share: null },
      [VAULT]: { category: "vesting", share: null },
      [DEAD_ADDRESS]: { category: "burn", share: null },
      [ZERO_ADDRESS]: { category: "zero", share: null },
      [ALICE]: { category: "ordinary", share: 10_000 },
    });
    expect(
      detail.riskFacts.find((fact) => fact.key === "top-ten-concentration")
        ?.explanation,
    ).toContain("거래 가능 일반 물량");
  });

  it("returns holder distribution in exact BigInt balance order", () => {
    const { indexer, repository } = setup();
    const smallestAddress = address(13);
    const mediumAddress = address(14);
    const largestAddress = address(15);
    const totalSupply = "1999999999998723638444444222002";
    const poolAllocation = "1";
    const creatorAllocation = "1";
    indexer.ingestBlock(
      launchBlock({
        totalSupply,
        creatorAllocation,
        poolAllocation,
        extraEvents: [
          transferEvent(
            FACTORY,
            smallestAddress,
            "900719925474099312345678901234",
          ),
          transferEvent(
            FACTORY,
            largestAddress,
            "900719925474099312345678901235",
          ),
          transferEvent(
            FACTORY,
            mediumAddress,
            "198560149050525013753086419531",
          ),
        ],
      }),
    );

    const detail = repository.getLaunchDetail(CHAIN_ID, TOKEN) as {
      holders: { address: string; balance: string }[];
    };
    expect(
      detail.holders.map(({ address, balance }) => [address, balance]),
    ).toEqual([
      [largestAddress, "900719925474099312345678901235"],
      [smallestAddress, "900719925474099312345678901234"],
      [mediumAddress, "198560149050525013753086419531"],
      [VAULT, "1"],
      [POOL, "1"],
    ]);
  });

  it("reconciles transfer balances exactly after repeated sends", () => {
    const { database, indexer } = setup();
    indexer.ingestBlock(launchBlock());
    indexer.ingestBlock(
      block(
        2,
        [transferEvent(POOL, ALICE, "300"), transferEvent(ALICE, BOB, "125")],
        { parentHash: hash(1001) },
      ),
    );

    const balances = database.db
      .prepare(
        `SELECT holder_address, balance FROM holder_balances
         WHERE token_address = ? AND holder_address IN (?, ?, ?)
         ORDER BY holder_address`,
      )
      .all(TOKEN, POOL, ALICE, BOB) as {
      holder_address: string;
      balance: string;
    }[];
    expect(balances).toEqual([
      { holder_address: POOL, balance: "600" },
      { holder_address: ALICE, balance: "175" },
      { holder_address: BOB, balance: "125" },
    ]);
  });

  it("preserves the last-good checkpoint and data on a projection failure", () => {
    const { database, indexer, repository } = setup();
    indexer.ingestBlock(launchBlock());

    expect(() =>
      indexer.ingestBlock(
        block(2, [transferEvent(ALICE, BOB, "1")], {
          parentHash: hash(1001),
        }),
      ),
    ).toThrow(/Negative balance/u);

    expect(indexer.getCheckpoint(CHAIN_ID)).toMatchObject({
      blockNumber: "1",
      blockHash: hash(1001),
      status: "error",
    });
    expect(repository.listLaunches(CHAIN_ID).items).toHaveLength(1);
    expect(
      database.db.prepare("SELECT COUNT(*) AS count FROM raw_logs").get(),
    ).toEqual({ count: 4 });
  });

  it("retries RPC timeouts and never overwrites last-good data with zeroes", async () => {
    const { indexer, repository } = setup();
    indexer.ingestBlock(launchBlock());
    let attempts = 0;
    const delays: number[] = [];
    const synchronizer = new RpcSynchronizer(
      indexer,
      {
        getBlock: () => {
          attempts += 1;
          return Promise.reject(
            new Error("RPC timeout https://rpc/?key=secret"),
          );
        },
      },
      {
        attempts: 3,
        baseDelayMs: 10,
        random: () => 0.5,
        sleep: (delay) => {
          delays.push(delay);
          return Promise.resolve();
        },
      },
    );

    await expect(synchronizer.syncRange(CHAIN_ID, 2n, 2n)).rejects.toThrow(
      "RPC timeout",
    );
    expect(attempts).toBe(3);
    expect(delays).toEqual([10, 20]);
    expect(indexer.getCheckpoint(CHAIN_ID)).toMatchObject({
      blockNumber: "1",
      status: "error",
      error: "RPC timeout https://rpc/",
    });
    expect(repository.listLaunches(CHAIN_ID).items).toHaveLength(1);
  });
});
