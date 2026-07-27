import Database from "better-sqlite3";

import { PROJECTION_TABLES, SCHEMA_SQL, SCHEMA_VERSION } from "./schema.js";
import { type IndexerSource } from "./types.js";

export type SqliteDatabase = Database.Database;

export interface DatabaseOptions {
  readonly source?: IndexerSource;
  readonly now?: () => Date;
}

export class IndexerDatabase {
  readonly db: SqliteDatabase;
  readonly source: IndexerSource;
  private readonly now: () => Date;

  constructor(filename = ":memory:", options: DatabaseOptions = {}) {
    this.db = new Database(filename);
    this.source = options.source ?? "onchain-indexer";
    this.now = options.now ?? (() => new Date());
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("busy_timeout = 5000");
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  ensureChain(chainId: number): void {
    const now = this.now().toISOString();
    this.db
      .prepare(
        `INSERT INTO chains (chain_id, source, created_at, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (chain_id) DO UPDATE SET
           source = excluded.source,
           updated_at = excluded.updated_at`,
      )
      .run(chainId, this.source, now, now);
    this.db
      .prepare(
        `INSERT INTO indexer_checkpoints
           (chain_id, block_number, block_hash, updated_at, status, error)
         VALUES (?, NULL, NULL, NULL, 'starting', NULL)
         ON CONFLICT (chain_id) DO NOTHING`,
      )
      .run(chainId);
  }

  clearProjections(chainId: number): void {
    for (const table of PROJECTION_TABLES) {
      this.db.prepare(`DELETE FROM ${table} WHERE chain_id = ?`).run(chainId);
    }
  }

  transaction<T>(operation: () => T): T {
    return this.db.transaction(operation)();
  }

  private migrate(): void {
    this.db.exec(SCHEMA_SQL);
    this.db
      .prepare(
        `INSERT INTO schema_migrations (version, applied_at)
         VALUES (?, ?)
         ON CONFLICT (version) DO NOTHING`,
      )
      .run(SCHEMA_VERSION, this.now().toISOString());
  }
}
