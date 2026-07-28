import { afterEach, describe, expect, it } from "vitest";

import { IndexerDatabase } from "../src/database.js";
import { IndexerService } from "../src/indexer.js";
import { type ForgeRpcBlockSource } from "../src/onchain.js";
import { IndexerPoller } from "../src/poller.js";
import { block, CHAIN_ID, hash, launchBlock } from "./fixtures.js";

const databases: IndexerDatabase[] = [];

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close();
});

function setup(head: { value: bigint }) {
  const database = new IndexerDatabase(":memory:", {
    source: "local-fixture",
  });
  databases.push(database);
  const indexer = new IndexerService(database);
  const blocks = new Map([
    [1n, launchBlock()],
    [2n, block(2, [], { parentHash: hash(1001) })],
  ]);
  const source = {
    assertChain: () => Promise.resolve(),
    getHeadBlockNumber: () => Promise.resolve(head.value),
    getCanonicalBlockHash: (number: bigint) => {
      const found = blocks.get(number);
      if (!found) return Promise.reject(new Error("block not found"));
      return Promise.resolve(found.hash);
    },
    getBlock: (_chainId: number, number: bigint) => {
      const found = blocks.get(number);
      if (!found) return Promise.reject(new Error("block not found"));
      return Promise.resolve(found);
    },
  } as unknown as ForgeRpcBlockSource;
  const poller = new IndexerPoller(indexer, source, {
    chainId: CHAIN_ID,
    startBlock: 1n,
    finalityTag: "latest",
    maxBlocksPerCycle: 1,
  });
  return { indexer, poller };
}

describe("indexer poller checkpoint status", () => {
  it("reports lagging until its bounded cycle reaches the canonical head", async () => {
    const head = { value: 2n };
    const { indexer, poller } = setup(head);

    await poller.runOnce();
    expect(indexer.getCheckpoint(CHAIN_ID)).toMatchObject({
      blockNumber: "1",
      status: "lagging",
      error: null,
    });

    await poller.runOnce();
    expect(indexer.getCheckpoint(CHAIN_ID)).toMatchObject({
      blockNumber: "2",
      status: "synced",
      error: null,
    });
  });

  it("clears a transient error only after confirming it is caught up", async () => {
    const head = { value: 1n };
    const { indexer, poller } = setup(head);
    await poller.runOnce();
    indexer.recordFailure(CHAIN_ID, new Error("RPC timeout"));

    expect(indexer.getCheckpoint(CHAIN_ID)).toMatchObject({
      blockNumber: "1",
      status: "error",
      error: "RPC timeout",
    });

    await poller.runOnce();
    expect(indexer.getCheckpoint(CHAIN_ID)).toMatchObject({
      blockNumber: "1",
      status: "synced",
      error: null,
    });
  });
});
