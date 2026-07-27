import { type IndexerService } from "./indexer.js";
import { type FinalityTag, type ForgeRpcBlockSource } from "./onchain.js";
import { RpcSynchronizer, withExponentialBackoff } from "./rpc.js";

export interface IndexerPollerOptions {
  readonly chainId: number;
  readonly startBlock: bigint;
  readonly finalityTag: FinalityTag;
  readonly intervalMs?: number;
  readonly maxBlocksPerCycle?: number;
}

export class IndexerPoller {
  private readonly synchronizer: RpcSynchronizer;
  private readonly intervalMs: number;
  private readonly maxBlocksPerCycle: number;

  constructor(
    private readonly indexer: IndexerService,
    private readonly source: ForgeRpcBlockSource,
    private readonly options: IndexerPollerOptions,
  ) {
    this.intervalMs = options.intervalMs ?? 1_000;
    this.maxBlocksPerCycle = options.maxBlocksPerCycle ?? 20;
    if (this.intervalMs < 100 || this.maxBlocksPerCycle < 1) {
      throw new Error("Invalid indexer polling bounds");
    }
    this.synchronizer = new RpcSynchronizer(indexer, source, {
      attempts: 5,
      baseDelayMs: 250,
      maxDelayMs: 8_000,
    });
  }

  async run(signal: AbortSignal): Promise<void> {
    await withExponentialBackoff(() => this.source.assertChain());
    while (!signal.aborted) {
      try {
        await this.runOnce();
      } catch (error) {
        // IndexerService and RpcSynchronizer persist a sanitized error while
        // preserving the last-good projection. The next cycle retries.
        this.indexer.recordFailure(this.options.chainId, error);
      }
      await waitForNextCycle(this.intervalMs, signal);
    }
  }

  async runOnce(): Promise<void> {
    const head = await withExponentialBackoff(() =>
      this.source.getHeadBlockNumber(this.options.finalityTag),
    );
    let checkpoint = this.indexer.getCheckpoint(this.options.chainId);

    if (checkpoint.blockNumber != null && checkpoint.blockHash != null) {
      const checkpointNumber = BigInt(checkpoint.blockNumber);
      if (checkpointNumber > head) {
        this.indexer.rollbackFromBlock(this.options.chainId, head + 1n);
        checkpoint = this.indexer.getCheckpoint(this.options.chainId);
      } else {
        const canonicalHash = await withExponentialBackoff(() =>
          this.source.getCanonicalBlockHash(checkpointNumber),
        );
        if (canonicalHash !== checkpoint.blockHash) {
          const firstChanged =
            await this.findFirstChangedBlock(checkpointNumber);
          this.indexer.rollbackFromBlock(this.options.chainId, firstChanged);
          checkpoint = this.indexer.getCheckpoint(this.options.chainId);
        }
      }
    }

    const next =
      checkpoint.blockNumber == null
        ? this.options.startBlock
        : BigInt(checkpoint.blockNumber) + 1n;
    if (next > head) return;
    const last = minBigInt(head, next + BigInt(this.maxBlocksPerCycle - 1));
    await this.synchronizer.syncRange(this.options.chainId, next, last);
  }

  private async findFirstChangedBlock(latestKnown: bigint): Promise<bigint> {
    let cursor = latestKnown;
    while (cursor >= this.options.startBlock) {
      const stored = this.indexer.getStoredBlockHash(
        this.options.chainId,
        cursor,
      );
      const canonical = await withExponentialBackoff(() =>
        this.source.getCanonicalBlockHash(cursor),
      );
      if (stored === canonical) return cursor + 1n;
      if (cursor === this.options.startBlock) return cursor;
      cursor -= 1n;
    }
    return this.options.startBlock;
  }
}

function minBigInt(left: bigint, right: bigint): bigint {
  return left < right ? left : right;
}

function waitForNextCycle(
  milliseconds: number,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
}
