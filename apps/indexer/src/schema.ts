export const SCHEMA_VERSION = 1;

export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chains (
  chain_id INTEGER PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('onchain-indexer', 'local-fixture')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS block_headers (
  chain_id INTEGER NOT NULL,
  block_number INTEGER NOT NULL CHECK (block_number >= 0),
  block_hash TEXT NOT NULL,
  parent_hash TEXT,
  block_timestamp TEXT NOT NULL,
  PRIMARY KEY (chain_id, block_number)
);

CREATE TABLE IF NOT EXISTS raw_logs (
  chain_id INTEGER NOT NULL,
  block_number INTEGER NOT NULL CHECK (block_number >= 0),
  block_hash TEXT NOT NULL,
  transaction_hash TEXT NOT NULL,
  transaction_index INTEGER NOT NULL DEFAULT 0 CHECK (transaction_index >= 0),
  log_index INTEGER NOT NULL CHECK (log_index >= 0),
  contract_address TEXT NOT NULL,
  topics_json TEXT NOT NULL,
  data TEXT NOT NULL,
  block_timestamp TEXT NOT NULL,
  decoded_event_json TEXT,
  ingested_at TEXT NOT NULL,
  PRIMARY KEY (
    chain_id,
    block_number,
    block_hash,
    transaction_hash,
    log_index
  )
);

CREATE INDEX IF NOT EXISTS raw_logs_replay_order
  ON raw_logs (chain_id, block_number, transaction_index, log_index);

CREATE TABLE IF NOT EXISTS contracts (
  chain_id INTEGER NOT NULL,
  address TEXT NOT NULL,
  kind TEXT NOT NULL,
  launch_token_address TEXT,
  source_verified INTEGER,
  explorer_url TEXT,
  created_block INTEGER NOT NULL,
  transaction_hash TEXT NOT NULL,
  PRIMARY KEY (chain_id, address)
);

CREATE TABLE IF NOT EXISTS creators (
  chain_id INTEGER NOT NULL,
  address TEXT NOT NULL,
  launch_count INTEGER NOT NULL DEFAULT 0,
  launches_with_liquidity INTEGER NOT NULL DEFAULT 0,
  first_seen_at TEXT NOT NULL,
  PRIMARY KEY (chain_id, address)
);

CREATE TABLE IF NOT EXISTS creator_social_proofs (
  chain_id INTEGER NOT NULL,
  creator_address TEXT NOT NULL,
  platform TEXT NOT NULL,
  handle TEXT NOT NULL,
  proof_url TEXT NOT NULL,
  proof_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  verified_at TEXT NOT NULL,
  transaction_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  PRIMARY KEY (chain_id, creator_address, platform)
);

CREATE TABLE IF NOT EXISTS tokens (
  chain_id INTEGER NOT NULL,
  address TEXT NOT NULL,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  decimals INTEGER NOT NULL CHECK (decimals = 18),
  total_supply TEXT NOT NULL,
  metadata_uri TEXT NOT NULL,
  metadata_hash TEXT NOT NULL,
  image_url TEXT,
  description TEXT,
  creator_address TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_block INTEGER NOT NULL,
  transaction_hash TEXT NOT NULL,
  PRIMARY KEY (chain_id, address)
);

CREATE TABLE IF NOT EXISTS launches (
  chain_id INTEGER NOT NULL,
  token_address TEXT NOT NULL,
  factory_address TEXT NOT NULL,
  creator_address TEXT NOT NULL,
  creator_allocation_bps INTEGER NOT NULL CHECK (
    creator_allocation_bps >= 0 AND creator_allocation_bps <= 1000
  ),
  creator_allocation TEXT NOT NULL,
  vesting_vault_address TEXT NOT NULL,
  pool_address TEXT NOT NULL,
  locker_address TEXT NOT NULL,
  lp_token_address TEXT NOT NULL,
  protocol_config_address TEXT NOT NULL,
  operator_address TEXT NOT NULL,
  adapter_address TEXT NOT NULL,
  mutable_parameters_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_block INTEGER NOT NULL,
  transaction_hash TEXT NOT NULL,
  PRIMARY KEY (chain_id, token_address)
);

CREATE TABLE IF NOT EXISTS pools (
  chain_id INTEGER NOT NULL,
  address TEXT NOT NULL,
  token_address TEXT NOT NULL,
  adapter_address TEXT NOT NULL,
  native_reserve TEXT,
  token_reserve TEXT,
  last_updated_block INTEGER,
  PRIMARY KEY (chain_id, address)
);

CREATE TABLE IF NOT EXISTS liquidity_locks (
  chain_id INTEGER NOT NULL,
  token_address TEXT NOT NULL,
  locker_address TEXT NOT NULL,
  lp_token_address TEXT NOT NULL,
  pool_address TEXT NOT NULL,
  principal_withdrawable INTEGER NOT NULL CHECK (principal_withdrawable = 0),
  lock_kind TEXT NOT NULL,
  created_block INTEGER NOT NULL,
  PRIMARY KEY (chain_id, token_address)
);

CREATE TABLE IF NOT EXISTS vesting_schedules (
  chain_id INTEGER NOT NULL,
  vault_address TEXT NOT NULL,
  token_address TEXT NOT NULL,
  creator_address TEXT NOT NULL,
  total_allocation TEXT NOT NULL,
  claimed TEXT NOT NULL,
  cliff_at TEXT NOT NULL,
  fully_vested_at TEXT NOT NULL,
  created_block INTEGER NOT NULL,
  PRIMARY KEY (chain_id, vault_address)
);

CREATE TABLE IF NOT EXISTS trades (
  chain_id INTEGER NOT NULL,
  token_address TEXT NOT NULL,
  pool_address TEXT NOT NULL,
  transaction_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  trader_address TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  native_amount TEXT NOT NULL,
  token_amount TEXT NOT NULL,
  block_number INTEGER NOT NULL,
  block_timestamp TEXT NOT NULL,
  PRIMARY KEY (chain_id, transaction_hash, log_index)
);

CREATE INDEX IF NOT EXISTS trades_by_token
  ON trades (chain_id, token_address, block_number DESC, log_index DESC);

CREATE TABLE IF NOT EXISTS transfers (
  chain_id INTEGER NOT NULL,
  token_address TEXT NOT NULL,
  transaction_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  value TEXT NOT NULL,
  block_number INTEGER NOT NULL,
  block_timestamp TEXT NOT NULL,
  PRIMARY KEY (chain_id, transaction_hash, log_index)
);

CREATE TABLE IF NOT EXISTS holder_balances (
  chain_id INTEGER NOT NULL,
  token_address TEXT NOT NULL,
  holder_address TEXT NOT NULL,
  balance TEXT NOT NULL,
  category TEXT NOT NULL CHECK (
    category IN ('ordinary', 'pool', 'locker', 'vesting', 'burn', 'zero')
  ),
  updated_block INTEGER NOT NULL,
  PRIMARY KEY (chain_id, token_address, holder_address)
);

CREATE TABLE IF NOT EXISTS risk_facts (
  chain_id INTEGER NOT NULL,
  token_address TEXT NOT NULL,
  fact_key TEXT NOT NULL,
  label TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN (
      'confirmed',
      'not-applicable',
      'caution',
      'high-concentration',
      'unverifiable',
      'collecting'
    )
  ),
  value TEXT,
  explanation TEXT NOT NULL,
  evidence_contract_address TEXT,
  evidence_transaction_hash TEXT,
  evidence_block_number TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (chain_id, token_address, fact_key)
);

CREATE TABLE IF NOT EXISTS indexer_checkpoints (
  chain_id INTEGER PRIMARY KEY,
  block_number INTEGER,
  block_hash TEXT,
  updated_at TEXT,
  status TEXT NOT NULL CHECK (
    status IN ('synced', 'lagging', 'starting', 'error')
  ),
  error TEXT
);

CREATE TABLE IF NOT EXISTS moderation_flags (
  chain_id INTEGER NOT NULL,
  token_address TEXT NOT NULL,
  reporter_address TEXT NOT NULL,
  reason TEXT NOT NULL,
  details_hash TEXT,
  transaction_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (chain_id, transaction_hash, log_index)
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  chain_id INTEGER NOT NULL,
  token_address TEXT NOT NULL,
  reason TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source = 'api-user-report'),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS reports_by_token
  ON reports (chain_id, token_address, created_at DESC);
`;

export const PROJECTION_TABLES = [
  "contracts",
  "creators",
  "creator_social_proofs",
  "tokens",
  "launches",
  "pools",
  "liquidity_locks",
  "vesting_schedules",
  "trades",
  "transfers",
  "holder_balances",
  "risk_facts",
  "moderation_flags",
] as const;
