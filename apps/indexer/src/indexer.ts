import { z } from "zod";

import { type IndexerDatabase } from "./database.js";
import { ProjectionEngine } from "./projector.js";
import {
  EmbeddedEventDecoder,
  type BlockEnvelope,
  type DecodedEvent,
  deserializeDecodedEvent,
  type IndexerCheckpoint,
  type IndexerOptions,
  type LogDecoder,
  normalizeAddress,
  normalizeHash,
  type RawChainLog,
  serializeDecodedEvent,
} from "./types.js";

const hexDataSchema = z.string().regex(/^0x(?:[a-fA-F0-9]{2})*$/);
const chainIdSchema = z.number().int().positive();
const logIndexSchema = z.number().int().nonnegative();

interface CheckpointRow {
  chain_id: number;
  block_number: number | null;
  block_hash: string | null;
  updated_at: string | null;
  status: IndexerCheckpoint["status"];
  error: string | null;
}

interface HeaderRow {
  block_hash: string;
}

interface HeadRow {
  block_number: number;
  block_hash: string;
}

export interface IngestResult {
  readonly insertedLogs: number;
  readonly duplicateLogs: number;
  readonly reorgFromBlock: string | null;
  readonly checkpoint: IndexerCheckpoint;
}

export interface PendingLaunchMetadata {
  readonly chainId: number;
  readonly blockNumber: number;
  readonly blockHash: string;
  readonly transactionHash: string;
  readonly logIndex: number;
  readonly metadataUri: string;
  readonly metadataHash: `0x${string}`;
  readonly name: string;
  readonly symbol: string;
  readonly attempts: number;
}

export interface HydratedLaunchMetadata {
  readonly imageUrl: string;
  readonly description: string;
}

export class IndexerService {
  readonly database: IndexerDatabase;
  private readonly decoder: LogDecoder;
  private readonly projector: ProjectionEngine;
  private readonly clock: () => Date;

  constructor(
    database: IndexerDatabase,
    decoder: LogDecoder = new EmbeddedEventDecoder(),
    options: IndexerOptions = {},
  ) {
    this.database = database;
    this.decoder = decoder;
    this.projector = new ProjectionEngine(database.db);
    this.clock = options.clock ?? (() => new Date());
  }

  ingestBlock(block: BlockEnvelope): IngestResult {
    const chainId = chainIdSchema.parse(block.chainId);
    const blockNumber = toSafeBlockNumber(block.number);
    const blockHash = normalizeHash(block.hash);
    const parentHash = normalizeHash(block.parentHash);
    const blockTimestamp = parseTimestamp(block.timestamp);

    let insertedLogs = 0;
    let reorgFromBlock: string | null = null;
    try {
      this.database.transaction(() => {
        this.database.ensureChain(chainId);
        const knownHeader = this.database.db
          .prepare(
            `SELECT block_hash FROM block_headers
             WHERE chain_id = ? AND block_number = ?`,
          )
          .get(chainId, blockNumber) as HeaderRow | undefined;
        if (knownHeader && knownHeader.block_hash !== blockHash) {
          reorgFromBlock = blockNumber.toString();
          this.rollbackFrom(chainId, blockNumber);
        }

        if (blockNumber > 0) {
          const prior = this.database.db
            .prepare(
              `SELECT block_hash FROM block_headers
               WHERE chain_id = ? AND block_number = ?`,
            )
            .get(chainId, blockNumber - 1) as HeaderRow | undefined;
          if (prior && prior.block_hash !== parentHash) {
            throw new Error(
              `Parent block hash mismatch at block ${blockNumber}`,
            );
          }
        }

        this.database.db
          .prepare(
            `INSERT INTO block_headers
               (chain_id, block_number, block_hash, parent_hash, block_timestamp)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT (chain_id, block_number) DO UPDATE SET
               block_hash = excluded.block_hash,
               parent_hash = excluded.parent_hash,
               block_timestamp = excluded.block_timestamp`,
          )
          .run(chainId, blockNumber, blockHash, parentHash, blockTimestamp);

        const insert = this.database.db.prepare(
          `INSERT OR IGNORE INTO raw_logs
             (chain_id, block_number, block_hash, transaction_hash,
              transaction_index, log_index, contract_address, topics_json, data,
              block_timestamp, decoded_event_json, ingested_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        for (const log of block.logs) {
          const normalized = this.normalizeLog(
            log,
            chainId,
            blockNumber,
            blockHash,
            blockTimestamp,
          );
          const decoded = this.decoder.decode(normalized);
          const result = insert.run(
            normalized.chainId,
            blockNumber,
            normalized.blockHash,
            normalized.transactionHash,
            normalized.transactionIndex ?? 0,
            normalized.logIndex,
            normalized.address,
            JSON.stringify(normalized.topics),
            normalized.data,
            normalized.blockTimestamp,
            decoded ? serializeDecodedEvent(decoded) : null,
            this.clock().toISOString(),
          );
          insertedLogs += result.changes;
        }

        const head = this.database.db
          .prepare(
            `SELECT block_number, block_hash
             FROM block_headers
             WHERE chain_id = ?
             ORDER BY block_number DESC
             LIMIT 1`,
          )
          .get(chainId) as HeadRow;
        const now = this.clock().toISOString();
        this.database.db
          .prepare(
            `UPDATE indexer_checkpoints
             SET block_number = ?, block_hash = ?, updated_at = ?,
                 status = 'synced', error = NULL
             WHERE chain_id = ?`,
          )
          .run(head.block_number, head.block_hash, now, chainId);
        this.projector.rebuild(chainId);
      });
    } catch (error) {
      this.recordFailure(chainId, error);
      throw error;
    }

    return {
      insertedLogs,
      duplicateLogs: block.logs.length - insertedLogs,
      reorgFromBlock,
      checkpoint: this.getCheckpoint(chainId),
    };
  }

  rebuild(chainId: number): void {
    const safeChainId = chainIdSchema.parse(chainId);
    this.database.transaction(() => {
      this.database.ensureChain(safeChainId);
      this.projector.rebuild(safeChainId);
    });
  }

  getPendingLaunchMetadata(
    chainId: number,
    limit = 10,
    now: Date = this.clock(),
  ): PendingLaunchMetadata[] {
    const safeChainId = chainIdSchema.parse(chainId);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new Error("Invalid metadata hydration limit");
    }
    const retryCutoff = parseTimestamp(now.toISOString());
    const rows = this.database.db
      .prepare(
        `SELECT r.chain_id, r.block_number, r.block_hash, r.transaction_hash,
                r.log_index, r.decoded_event_json,
                COALESCE(m.attempts, 0) AS attempts
         FROM raw_logs AS r
         LEFT JOIN metadata_hydration_retries AS m
           ON m.chain_id = r.chain_id
          AND m.block_number = r.block_number
          AND m.block_hash = r.block_hash
          AND m.transaction_hash = r.transaction_hash
          AND m.log_index = r.log_index
         WHERE r.chain_id = ?
           AND r.decoded_event_json IS NOT NULL
           AND json_extract(r.decoded_event_json, '$.type') = 'LaunchCreated'
           AND (
             json_extract(r.decoded_event_json, '$.imageUrl') IS NULL
             OR json_extract(r.decoded_event_json, '$.description') IS NULL
           )
           AND (m.retry_at IS NULL OR m.retry_at <= ?)
         ORDER BY
           CASE WHEN m.retry_at IS NULL THEN 0 ELSE 1 END ASC,
           COALESCE(m.retry_at, r.block_timestamp) ASC,
           r.block_number ASC,
           r.transaction_index ASC,
           r.log_index ASC
         LIMIT ?`,
      )
      .all(safeChainId, retryCutoff, limit) as {
      chain_id: number;
      block_number: number;
      block_hash: string;
      transaction_hash: string;
      log_index: number;
      decoded_event_json: string;
      attempts: number;
    }[];

    const pending: PendingLaunchMetadata[] = [];
    for (const row of rows) {
      const event = this.deserializeIfLaunch(row.decoded_event_json);
      if (!event || (event.imageUrl != null && event.description != null)) {
        continue;
      }
      pending.push({
        chainId: row.chain_id,
        blockNumber: row.block_number,
        blockHash: row.block_hash,
        transactionHash: row.transaction_hash,
        logIndex: row.log_index,
        metadataUri: event.metadataUri,
        metadataHash: event.metadataHash as `0x${string}`,
        name: event.name,
        symbol: event.symbol,
        attempts: row.attempts,
      });
    }
    return pending;
  }

  deferLaunchMetadata(identity: PendingLaunchMetadata, retryAt: Date): boolean {
    const safeChainId = chainIdSchema.parse(identity.chainId);
    const safeRetryAt = parseTimestamp(retryAt.toISOString());
    const result = this.database.db
      .prepare(
        `INSERT INTO metadata_hydration_retries
           (chain_id, block_number, block_hash, transaction_hash, log_index,
            attempts, retry_at)
         SELECT chain_id, block_number, block_hash, transaction_hash, log_index,
                1, ?
         FROM raw_logs
         WHERE chain_id = ? AND block_number = ? AND block_hash = ?
           AND transaction_hash = ? AND log_index = ?
         ON CONFLICT (
           chain_id, block_number, block_hash, transaction_hash, log_index
         ) DO UPDATE SET
           attempts = metadata_hydration_retries.attempts + 1,
           retry_at = excluded.retry_at`,
      )
      .run(
        safeRetryAt,
        safeChainId,
        identity.blockNumber,
        normalizeHash(identity.blockHash),
        normalizeHash(identity.transactionHash),
        identity.logIndex,
      );
    return result.changes === 1;
  }

  hydrateLaunchMetadata(
    identity: PendingLaunchMetadata,
    metadata: HydratedLaunchMetadata,
  ): boolean {
    const safeChainId = chainIdSchema.parse(identity.chainId);
    let changed = false;
    this.database.transaction(() => {
      const row = this.database.db
        .prepare(
          `SELECT decoded_event_json
           FROM raw_logs
           WHERE chain_id = ? AND block_number = ? AND block_hash = ?
             AND transaction_hash = ? AND log_index = ?`,
        )
        .get(
          safeChainId,
          identity.blockNumber,
          normalizeHash(identity.blockHash),
          normalizeHash(identity.transactionHash),
          identity.logIndex,
        ) as { decoded_event_json: string | null } | undefined;
      if (!row?.decoded_event_json) return;
      const event = this.deserializeIfLaunch(row.decoded_event_json);
      if (event?.metadataHash !== identity.metadataHash) return;

      const hydrated = {
        ...event,
        imageUrl: metadata.imageUrl,
        description: metadata.description,
      };
      const result = this.database.db
        .prepare(
          `UPDATE raw_logs SET decoded_event_json = ?
           WHERE chain_id = ? AND block_number = ? AND block_hash = ?
             AND transaction_hash = ? AND log_index = ?`,
        )
        .run(
          serializeDecodedEvent(hydrated),
          safeChainId,
          identity.blockNumber,
          normalizeHash(identity.blockHash),
          normalizeHash(identity.transactionHash),
          identity.logIndex,
        );
      if (result.changes !== 1) return;
      this.database.db
        .prepare(
          `DELETE FROM metadata_hydration_retries
           WHERE chain_id = ? AND block_number = ? AND block_hash = ?
             AND transaction_hash = ? AND log_index = ?`,
        )
        .run(
          safeChainId,
          identity.blockNumber,
          normalizeHash(identity.blockHash),
          normalizeHash(identity.transactionHash),
          identity.logIndex,
        );
      this.projector.rebuild(safeChainId);
      changed = true;
    });
    return changed;
  }

  getCheckpoint(chainId: number): IndexerCheckpoint {
    const safeChainId = chainIdSchema.parse(chainId);
    const row = this.database.db
      .prepare(
        `SELECT chain_id, block_number, block_hash, updated_at, status, error
         FROM indexer_checkpoints WHERE chain_id = ?`,
      )
      .get(safeChainId) as CheckpointRow | undefined;
    if (!row) {
      return {
        chainId: safeChainId,
        blockNumber: null,
        blockHash: null,
        updatedAt: null,
        status: "starting",
        error: null,
      };
    }
    return {
      chainId: row.chain_id,
      blockNumber: row.block_number?.toString() ?? null,
      blockHash: row.block_hash,
      updatedAt: row.updated_at,
      status: row.status,
      error: row.error,
    };
  }

  getStoredBlockHash(chainId: number, blockNumber: bigint): string | null {
    const safeChainId = chainIdSchema.parse(chainId);
    const safeBlockNumber = toSafeBlockNumber(blockNumber);
    const row = this.database.db
      .prepare(
        `SELECT block_hash FROM block_headers
         WHERE chain_id = ? AND block_number = ?`,
      )
      .get(safeChainId, safeBlockNumber) as HeaderRow | undefined;
    return row?.block_hash ?? null;
  }

  rollbackFromBlock(chainId: number, blockNumber: bigint): IndexerCheckpoint {
    const safeChainId = chainIdSchema.parse(chainId);
    const safeBlockNumber = toSafeBlockNumber(blockNumber);
    this.database.transaction(() => {
      this.database.ensureChain(safeChainId);
      this.rollbackFrom(safeChainId, safeBlockNumber);
      this.projector.rebuild(safeChainId);
      const head = this.database.db
        .prepare(
          `SELECT block_number, block_hash
           FROM block_headers
           WHERE chain_id = ?
           ORDER BY block_number DESC
           LIMIT 1`,
        )
        .get(safeChainId) as HeadRow | undefined;
      this.database.db
        .prepare(
          `UPDATE indexer_checkpoints
           SET block_number = ?, block_hash = ?, updated_at = ?,
               status = 'lagging', error = NULL
           WHERE chain_id = ?`,
        )
        .run(
          head?.block_number ?? null,
          head?.block_hash ?? null,
          this.clock().toISOString(),
          safeChainId,
        );
    });
    return this.getCheckpoint(safeChainId);
  }

  recordFailure(chainId: number, error: unknown): void {
    const safeChainId = chainIdSchema.parse(chainId);
    this.database.transaction(() => {
      this.database.ensureChain(safeChainId);
      this.database.db
        .prepare(
          `UPDATE indexer_checkpoints
           SET status = 'error', error = ?
           WHERE chain_id = ?`,
        )
        .run(safeErrorMessage(error), safeChainId);
    });
  }

  markLagging(chainId: number): void {
    const safeChainId = chainIdSchema.parse(chainId);
    this.database.transaction(() => {
      this.database.ensureChain(safeChainId);
      this.database.db
        .prepare(
          `UPDATE indexer_checkpoints SET status = 'lagging', error = NULL
           WHERE chain_id = ?`,
        )
        .run(safeChainId);
    });
  }

  markSynced(chainId: number): void {
    const safeChainId = chainIdSchema.parse(chainId);
    this.database.transaction(() => {
      this.database.ensureChain(safeChainId);
      this.database.db
        .prepare(
          `UPDATE indexer_checkpoints SET status = 'synced', error = NULL
           WHERE chain_id = ?`,
        )
        .run(safeChainId);
    });
  }

  private normalizeLog(
    log: RawChainLog,
    expectedChainId: number,
    expectedBlockNumber: number,
    expectedBlockHash: string,
    expectedTimestamp: string,
  ): RawChainLog {
    if (log.chainId !== expectedChainId) {
      throw new Error("Log chain ID does not match its block");
    }
    if (toSafeBlockNumber(log.blockNumber) !== expectedBlockNumber) {
      throw new Error("Log block number does not match its block");
    }
    const blockHash = normalizeHash(log.blockHash);
    if (blockHash !== expectedBlockHash) {
      throw new Error("Log block hash does not match its block");
    }
    const timestamp = parseTimestamp(log.blockTimestamp);
    if (timestamp !== expectedTimestamp) {
      throw new Error("Log timestamp does not match its block");
    }
    const transactionIndex =
      log.transactionIndex == null
        ? 0
        : logIndexSchema.parse(log.transactionIndex);
    return {
      chainId: expectedChainId,
      blockNumber: BigInt(expectedBlockNumber),
      blockHash,
      transactionHash: normalizeHash(log.transactionHash),
      transactionIndex,
      logIndex: logIndexSchema.parse(log.logIndex),
      address: normalizeAddress(log.address),
      topics: log.topics.map((topic) => normalizeHash(topic)),
      data: hexDataSchema.parse(log.data),
      blockTimestamp: timestamp,
      ...(log.decoded ? { decoded: log.decoded } : {}),
    };
  }

  private deserializeIfLaunch(
    value: string,
  ): Extract<DecodedEvent, { type: "LaunchCreated" }> | null {
    try {
      const parsed = deserializeDecodedEvent(value);
      return parsed.type === "LaunchCreated" ? parsed : null;
    } catch {
      return null;
    }
  }

  private rollbackFrom(chainId: number, blockNumber: number): void {
    this.database.db
      .prepare("DELETE FROM raw_logs WHERE chain_id = ? AND block_number >= ?")
      .run(chainId, blockNumber);
    this.database.db
      .prepare(
        "DELETE FROM block_headers WHERE chain_id = ? AND block_number >= ?",
      )
      .run(chainId, blockNumber);
  }
}

function toSafeBlockNumber(value: bigint): number {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Block number is outside the safe SQLite range");
  }
  return Number(value);
}

function parseTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid block timestamp");
  }
  return parsed.toISOString();
}

function safeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : "Unknown indexer error";
  return raw
    .replace(/https?:\/\/[^\s]+/gu, (url) => {
      try {
        const parsed = new URL(url);
        return `${parsed.origin}${parsed.pathname}`;
      } catch {
        return "[redacted-url]";
      }
    })
    .slice(0, 500);
}
