import { type BlockEnvelope, type RpcBlockSource } from "./types.js";
import { type IndexerService } from "./indexer.js";

export interface RetryOptions {
  readonly attempts?: number;
  readonly baseDelayMs?: number;
  readonly maxDelayMs?: number;
  readonly random?: () => number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly shouldRetry?: (error: unknown) => boolean;
}

export async function withExponentialBackoff<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const attempts = options.attempts ?? 5;
  if (!Number.isInteger(attempts) || attempts < 1) {
    throw new Error("Retry attempts must be a positive integer");
  }
  const baseDelayMs = options.baseDelayMs ?? 250;
  const maxDelayMs = options.maxDelayMs ?? 8_000;
  const random = options.random ?? Math.random;
  const sleep = options.sleep ?? defaultSleep;
  const shouldRetry = options.shouldRetry ?? isTransientRpcError;

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !shouldRetry(error)) {
        throw error;
      }
      const exponential = Math.min(
        maxDelayMs,
        baseDelayMs * 2 ** (attempt - 1),
      );
      const jittered = Math.max(
        0,
        Math.round(exponential * (0.75 + random() * 0.5)),
      );
      await sleep(jittered);
    }
  }
  throw lastError;
}

export class RpcSynchronizer {
  constructor(
    private readonly indexer: IndexerService,
    private readonly source: RpcBlockSource,
    private readonly retryOptions: RetryOptions = {},
  ) {}

  async syncRange(
    chainId: number,
    fromBlock: bigint,
    toBlock: bigint,
  ): Promise<readonly BlockEnvelope[]> {
    if (fromBlock < 0n || toBlock < fromBlock) {
      throw new Error("Invalid sync range");
    }
    const blocks: BlockEnvelope[] = [];
    for (let number = fromBlock; number <= toBlock; number += 1n) {
      try {
        const block = await withExponentialBackoff(
          () => this.source.getBlock(chainId, number),
          this.retryOptions,
        );
        this.indexer.ingestBlock(block);
        blocks.push(block);
      } catch (error) {
        this.indexer.recordFailure(chainId, error);
        throw error;
      }
    }
    return blocks;
  }
}

export function isTransientRpcError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") {
    return false;
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("timeout") ||
      message.includes("timed out") ||
      message.includes("429") ||
      message.includes("rate limit") ||
      message.includes("econnreset") ||
      message.includes("econnrefused") ||
      message.includes("503") ||
      message.includes("502")
    );
  }
  return false;
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
