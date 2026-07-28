import { type SqliteDatabase } from "./database.js";
import {
  DEAD_ADDRESS,
  deserializeDecodedEvent,
  type DecodedEvent,
  ZERO_ADDRESS,
} from "./types.js";

interface StoredLog {
  readonly chainId: number;
  readonly blockNumber: number;
  readonly blockHash: string;
  readonly transactionHash: string;
  readonly logIndex: number;
  readonly blockTimestamp: string;
}

interface ReplayRow {
  chain_id: number;
  block_number: number;
  block_hash: string;
  transaction_hash: string;
  log_index: number;
  block_timestamp: string;
  decoded_event_json: string;
}

interface BalanceRow {
  token_address: string;
  holder_address: string;
  balance: string;
}

interface TokenRow {
  address: string;
  total_supply: string;
}

interface SpecialAddressRow {
  pool_address: string;
  locker_address: string;
  vesting_vault_address: string;
}

interface CategoryBalanceRow {
  holder_address: string;
  balance: string;
  category: HolderCategory;
}

type HolderCategory =
  "ordinary" | "pool" | "locker" | "vesting" | "burn" | "zero";

type RiskStatus =
  | "confirmed"
  | "not-applicable"
  | "caution"
  | "high-concentration"
  | "unverifiable"
  | "collecting";

export class ProjectionEngine {
  constructor(private readonly db: SqliteDatabase) {}

  rebuild(chainId: number): void {
    const projectionTables = [
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
    for (const table of projectionTables) {
      this.db.prepare(`DELETE FROM ${table} WHERE chain_id = ?`).run(chainId);
    }

    const rows = this.db
      .prepare(
        `SELECT chain_id, block_number, block_hash, transaction_hash, log_index,
                block_timestamp, decoded_event_json
         FROM raw_logs
         WHERE chain_id = ? AND decoded_event_json IS NOT NULL
         ORDER BY block_number ASC, transaction_index ASC, log_index ASC`,
      )
      .all(chainId) as ReplayRow[];

    const replay = rows.map((row) => ({
      log: {
        chainId: row.chain_id,
        blockNumber: row.block_number,
        blockHash: row.block_hash,
        transactionHash: row.transaction_hash,
        logIndex: row.log_index,
        blockTimestamp: row.block_timestamp,
      } satisfies StoredLog,
      event: deserializeDecodedEvent(row.decoded_event_json),
    }));

    // Constructor transfers and AMM mint/Sync logs precede LaunchCreated in the
    // atomic launch transaction. Seed launch-owned entities first, then replay
    // every dependent event in canonical order. This changes no fund state;
    // it only makes projection foreign-key/order dependencies explicit.
    for (const item of replay) {
      if (item.event.type === "LaunchCreated") {
        this.apply(item.log, item.event);
      }
    }
    for (const item of replay) {
      if (item.event.type !== "LaunchCreated") {
        this.apply(item.log, item.event);
      }
    }
    this.recomputeDerivedFacts(chainId);
  }

  private apply(log: StoredLog, event: DecodedEvent): void {
    switch (event.type) {
      case "LaunchCreated": {
        this.db
          .prepare(
            `INSERT INTO creators
               (chain_id, address, launch_count, launches_with_liquidity, first_seen_at)
             VALUES (?, ?, 1, ?, ?)
             ON CONFLICT (chain_id, address) DO UPDATE SET
               launch_count = launch_count + 1`,
          )
          .run(
            log.chainId,
            event.creatorAddress,
            BigInt(event.initialLiquidityNative) > 0n ? 1 : 0,
            log.blockTimestamp,
          );
        this.db
          .prepare(
            `INSERT INTO tokens
               (chain_id, address, name, symbol, decimals, total_supply,
                metadata_uri, metadata_hash, image_url, description,
                creator_address, created_at, created_block, transaction_hash)
             VALUES (?, ?, ?, ?, 18, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            log.chainId,
            event.tokenAddress,
            event.name,
            event.symbol,
            event.totalSupply,
            event.metadataUri,
            event.metadataHash,
            event.imageUrl,
            event.description,
            event.creatorAddress,
            log.blockTimestamp,
            log.blockNumber,
            log.transactionHash,
          );
        this.db
          .prepare(
            `INSERT INTO launches
               (chain_id, token_address, factory_address, creator_address,
                creator_allocation_bps, creator_allocation, vesting_vault_address,
                pool_address, locker_address, lp_token_address,
                protocol_config_address, operator_address, adapter_address,
                mutable_parameters_json, created_at, created_block, transaction_hash)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            log.chainId,
            event.tokenAddress,
            event.factoryAddress,
            event.creatorAddress,
            event.creatorAllocationBps,
            event.creatorAllocation,
            event.vestingVaultAddress,
            event.poolAddress,
            event.lockerAddress,
            event.lpTokenAddress,
            event.protocolConfigAddress,
            event.operatorAddress,
            event.adapterAddress,
            JSON.stringify(event.mutableParameters),
            log.blockTimestamp,
            log.blockNumber,
            log.transactionHash,
          );
        this.db
          .prepare(
            `INSERT INTO pools
               (chain_id, address, token_address, adapter_address, native_reserve,
                token_reserve, last_updated_block)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            log.chainId,
            event.poolAddress,
            event.tokenAddress,
            event.adapterAddress,
            event.initialLiquidityNative,
            (
              BigInt(event.totalSupply) - BigInt(event.creatorAllocation)
            ).toString(),
            log.blockNumber,
          );
        this.db
          .prepare(
            `INSERT INTO liquidity_locks
               (chain_id, token_address, locker_address, lp_token_address,
                pool_address, principal_withdrawable, lock_kind, created_block)
             VALUES (?, ?, ?, ?, ?, 0, 'permanent-contract-no-withdrawal', ?)`,
          )
          .run(
            log.chainId,
            event.tokenAddress,
            event.lockerAddress,
            event.lpTokenAddress,
            event.poolAddress,
            log.blockNumber,
          );
        this.db
          .prepare(
            `INSERT INTO vesting_schedules
               (chain_id, vault_address, token_address, creator_address,
                total_allocation, claimed, cliff_at, fully_vested_at, created_block)
             VALUES (?, ?, ?, ?, ?, '0', ?, ?, ?)`,
          )
          .run(
            log.chainId,
            event.vestingVaultAddress,
            event.tokenAddress,
            event.creatorAddress,
            event.creatorAllocation,
            event.vestingCliffAt,
            event.vestingFullyVestedAt,
            log.blockNumber,
          );

        const contracts = [
          [event.factoryAddress, "factory"],
          [event.tokenAddress, "launch-token"],
          [event.vestingVaultAddress, "vesting-vault"],
          [event.poolAddress, "amm-pool"],
          [event.lockerAddress, "liquidity-locker"],
          [event.lpTokenAddress, "lp-token"],
          [event.protocolConfigAddress, "protocol-config"],
          [event.adapterAddress, "amm-adapter"],
        ] as const;
        const insertContract = this.db.prepare(
          `INSERT INTO contracts
             (chain_id, address, kind, launch_token_address, source_verified,
              explorer_url, created_block, transaction_hash)
           VALUES (?, ?, ?, ?, NULL, NULL, ?, ?)
           ON CONFLICT (chain_id, address) DO NOTHING`,
        );
        for (const [address, kind] of contracts) {
          insertContract.run(
            log.chainId,
            address,
            kind,
            event.tokenAddress,
            log.blockNumber,
            log.transactionHash,
          );
        }
        this.insertTemplateRiskFacts(log, event);
        break;
      }
      case "Transfer": {
        this.db
          .prepare(
            `INSERT INTO transfers
               (chain_id, token_address, transaction_hash, log_index,
                from_address, to_address, value, block_number, block_timestamp)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            log.chainId,
            event.tokenAddress,
            log.transactionHash,
            log.logIndex,
            event.from,
            event.to,
            event.value,
            log.blockNumber,
            log.blockTimestamp,
          );
        if (event.from !== ZERO_ADDRESS) {
          this.adjustBalance(
            log.chainId,
            event.tokenAddress,
            event.from,
            -BigInt(event.value),
            log.blockNumber,
          );
        }
        this.adjustBalance(
          log.chainId,
          event.tokenAddress,
          event.to,
          BigInt(event.value),
          log.blockNumber,
        );
        break;
      }
      case "TradeExecuted": {
        this.db
          .prepare(
            `INSERT INTO trades
               (chain_id, token_address, pool_address, transaction_hash, log_index,
                trader_address, side, native_amount, token_amount, block_number,
                block_timestamp)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            log.chainId,
            event.tokenAddress,
            event.poolAddress,
            log.transactionHash,
            log.logIndex,
            event.traderAddress,
            event.side,
            event.nativeAmount,
            event.tokenAmount,
            log.blockNumber,
            log.blockTimestamp,
          );
        if (
          event.nativeReserve !== undefined &&
          event.tokenReserve !== undefined
        ) {
          const updated = this.db
            .prepare(
              `UPDATE pools
               SET native_reserve = ?, token_reserve = ?, last_updated_block = ?
               WHERE chain_id = ? AND address = ? AND token_address = ?`,
            )
            .run(
              event.nativeReserve,
              event.tokenReserve,
              log.blockNumber,
              log.chainId,
              event.poolAddress,
              event.tokenAddress,
            );
          if (updated.changes !== 1) {
            throw new Error(`Unknown pool ${event.poolAddress}`);
          }
        }
        break;
      }
      case "VestingClaimed": {
        const row = this.db
          .prepare(
            `SELECT total_allocation AS totalAllocation, claimed
             FROM vesting_schedules
             WHERE chain_id = ? AND vault_address = ?`,
          )
          .get(log.chainId, event.vaultAddress) as
          { totalAllocation: string; claimed: string } | undefined;
        if (!row) {
          throw new Error(`Unknown vesting vault ${event.vaultAddress}`);
        }
        const claimed = BigInt(row.claimed) + BigInt(event.amount);
        if (claimed > BigInt(row.totalAllocation)) {
          throw new Error("Vesting claim exceeds the allocation");
        }
        this.db
          .prepare(
            `UPDATE vesting_schedules SET claimed = ?
             WHERE chain_id = ? AND vault_address = ?`,
          )
          .run(claimed.toString(), log.chainId, event.vaultAddress);
        break;
      }
      case "LiquidityUpdated": {
        const result = this.db
          .prepare(
            `UPDATE pools
             SET native_reserve = ?, token_reserve = ?, last_updated_block = ?
             WHERE chain_id = ? AND address = ? AND token_address = ?`,
          )
          .run(
            event.nativeReserve,
            event.tokenReserve,
            log.blockNumber,
            log.chainId,
            event.poolAddress,
            event.tokenAddress,
          );
        if (result.changes !== 1) {
          throw new Error(`Unknown pool ${event.poolAddress}`);
        }
        break;
      }
      case "CreatorSocialVerified": {
        this.db
          .prepare(
            `INSERT INTO creators
               (chain_id, address, launch_count, launches_with_liquidity, first_seen_at)
             VALUES (?, ?, 0, 0, ?)
             ON CONFLICT (chain_id, address) DO NOTHING`,
          )
          .run(log.chainId, event.creatorAddress, log.blockTimestamp);
        this.db
          .prepare(
            `INSERT INTO creator_social_proofs
               (chain_id, creator_address, platform, handle, proof_url, proof_hash,
                expires_at, verified_at, transaction_hash, log_index)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (chain_id, creator_address, platform) DO UPDATE SET
               handle = excluded.handle,
               proof_url = excluded.proof_url,
               proof_hash = excluded.proof_hash,
               expires_at = excluded.expires_at,
               verified_at = excluded.verified_at,
               transaction_hash = excluded.transaction_hash,
               log_index = excluded.log_index`,
          )
          .run(
            log.chainId,
            event.creatorAddress,
            event.platform,
            event.handle,
            event.proofUrl,
            event.proofHash,
            event.expiresAt,
            log.blockTimestamp,
            log.transactionHash,
            log.logIndex,
          );
        break;
      }
      case "ContractSourceStatus": {
        this.db
          .prepare(
            `UPDATE contracts
             SET source_verified = ?, explorer_url = ?
             WHERE chain_id = ? AND address = ?`,
          )
          .run(
            event.verified ? 1 : 0,
            event.explorerUrl,
            log.chainId,
            event.contractAddress,
          );
        break;
      }
      case "ModerationReport": {
        this.db
          .prepare(
            `INSERT INTO moderation_flags
               (chain_id, token_address, reporter_address, reason, details_hash,
                transaction_hash, log_index, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            log.chainId,
            event.tokenAddress,
            event.reporterAddress,
            event.reason,
            event.detailsHash,
            log.transactionHash,
            log.logIndex,
            log.blockTimestamp,
          );
        break;
      }
    }
  }

  private insertTemplateRiskFacts(
    log: StoredLog,
    event: Extract<DecodedEvent, { type: "LaunchCreated" }>,
  ): void {
    const immutableFacts = [
      [
        "additional-mint",
        "추가 민팅",
        "collecting",
        "검증 대기",
        "런치 이벤트는 수집했지만 배포 bytecode가 승인된 템플릿과 일치하는지 아직 확인하지 못했습니다.",
        event.tokenAddress,
      ],
      [
        "pause",
        "거래 일시정지",
        "collecting",
        "검증 대기",
        "배포 bytecode의 pause 기능 부재를 아직 독립적으로 확인하지 못했습니다.",
        event.tokenAddress,
      ],
      [
        "blacklist",
        "주소 블랙리스트",
        "collecting",
        "검증 대기",
        "배포 bytecode의 주소 차단 기능 부재를 아직 독립적으로 확인하지 못했습니다.",
        event.tokenAddress,
      ],
      [
        "transfer-tax",
        "전송세",
        "collecting",
        "검증 대기",
        "배포 bytecode와 실제 전송 동작을 확인하기 전에는 전송세가 없다고 단정하지 않습니다.",
        event.tokenAddress,
      ],
      [
        "proxy-upgrade",
        "프록시 업그레이드",
        "collecting",
        "검증 대기",
        "배포 bytecode의 proxy 또는 upgrade 경로 부재를 아직 독립적으로 확인하지 못했습니다.",
        event.tokenAddress,
      ],
      [
        "liquidity-lock",
        "유동성 잠금 방식",
        "collecting",
        "락커 주소 기록됨",
        "런치 이벤트에 락커 주소는 기록됐지만 LP 원금 잔액과 승인된 락커 bytecode를 아직 함께 확인하지 못했습니다.",
        event.lockerAddress,
      ],
      [
        "creator-allocation",
        "창작자 배정",
        "confirmed",
        `${event.creatorAllocationBps} bps`,
        "런치 트랜잭션에 기록된 창작자 배정 비율입니다.",
        event.vestingVaultAddress,
      ],
      [
        "admin-permissions",
        "관리자 권한",
        event.mutableParameters.length === 0 ? "not-applicable" : "caution",
        event.mutableParameters.length === 0
          ? "변경 항목 없음"
          : event.mutableParameters.join(", "),
        "ProtocolConfig에서 변경 가능한 항목만 표시합니다.",
        event.protocolConfigAddress,
      ],
    ] as const satisfies readonly (readonly [
      string,
      string,
      RiskStatus,
      string,
      string,
      string,
    ])[];
    for (const [
      key,
      label,
      status,
      value,
      explanation,
      contract,
    ] of immutableFacts) {
      this.upsertRisk(
        log.chainId,
        event.tokenAddress,
        key,
        label,
        status,
        value,
        explanation,
        contract,
        log.transactionHash,
        log.blockNumber.toString(),
        log.blockTimestamp,
      );
    }
  }

  private adjustBalance(
    chainId: number,
    tokenAddress: string,
    holderAddress: string,
    delta: bigint,
    blockNumber: number,
  ): void {
    const existing = this.db
      .prepare(
        `SELECT balance FROM holder_balances
         WHERE chain_id = ? AND token_address = ? AND holder_address = ?`,
      )
      .get(chainId, tokenAddress, holderAddress) as
      { balance: string } | undefined;
    const next = BigInt(existing?.balance ?? "0") + delta;
    if (next < 0n) {
      throw new Error(`Negative balance for ${tokenAddress}:${holderAddress}`);
    }
    this.db
      .prepare(
        `INSERT INTO holder_balances
           (chain_id, token_address, holder_address, balance, category, updated_block)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (chain_id, token_address, holder_address) DO UPDATE SET
           balance = excluded.balance,
           updated_block = excluded.updated_block`,
      )
      .run(
        chainId,
        tokenAddress,
        holderAddress,
        next.toString(),
        this.classifyAddress(holderAddress),
        blockNumber,
      );
  }

  private recomputeDerivedFacts(chainId: number): void {
    const balances = this.db
      .prepare(
        `SELECT token_address, holder_address, balance
         FROM holder_balances WHERE chain_id = ?`,
      )
      .all(chainId) as BalanceRow[];
    const specials = this.db
      .prepare(
        `SELECT token_address, pool_address, locker_address, vesting_vault_address
         FROM launches WHERE chain_id = ?`,
      )
      .all(chainId) as (SpecialAddressRow & { token_address: string })[];
    const specialByToken = new Map<
      string,
      { pool: string; locker: string; vesting: string }
    >();
    for (const special of specials) {
      specialByToken.set(special.token_address, {
        pool: special.pool_address,
        locker: special.locker_address,
        vesting: special.vesting_vault_address,
      });
    }

    const updateCategory = this.db.prepare(
      `UPDATE holder_balances SET category = ?
       WHERE chain_id = ? AND token_address = ? AND holder_address = ?`,
    );
    for (const balance of balances) {
      const special = specialByToken.get(balance.token_address);
      const category = this.classifyAddress(balance.holder_address, special);
      updateCategory.run(
        category,
        chainId,
        balance.token_address,
        balance.holder_address,
      );
    }

    const tokens = this.db
      .prepare("SELECT address, total_supply FROM tokens WHERE chain_id = ?")
      .all(chainId) as TokenRow[];
    const checkpoint = this.db
      .prepare(`SELECT updated_at FROM indexer_checkpoints WHERE chain_id = ?`)
      .get(chainId) as { updated_at: string | null } | undefined;
    const updatedAt = checkpoint?.updated_at ?? new Date(0).toISOString();

    for (const token of tokens) {
      const rows = this.db
        .prepare(
          `SELECT holder_address, balance, category
           FROM holder_balances
           WHERE chain_id = ? AND token_address = ? AND balance != '0'`,
        )
        .all(chainId, token.address) as CategoryBalanceRow[];
      const excludedFromTradableSupply = rows
        .filter(
          (row) =>
            row.category === "zero" ||
            row.category === "burn" ||
            row.category === "vesting" ||
            row.category === "pool" ||
            row.category === "locker",
        )
        .reduce((sum, row) => sum + BigInt(row.balance), 0n);
      const tradableSupply =
        BigInt(token.total_supply) - excludedFromTradableSupply;
      const topTen = rows
        .filter((row) => row.category === "ordinary")
        .map((row) => BigInt(row.balance))
        .sort((left, right) => (left === right ? 0 : left > right ? -1 : 1))
        .slice(0, 10)
        .reduce((sum, balance) => sum + balance, 0n);
      const concentrationBps =
        tradableSupply > 0n
          ? Number((topTen * 10_000n) / tradableSupply)
          : null;
      this.upsertRisk(
        chainId,
        token.address,
        "top-ten-concentration",
        "상위 10개 일반 지갑 집중도",
        concentrationBps == null
          ? "collecting"
          : concentrationBps > 5_000
            ? "high-concentration"
            : "confirmed",
        concentrationBps == null ? null : `${concentrationBps} bps`,
        "총공급량에서 pool, locker, vesting, burn, zero 주소 잔고를 제외한 거래 가능 일반 물량을 분모로 계산합니다.",
        token.address,
        null,
        null,
        updatedAt,
      );

      const pool = this.db
        .prepare(
          `SELECT address, native_reserve
           FROM pools WHERE chain_id = ? AND token_address = ?`,
        )
        .get(chainId, token.address) as
        { address: string; native_reserve: string | null } | undefined;
      this.upsertRisk(
        chainId,
        token.address,
        "actual-liquidity",
        "실제 유동성",
        pool?.native_reserve == null ? "collecting" : "confirmed",
        pool?.native_reserve ?? null,
        "마지막으로 인덱싱한 pool의 네이티브 자산 reserve입니다.",
        pool?.address ?? null,
        null,
        null,
        updatedAt,
      );

      const vesting = this.db
        .prepare(
          `SELECT vault_address, total_allocation, claimed
           FROM vesting_schedules
           WHERE chain_id = ? AND token_address = ?`,
        )
        .get(chainId, token.address) as
        | {
            vault_address: string;
            total_allocation: string;
            claimed: string;
          }
        | undefined;
      const locked = vesting
        ? BigInt(vesting.total_allocation) - BigInt(vesting.claimed)
        : null;
      this.upsertRisk(
        chainId,
        token.address,
        "creator-locked-balance",
        "잠긴 창작자 물량",
        locked == null ? "collecting" : "confirmed",
        locked?.toString() ?? null,
        "베스팅 총배정량에서 이미 claim한 물량을 뺀 값입니다.",
        vesting?.vault_address ?? null,
        null,
        null,
        updatedAt,
      );

      const source = this.db
        .prepare(
          `SELECT source_verified, explorer_url
           FROM contracts WHERE chain_id = ? AND address = ?`,
        )
        .get(chainId, token.address) as
        | { source_verified: number | null; explorer_url: string | null }
        | undefined;
      if (source?.source_verified == null) {
        this.db
          .prepare(
            `DELETE FROM risk_facts
             WHERE chain_id = ? AND token_address = ? AND fact_key = ?`,
          )
          .run(chainId, token.address, "contract-source");
      } else {
        this.upsertRisk(
          chainId,
          token.address,
          "contract-source",
          "컨트랙트 소스 검증",
          source.source_verified === 1 ? "confirmed" : "unverifiable",
          source.source_verified === 1 ? "검증됨" : "검증할 수 없음",
          "익스플로러가 보고한 해당 배포 주소의 소스 검증 상태입니다.",
          token.address,
          null,
          null,
          updatedAt,
        );
      }
    }

    this.db
      .prepare(
        `UPDATE creators
         SET launches_with_liquidity = (
           SELECT COUNT(*)
           FROM launches l
           JOIN pools p
             ON p.chain_id = l.chain_id AND p.address = l.pool_address
           WHERE l.chain_id = creators.chain_id
             AND l.creator_address = creators.address
             AND p.native_reserve IS NOT NULL
             AND p.native_reserve != '0'
         )
         WHERE chain_id = ?`,
      )
      .run(chainId);
  }

  private classifyAddress(
    address: string,
    special?: { pool: string; locker: string; vesting: string },
  ): HolderCategory {
    if (address === ZERO_ADDRESS) return "zero";
    if (address === DEAD_ADDRESS) return "burn";
    if (address === special?.pool) return "pool";
    if (address === special?.locker) return "locker";
    if (address === special?.vesting) return "vesting";
    return "ordinary";
  }

  private upsertRisk(
    chainId: number,
    tokenAddress: string,
    key: string,
    label: string,
    status: RiskStatus,
    value: string | null,
    explanation: string,
    contractAddress: string | null,
    transactionHash: string | null,
    blockNumber: string | null,
    updatedAt: string,
  ): void {
    this.db
      .prepare(
        `INSERT INTO risk_facts
           (chain_id, token_address, fact_key, label, status, value, explanation,
            evidence_contract_address, evidence_transaction_hash,
            evidence_block_number, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (chain_id, token_address, fact_key) DO UPDATE SET
           label = excluded.label,
           status = excluded.status,
           value = excluded.value,
           explanation = excluded.explanation,
           evidence_contract_address = excluded.evidence_contract_address,
           evidence_transaction_hash = excluded.evidence_transaction_hash,
           evidence_block_number = excluded.evidence_block_number,
           updated_at = excluded.updated_at`,
      )
      .run(
        chainId,
        tokenAddress,
        key,
        label,
        status,
        value,
        explanation,
        contractAddress,
        transactionHash,
        blockNumber,
        updatedAt,
      );
  }
}
