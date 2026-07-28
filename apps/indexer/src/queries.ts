import { type IndexerDatabase } from "./database.js";
import { type IndexerService } from "./indexer.js";
import { normalizeAddress } from "./types.js";

interface LaunchRow {
  chain_id: number;
  token_address: string;
  name: string;
  symbol: string;
  metadata_uri: string;
  metadata_hash: string;
  image_url: string | null;
  description: string | null;
  creator_address: string;
  creator_allocation_bps: number;
  creator_allocation: string;
  vesting_vault_address: string;
  pool_address: string;
  locker_address: string;
  lp_token_address: string;
  total_supply: string;
  actual_liquidity_native: string | null;
  created_at: string;
  created_block: number;
  transaction_hash: string;
  social_verified: number;
  unique_holders: number;
  recent_trades: number;
  recent_buyers: number;
  recent_volume_native: string | null;
  top_ten_bps: string | null;
}

interface HolderRow {
  holder_address: string;
  category: HolderCategory;
  balance: string;
}

interface TradeRow {
  chain_id: number;
  token_address: string;
  pool_address: string;
  transaction_hash: string;
  log_index: number;
  trader_address: string;
  side: "buy" | "sell";
  native_amount: string;
  token_amount: string;
  block_number: number;
  block_timestamp: string;
}

interface VestingRow {
  vault_address: string;
  token_address: string;
  creator_address: string;
  total_allocation: string;
  claimed: string;
  cliff_at: string;
  fully_vested_at: string;
  created_at: string;
}

interface RiskRow {
  fact_key: string;
  label: string;
  status:
    | "confirmed"
    | "not-applicable"
    | "caution"
    | "high-concentration"
    | "unverifiable"
    | "collecting";
  value: string | null;
  explanation: string;
  evidence_contract_address: string | null;
  evidence_transaction_hash: string | null;
  evidence_block_number: string | null;
}

interface AdminRow {
  protocol_config_address: string;
  operator_address: string;
  mutable_parameters_json: string;
}

type HolderCategory =
  "ordinary" | "pool" | "locker" | "vesting" | "burn" | "zero";

export type LaunchSort = "new" | "trending" | "buyers" | "liquidity" | "social";

export interface LaunchListOptions {
  readonly query?: string;
  readonly sort?: LaunchSort;
  readonly limit?: number;
  readonly cursor?: string;
}

export interface ApiMeta {
  readonly chainId: number;
  readonly source: "onchain-indexer" | "local-fixture";
  readonly indexedBlock: string | null;
  readonly indexedBlockHash: string | null;
  readonly updatedAt: string | null;
  readonly status: "synced" | "lagging" | "starting" | "error";
  readonly error: string | null;
}

export class ApiRepository {
  private readonly clock: () => Date;

  constructor(
    private readonly database: IndexerDatabase,
    private readonly indexer: IndexerService,
    clock: () => Date = () => new Date(),
  ) {
    this.clock = clock;
  }

  meta(chainId: number): ApiMeta {
    const checkpoint = this.indexer.getCheckpoint(chainId);
    return {
      chainId,
      source: this.database.source,
      indexedBlock: checkpoint.blockNumber,
      indexedBlockHash: checkpoint.blockHash,
      updatedAt: checkpoint.updatedAt,
      status: checkpoint.status,
      error: checkpoint.error,
    };
  }

  health(): {
    status: "ok" | "degraded" | "starting";
    database: "available";
    chains: readonly ApiMeta[];
  } {
    const rows = this.database.db
      .prepare("SELECT chain_id FROM chains ORDER BY chain_id")
      .all() as { chain_id: number }[];
    const chains = rows.map((row) => this.meta(row.chain_id));
    return {
      status:
        chains.length === 0
          ? "starting"
          : chains.some((chain) => chain.status !== "synced")
            ? "degraded"
            : "ok",
      database: "available",
      chains,
    };
  }

  listLaunches(
    chainId: number,
    options: LaunchListOptions = {},
  ): {
    items: readonly ReturnType<ApiRepository["mapLaunchSummary"]>[];
    nextCursor: string | null;
  } {
    const rows = this.loadLaunchRows(chainId);
    const query = options.query?.trim().toLocaleLowerCase("ko-KR") ?? "";
    let filtered = query
      ? rows.filter((row) =>
          [row.name, row.symbol, row.token_address, row.creator_address].some(
            (value) => value.toLocaleLowerCase("ko-KR").includes(query),
          ),
        )
      : rows;
    filtered = this.sortLaunchRows(filtered, options.sort ?? "new");

    const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);
    const cursorOffset = decodeCursor(options.cursor);
    const page = filtered.slice(cursorOffset, cursorOffset + limit);
    const nextOffset = cursorOffset + page.length;
    return {
      items: page.map((row) => this.mapLaunchSummary(row)),
      nextCursor:
        nextOffset < filtered.length ? encodeCursor(nextOffset) : null,
    };
  }

  getLaunchDetail(chainId: number, tokenAddress: string): unknown {
    const token = normalizeAddress(tokenAddress);
    const row = this.loadLaunchRows(chainId).find(
      (candidate) => candidate.token_address === token,
    );
    if (!row) return null;
    const holders = this.database.db
      .prepare(
        `SELECT holder_address, category, balance
         FROM holder_balances
         WHERE chain_id = ? AND token_address = ? AND balance != '0'
         ORDER BY length(balance) DESC, balance DESC, holder_address ASC`,
      )
      .all(chainId, token) as HolderRow[];
    const tradableSupply = calculateTradableSupply(row.total_supply, holders);
    const holderItems = holders.map((holder) => ({
      address: holder.holder_address,
      category: holder.category,
      balance: holder.balance,
      circulatingShareBps:
        tradableSupply === 0n || holder.category !== "ordinary"
          ? null
          : clampBps((BigInt(holder.balance) * 10_000n) / tradableSupply),
    }));
    const trades = this.database.db
      .prepare(
        `SELECT chain_id, token_address, pool_address, transaction_hash,
                log_index, trader_address, side, native_amount, token_amount,
                block_number, block_timestamp
         FROM trades
         WHERE chain_id = ? AND token_address = ?
         ORDER BY block_number DESC, log_index DESC
         LIMIT 100`,
      )
      .all(chainId, token) as TradeRow[];
    const vesting = this.database.db
      .prepare(
        `SELECT v.vault_address, v.token_address, v.creator_address,
                v.total_allocation, v.claimed, v.cliff_at, v.fully_vested_at,
                t.created_at
         FROM vesting_schedules v
         JOIN tokens t
           ON t.chain_id = v.chain_id AND t.address = v.token_address
         WHERE v.chain_id = ? AND v.token_address = ?`,
      )
      .get(chainId, token) as VestingRow | undefined;
    const risks = this.database.db
      .prepare(
        `SELECT fact_key, label, status, value, explanation,
                evidence_contract_address, evidence_transaction_hash,
                evidence_block_number
         FROM risk_facts
         WHERE chain_id = ? AND token_address = ?
         ORDER BY fact_key`,
      )
      .all(chainId, token) as RiskRow[];
    const admin = this.database.db
      .prepare(
        `SELECT protocol_config_address, operator_address,
                mutable_parameters_json
         FROM launches WHERE chain_id = ? AND token_address = ?`,
      )
      .get(chainId, token) as AdminRow;

    const vestingState = vesting
      ? calculateVesting(vesting, this.clock())
      : null;
    return {
      ...this.mapLaunchSummary(row),
      totalSupply: row.total_supply,
      circulatingSupply: tradableSupply.toString(),
      holders: holderItems,
      trades: trades.map(mapTrade),
      vesting: vestingState,
      riskFacts: risks.map((risk) => {
        const mapped = mapRisk(risk);
        return mapped.key === "creator-locked-balance" && vestingState
          ? {
              ...mapped,
              status: "confirmed" as const,
              value: vestingState.locked,
              explanation:
                "현재 시각의 선형 베스팅을 반영해 아직 vest되지 않은 창작자 물량만 표시합니다.",
            }
          : mapped;
      }),
      admin: {
        protocolConfigAddress: admin.protocol_config_address,
        operatorAddress: admin.operator_address,
        proxyUpgradeable: null,
        mutableParameters: parseStringArray(admin.mutable_parameters_json),
      },
    };
  }

  getCreator(chainId: number, creatorAddress: string): unknown {
    const creator = normalizeAddress(creatorAddress);
    const row = this.database.db
      .prepare(
        `SELECT address, launch_count, launches_with_liquidity, first_seen_at
         FROM creators WHERE chain_id = ? AND address = ?`,
      )
      .get(chainId, creator) as
      | {
          address: string;
          launch_count: number;
          launches_with_liquidity: number;
          first_seen_at: string;
        }
      | undefined;
    if (!row) return null;
    const proofs = this.database.db
      .prepare(
        `SELECT platform, handle, proof_url, proof_hash, expires_at, verified_at
         FROM creator_social_proofs
         WHERE chain_id = ? AND creator_address = ?
         ORDER BY platform`,
      )
      .all(chainId, creator) as {
      platform: string;
      handle: string;
      proof_url: string;
      proof_hash: string;
      expires_at: string;
      verified_at: string;
    }[];
    const launches = this.loadLaunchRows(chainId)
      .filter((launch) => launch.creator_address === creator)
      .map((launch) => this.mapLaunchSummary(launch));
    return {
      chainId,
      address: creator,
      launchCount: row.launch_count,
      launchesWithLiquidity: row.launches_with_liquidity,
      firstSeenAt: row.first_seen_at,
      socialOwnershipVerified: proofs.some(
        (proof) => new Date(proof.expires_at) > this.clock(),
      ),
      socialProofs: proofs.map((proof) => ({
        platform: proof.platform,
        handle: proof.handle,
        proofUrl: proof.proof_url,
        proofHash: proof.proof_hash,
        expiresAt: proof.expires_at,
        verifiedAt: proof.verified_at,
        active: new Date(proof.expires_at) > this.clock(),
        meaning:
          "소셜 계정과 지갑의 연결만 의미하며, 신원 또는 프로젝트 신뢰성을 보증하지 않습니다.",
      })),
      launches,
    };
  }

  getPortfolio(chainId: number, walletAddress: string): unknown {
    const wallet = normalizeAddress(walletAddress);
    const balances = this.database.db
      .prepare(
        `SELECT h.token_address, h.balance, h.category,
                t.name, t.symbol, p.native_reserve
         FROM holder_balances h
         JOIN tokens t
           ON t.chain_id = h.chain_id AND t.address = h.token_address
         LEFT JOIN pools p
           ON p.chain_id = h.chain_id AND p.token_address = h.token_address
         WHERE h.chain_id = ? AND h.holder_address = ? AND h.balance != '0'
         ORDER BY t.created_block DESC`,
      )
      .all(chainId, wallet) as {
      token_address: string;
      balance: string;
      category: HolderCategory;
      name: string;
      symbol: string;
      native_reserve: string | null;
    }[];
    const vestings = this.database.db
      .prepare(
        `SELECT v.vault_address, v.token_address, v.creator_address,
                v.total_allocation, v.claimed, v.cliff_at, v.fully_vested_at,
                t.created_at
         FROM vesting_schedules v
         JOIN tokens t
           ON t.chain_id = v.chain_id AND t.address = v.token_address
         WHERE v.chain_id = ? AND v.creator_address = ?
         ORDER BY t.created_block DESC`,
      )
      .all(chainId, wallet) as VestingRow[];
    const transfers = this.database.db
      .prepare(
        `SELECT token_address, transaction_hash, log_index, from_address,
                to_address, value, block_number, block_timestamp
         FROM transfers
         WHERE chain_id = ? AND (from_address = ? OR to_address = ?)
         ORDER BY block_number DESC, log_index DESC
         LIMIT 50`,
      )
      .all(chainId, wallet, wallet) as {
      token_address: string;
      transaction_hash: string;
      log_index: number;
      from_address: string;
      to_address: string;
      value: string;
      block_number: number;
      block_timestamp: string;
    }[];
    return {
      chainId,
      walletAddress: wallet,
      holdings: balances.map((balance) => ({
        tokenAddress: balance.token_address,
        name: balance.name,
        symbol: balance.symbol,
        balance: balance.balance,
        holderCategory: balance.category,
        averagePurchasePriceNative: null,
        currentValueNative: null,
        valuationStatus: "unsupported",
      })),
      claimableCreatorVestings: vestings
        .map((vesting) => calculateVesting(vesting, this.clock()))
        .filter((vesting) => BigInt(vesting.claimable) > 0n),
      recentTransactions: transfers.map((transfer) => ({
        tokenAddress: transfer.token_address,
        transactionHash: transfer.transaction_hash,
        logIndex: transfer.log_index,
        direction: transfer.to_address === wallet ? "received" : "sent",
        counterparty:
          transfer.to_address === wallet
            ? transfer.from_address
            : transfer.to_address,
        amount: transfer.value,
        blockNumber: transfer.block_number.toString(),
        blockTimestamp: transfer.block_timestamp,
      })),
    };
  }

  private loadLaunchRows(chainId: number): LaunchRow[] {
    const since = new Date(
      this.clock().getTime() - 24 * 60 * 60 * 1_000,
    ).toISOString();
    const rows = this.database.db
      .prepare(
        `SELECT
           l.chain_id,
           l.token_address,
           t.name,
           t.symbol,
           t.metadata_uri,
           t.metadata_hash,
           t.image_url,
           t.description,
           l.creator_address,
           l.creator_allocation_bps,
           l.creator_allocation,
           l.vesting_vault_address,
           l.pool_address,
           l.locker_address,
           l.lp_token_address,
           t.total_supply,
           p.native_reserve AS actual_liquidity_native,
           l.created_at,
           l.created_block,
           l.transaction_hash,
           CASE WHEN EXISTS (
             SELECT 1 FROM creator_social_proofs sp
             WHERE sp.chain_id = l.chain_id
               AND sp.creator_address = l.creator_address
               AND sp.expires_at > ?
           ) THEN 1 ELSE 0 END AS social_verified,
           (
             SELECT COUNT(*) FROM holder_balances hb
             WHERE hb.chain_id = l.chain_id
               AND hb.token_address = l.token_address
               AND hb.category = 'ordinary'
               AND hb.balance != '0'
           ) AS unique_holders,
           (
             SELECT COUNT(*) FROM trades tr
             WHERE tr.chain_id = l.chain_id
               AND tr.token_address = l.token_address
               AND tr.block_timestamp >= ?
           ) AS recent_trades,
           (
             SELECT COUNT(DISTINCT tr.trader_address) FROM trades tr
             WHERE tr.chain_id = l.chain_id
               AND tr.token_address = l.token_address
               AND tr.side = 'buy'
               AND tr.block_timestamp >= ?
           ) AS recent_buyers,
           (
             SELECT NULLIF(
               json_group_array(tr.native_amount), '[]'
             ) FROM trades tr
             WHERE tr.chain_id = l.chain_id
               AND tr.token_address = l.token_address
               AND tr.block_timestamp >= ?
           ) AS recent_volume_native,
           (
             SELECT rf.value FROM risk_facts rf
             WHERE rf.chain_id = l.chain_id
               AND rf.token_address = l.token_address
               AND rf.fact_key = 'top-ten-concentration'
           ) AS top_ten_bps
         FROM launches l
         JOIN tokens t
           ON t.chain_id = l.chain_id AND t.address = l.token_address
         LEFT JOIN pools p
           ON p.chain_id = l.chain_id AND p.address = l.pool_address
         WHERE l.chain_id = ?`,
      )
      .all(this.clock().toISOString(), since, since, since, chainId) as (Omit<
      LaunchRow,
      "recent_volume_native"
    > & { recent_volume_native: string | null })[];
    return rows.map((row) => ({
      ...row,
      recent_volume_native:
        row.recent_volume_native == null
          ? null
          : sumJsonAmounts(row.recent_volume_native),
    }));
  }

  private sortLaunchRows(rows: LaunchRow[], sort: LaunchSort): LaunchRow[] {
    return [...rows].sort((left, right) => {
      switch (sort) {
        case "trending": {
          if (left.recent_trades !== right.recent_trades) {
            return right.recent_trades - left.recent_trades;
          }
          return compareBigIntStrings(
            right.recent_volume_native,
            left.recent_volume_native,
          );
        }
        case "buyers":
          if (left.recent_buyers !== right.recent_buyers) {
            return right.recent_buyers - left.recent_buyers;
          }
          break;
        case "liquidity": {
          const compared = compareBigIntStrings(
            right.actual_liquidity_native,
            left.actual_liquidity_native,
          );
          if (compared !== 0) return compared;
          break;
        }
        case "social":
          if (left.social_verified !== right.social_verified) {
            return right.social_verified - left.social_verified;
          }
          break;
        case "new":
          break;
      }
      if (left.created_block !== right.created_block) {
        return right.created_block - left.created_block;
      }
      return right.token_address.localeCompare(left.token_address);
    });
  }

  private mapLaunchSummary(row: LaunchRow) {
    const parsedConcentration = row.top_ten_bps?.match(/^(\d+) bps$/u);
    return {
      chainId: row.chain_id,
      tokenAddress: row.token_address,
      name: row.name,
      symbol: row.symbol,
      metadataUri: row.metadata_uri,
      metadataHash: row.metadata_hash,
      imageUrl: row.image_url,
      description: row.description,
      creatorAddress: row.creator_address,
      creatorAllocationBps: row.creator_allocation_bps,
      creatorAllocation: row.creator_allocation,
      vestingVaultAddress: row.vesting_vault_address,
      poolAddress: row.pool_address,
      lockerAddress: row.locker_address,
      lpTokenAddress: row.lp_token_address,
      actualLiquidityNative: row.actual_liquidity_native,
      uniqueHolders: row.unique_holders,
      recentVolumeNative: row.recent_volume_native,
      recentTrades: row.recent_trades,
      topTenOrdinaryHolderBps: parsedConcentration?.[1]
        ? Number(parsedConcentration[1])
        : null,
      createdAt: row.created_at,
      createdBlock: row.created_block.toString(),
      transactionHash: row.transaction_hash,
      socialOwnershipVerified: row.social_verified === 1,
    };
  }
}

function mapTrade(row: TradeRow) {
  return {
    chainId: row.chain_id,
    tokenAddress: row.token_address,
    poolAddress: row.pool_address,
    transactionHash: row.transaction_hash,
    logIndex: row.log_index,
    traderAddress: row.trader_address,
    side: row.side,
    nativeAmount: row.native_amount,
    tokenAmount: row.token_amount,
    blockNumber: row.block_number.toString(),
    blockTimestamp: row.block_timestamp,
  };
}

function mapRisk(row: RiskRow) {
  const hasEvidence =
    row.evidence_contract_address != null ||
    row.evidence_transaction_hash != null ||
    row.evidence_block_number != null;
  return {
    key: row.fact_key,
    label: row.label,
    status: row.status,
    value: row.value,
    evidence: hasEvidence
      ? {
          ...(row.evidence_contract_address
            ? { contractAddress: row.evidence_contract_address }
            : {}),
          ...(row.evidence_transaction_hash
            ? { transactionHash: row.evidence_transaction_hash }
            : {}),
          ...(row.evidence_block_number
            ? { blockNumber: row.evidence_block_number }
            : {}),
        }
      : null,
    explanation: row.explanation,
  };
}

function calculateTradableSupply(
  totalSupply: string,
  holders: readonly HolderRow[],
): bigint {
  const excluded = holders
    .filter(
      (holder) =>
        holder.category === "zero" ||
        holder.category === "burn" ||
        holder.category === "vesting" ||
        holder.category === "pool" ||
        holder.category === "locker",
    )
    .reduce((sum, holder) => sum + BigInt(holder.balance), 0n);
  return BigInt(totalSupply) - excluded;
}

function calculateVesting(row: VestingRow, now: Date) {
  const total = BigInt(row.total_allocation);
  const claimed = BigInt(row.claimed);
  const start = new Date(row.created_at).getTime();
  const cliff = new Date(row.cliff_at).getTime();
  const end = new Date(row.fully_vested_at).getTime();
  const current = now.getTime();
  let vested = 0n;
  if (current >= end) {
    vested = total;
  } else if (current >= cliff && end > start) {
    vested =
      (total * BigInt(Math.max(0, current - start))) / BigInt(end - start);
  }
  if (vested > total) vested = total;
  const claimable = vested > claimed ? vested - claimed : 0n;
  const locked = total > claimed + claimable ? total - claimed - claimable : 0n;
  return {
    vaultAddress: row.vault_address,
    tokenAddress: row.token_address,
    creatorAddress: row.creator_address,
    totalAllocation: total.toString(),
    claimed: claimed.toString(),
    claimable: claimable.toString(),
    locked: locked.toString(),
    cliffAt: row.cliff_at,
    fullyVestedAt: row.fully_vested_at,
  };
}

function sumJsonAmounts(value: string): string {
  const parsed = JSON.parse(value) as unknown;
  if (
    !Array.isArray(parsed) ||
    parsed.some(
      (item) => typeof item !== "string" || !/^(0|[1-9]\d*)$/u.test(item),
    )
  ) {
    throw new Error("Invalid indexed volume aggregate");
  }
  return parsed
    .reduce<bigint>((sum, item) => sum + BigInt(item as string), 0n)
    .toString();
}

function parseStringArray(value: string): string[] {
  const parsed = JSON.parse(value) as unknown;
  if (
    !Array.isArray(parsed) ||
    parsed.some((item) => typeof item !== "string")
  ) {
    throw new Error("Invalid mutable parameter list");
  }
  return parsed as string[];
}

function compareBigIntStrings(
  left: string | null,
  right: string | null,
): number {
  if (left == null && right == null) return 0;
  if (left == null) return -1;
  if (right == null) return 1;
  const leftBigInt = BigInt(left);
  const rightBigInt = BigInt(right);
  return leftBigInt === rightBigInt ? 0 : leftBigInt > rightBigInt ? 1 : -1;
}

function clampBps(value: bigint): number {
  if (value <= 0n) return 0;
  if (value >= 10_000n) return 10_000;
  return Number(value);
}

function encodeCursor(offset: number): string {
  return Buffer.from(offset.toString(), "utf8").toString("base64url");
}

function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    if (!/^(0|[1-9]\d*)$/u.test(decoded)) return 0;
    const offset = Number(decoded);
    return Number.isSafeInteger(offset) ? offset : 0;
  } catch {
    return 0;
  }
}
