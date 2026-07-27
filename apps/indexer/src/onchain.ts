import { createHash } from "node:crypto";

import { z } from "zod";
import {
  createPublicClient,
  decodeEventLog,
  getAddress,
  http,
  parseAbi,
  type Address,
  type Hash,
  type Log,
  type PublicClient,
} from "viem";

import {
  type BlockEnvelope,
  type DecodedEvent,
  normalizeAddress,
  normalizeHash,
  type RawChainLog,
  type RpcBlockSource,
} from "./types.js";

const factoryAbi = parseAbi([
  "event LaunchCreated(uint256 indexed launchId,address indexed token,address indexed creator,address vestingVault,address liquidityLocker,address adapter,address pool,address lpAsset,uint256 lpPositionId,uint256 lpPrincipal,uint16 creatorAllocationBps,uint256 creatorAllocation,uint256 initialTokenLiquidity,uint256 initialNativeLiquidity,uint256 creationFeePaid,bytes32 metadataHash,string metadataURI)",
  "function config() view returns (address)",
]);
const tokenAbi = parseAbi([
  "event Transfer(address indexed from,address indexed to,uint256 value)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function totalSupply() view returns (uint256)",
]);
const vestingAbi = parseAbi([
  "event CreatorTokensClaimed(address indexed creator,address indexed token,uint256 amount,uint256 totalReleased)",
  "function cliff() view returns (uint48)",
  "function end() view returns (uint48)",
]);
const configAbi = parseAbi(["function admin() view returns (address)"]);
const localPoolAbi = parseAbi([
  "event Swap(address indexed recipient,bool indexed nativeToToken,uint256 amountIn,uint256 amountOut,uint256 tokenReserve,uint256 nativeReserve)",
  "event ReservesSynced(uint256 tokenReserve,uint256 nativeReserve)",
]);

const metadataSchema = z.object({
  name: z.string().trim().min(1).max(40),
  symbol: z
    .string()
    .trim()
    .min(2)
    .max(10)
    .regex(/^[A-Z][A-Z0-9]*$/u),
  description: z.string().trim().min(1).max(500),
  image: z.url(),
});

export interface TrackedContracts {
  readonly tokens: readonly string[];
  readonly pools: ReadonlyMap<string, string>;
  readonly vaults: readonly string[];
}

export interface ForgeRpcBlockSourceOptions {
  readonly rpcUrl: string;
  readonly chainId: number;
  readonly factoryAddress: string;
  readonly trackedContracts: () => TrackedContracts;
  readonly metadataBaseUrl?: string;
  readonly client?: PublicClient;
}

export type FinalityTag = "latest" | "safe" | "finalized";

/**
 * Reads canonical Forge events from an HTTP JSON-RPC endpoint.
 *
 * The source first discovers LaunchCreated events for the block, then performs
 * a second address-filtered log request that includes newly-created token,
 * pool and vault addresses. This captures constructor Transfers that occur
 * before LaunchCreated without scanning every unrelated log on the chain.
 */
export class ForgeRpcBlockSource implements RpcBlockSource {
  readonly client: PublicClient;
  readonly chainId: number;
  readonly factoryAddress: Address;
  private readonly trackedContracts: () => TrackedContracts;
  private readonly metadataBaseUrl: URL | null;

  constructor(options: ForgeRpcBlockSourceOptions) {
    this.chainId = options.chainId;
    this.factoryAddress = getAddress(options.factoryAddress);
    this.trackedContracts = options.trackedContracts;
    this.metadataBaseUrl = options.metadataBaseUrl
      ? new URL(options.metadataBaseUrl)
      : null;
    if (
      this.metadataBaseUrl &&
      this.metadataBaseUrl.protocol !== "https:" &&
      !(
        this.metadataBaseUrl.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(this.metadataBaseUrl.hostname)
      )
    ) {
      throw new Error("Metadata base URL must be HTTPS or localhost HTTP");
    }
    this.client =
      options.client ??
      createPublicClient({
        transport: http(options.rpcUrl, {
          timeout: 10_000,
          retryCount: 0,
        }),
      });
  }

  async assertChain(): Promise<void> {
    const actual = await this.client.getChainId();
    if (actual !== this.chainId) {
      throw new Error(
        `RPC chain ID mismatch: expected ${this.chainId.toString()}, received ${actual.toString()}`,
      );
    }
  }

  async getHeadBlockNumber(tag: FinalityTag): Promise<bigint> {
    const block = await this.client.getBlock({ blockTag: tag });
    return block.number;
  }

  async getCanonicalBlockHash(blockNumber: bigint): Promise<string> {
    const block = await this.client.getBlock({ blockNumber });
    return normalizeHash(block.hash);
  }

  async getBlock(chainId: number, blockNumber: bigint): Promise<BlockEnvelope> {
    if (chainId !== this.chainId) {
      throw new Error("Requested chain does not match configured RPC");
    }
    const block = await this.client.getBlock({
      blockNumber,
      includeTransactions: false,
    });

    const factoryLogs = await this.client.getLogs({
      address: this.factoryAddress,
      fromBlock: blockNumber,
      toBlock: blockNumber,
    });
    const launches = new Map<string, DecodedEvent>();
    const discoveredTokens = new Set<string>();
    const discoveredPools = new Map<string, string>();
    const discoveredVaults = new Set<string>();

    for (const log of factoryLogs) {
      const launch = await this.decodeLaunch(log, blockNumber);
      if (!launch) continue;
      launches.set(logIdentity(log), launch);
      if (launch.type === "LaunchCreated") {
        discoveredTokens.add(launch.tokenAddress);
        discoveredPools.set(launch.poolAddress, launch.tokenAddress);
        discoveredVaults.add(launch.vestingVaultAddress);
      }
    }

    const tracked = this.trackedContracts();
    const tokens = new Set(
      [...tracked.tokens, ...discoveredTokens].map(normalizeAddress),
    );
    const pools = new Map<string, string>();
    for (const [pool, token] of tracked.pools) {
      pools.set(normalizeAddress(pool), normalizeAddress(token));
    }
    for (const [pool, token] of discoveredPools) {
      pools.set(normalizeAddress(pool), normalizeAddress(token));
    }
    const vaults = new Set(
      [...tracked.vaults, ...discoveredVaults].map(normalizeAddress),
    );
    const addresses = Array.from(
      new Set([
        this.factoryAddress.toLowerCase(),
        ...tokens,
        ...pools.keys(),
        ...vaults,
      ]),
    ).map((address) => getAddress(address));
    const relevantLogs =
      addresses.length === 1
        ? factoryLogs
        : await this.client.getLogs({
            address: addresses,
            fromBlock: blockNumber,
            toBlock: blockNumber,
          });
    const merged = new Map<string, Log>();
    for (const log of [...factoryLogs, ...relevantLogs]) {
      merged.set(logIdentity(log), log);
    }

    const timestamp = new Date(Number(block.timestamp) * 1_000).toISOString();
    const logs: RawChainLog[] = [];
    for (const log of merged.values()) {
      const decoded =
        launches.get(logIdentity(log)) ??
        this.decodeTrackedLog(log, tokens, pools, vaults);
      if (!decoded) continue;
      if (
        log.blockHash == null ||
        log.blockNumber == null ||
        log.transactionHash == null ||
        log.logIndex == null
      ) {
        throw new Error("RPC returned a pending log for a canonical block");
      }
      logs.push({
        chainId,
        blockNumber: log.blockNumber,
        blockHash: normalizeHash(log.blockHash),
        transactionHash: normalizeHash(log.transactionHash),
        transactionIndex: log.transactionIndex ?? 0,
        logIndex: log.logIndex,
        address: normalizeAddress(log.address),
        topics: log.topics.map((topic) => normalizeHash(topic)),
        data: log.data,
        blockTimestamp: timestamp,
        decoded,
      });
    }
    logs.sort(
      (left, right) =>
        (left.transactionIndex ?? 0) - (right.transactionIndex ?? 0) ||
        left.logIndex - right.logIndex,
    );
    return {
      chainId,
      number: block.number,
      hash: normalizeHash(block.hash),
      parentHash: normalizeHash(block.parentHash),
      timestamp,
      logs,
    };
  }

  private async decodeLaunch(
    log: Log,
    blockNumber: bigint,
  ): Promise<DecodedEvent | null> {
    let decoded: ReturnType<typeof decodeEventLog<typeof factoryAbi>>;
    try {
      decoded = decodeEventLog({
        abi: factoryAbi,
        eventName: "LaunchCreated",
        data: log.data,
        topics: log.topics,
        strict: true,
      });
    } catch {
      return null;
    }
    const args = decoded.args;
    const tokenAddress = getAddress(args.token);
    const vestingVaultAddress = getAddress(args.vestingVault);
    const [name, symbol, totalSupply, cliff, end, configAddress] =
      await Promise.all([
        this.client.readContract({
          address: tokenAddress,
          abi: tokenAbi,
          functionName: "name",
          blockNumber,
        }),
        this.client.readContract({
          address: tokenAddress,
          abi: tokenAbi,
          functionName: "symbol",
          blockNumber,
        }),
        this.client.readContract({
          address: tokenAddress,
          abi: tokenAbi,
          functionName: "totalSupply",
          blockNumber,
        }),
        this.client.readContract({
          address: vestingVaultAddress,
          abi: vestingAbi,
          functionName: "cliff",
          blockNumber,
        }),
        this.client.readContract({
          address: vestingVaultAddress,
          abi: vestingAbi,
          functionName: "end",
          blockNumber,
        }),
        this.client.readContract({
          address: this.factoryAddress,
          abi: factoryAbi,
          functionName: "config",
          blockNumber,
        }),
      ]);
    const operatorAddress = await this.client.readContract({
      address: configAddress,
      abi: configAbi,
      functionName: "admin",
      blockNumber,
    });
    const metadata = await this.readCommittedMetadata(
      args.metadataURI,
      args.metadataHash,
      name,
      symbol,
    );
    return {
      type: "LaunchCreated",
      factoryAddress: normalizeAddress(this.factoryAddress),
      tokenAddress: normalizeAddress(tokenAddress),
      creatorAddress: normalizeAddress(args.creator),
      name,
      symbol,
      metadataUri: args.metadataURI,
      metadataHash: normalizeHash(args.metadataHash),
      imageUrl: metadata?.image ?? null,
      description: metadata?.description ?? null,
      totalSupply: totalSupply.toString(),
      creatorAllocationBps: args.creatorAllocationBps,
      creatorAllocation: args.creatorAllocation.toString(),
      vestingVaultAddress: normalizeAddress(vestingVaultAddress),
      vestingCliffAt: unixSecondsToIso(cliff),
      vestingFullyVestedAt: unixSecondsToIso(end),
      poolAddress: normalizeAddress(args.pool),
      lockerAddress: normalizeAddress(args.liquidityLocker),
      lpTokenAddress: normalizeAddress(args.lpAsset),
      initialLiquidityNative: args.initialNativeLiquidity.toString(),
      protocolConfigAddress: normalizeAddress(configAddress),
      operatorAddress: normalizeAddress(operatorAddress),
      mutableParameters: ["creationFee", "feeRecipient", "adapterAllowlist"],
      adapterAddress: normalizeAddress(args.adapter),
    };
  }

  private decodeTrackedLog(
    log: Log,
    tokens: ReadonlySet<string>,
    pools: ReadonlyMap<string, string>,
    vaults: ReadonlySet<string>,
  ): DecodedEvent | null {
    const address = normalizeAddress(log.address);
    try {
      if (tokens.has(address)) {
        const decoded = decodeEventLog({
          abi: tokenAbi,
          eventName: "Transfer",
          data: log.data,
          topics: log.topics,
          strict: true,
        });
        return {
          type: "Transfer",
          tokenAddress: address,
          from: normalizeAddress(decoded.args.from),
          to: normalizeAddress(decoded.args.to),
          value: decoded.args.value.toString(),
        };
      }
      const poolToken = pools.get(address);
      if (poolToken) {
        try {
          const decoded = decodeEventLog({
            abi: localPoolAbi,
            eventName: "Swap",
            data: log.data,
            topics: log.topics,
            strict: true,
          });
          return {
            type: "TradeExecuted",
            tokenAddress: poolToken,
            poolAddress: address,
            traderAddress: normalizeAddress(decoded.args.recipient),
            side: decoded.args.nativeToToken ? "buy" : "sell",
            nativeAmount: (decoded.args.nativeToToken
              ? decoded.args.amountIn
              : decoded.args.amountOut
            ).toString(),
            tokenAmount: (decoded.args.nativeToToken
              ? decoded.args.amountOut
              : decoded.args.amountIn
            ).toString(),
            nativeReserve: decoded.args.nativeReserve.toString(),
            tokenReserve: decoded.args.tokenReserve.toString(),
          };
        } catch {
          const synced = decodeEventLog({
            abi: localPoolAbi,
            eventName: "ReservesSynced",
            data: log.data,
            topics: log.topics,
            strict: true,
          });
          return {
            type: "LiquidityUpdated",
            tokenAddress: poolToken,
            poolAddress: address,
            nativeReserve: synced.args.nativeReserve.toString(),
            tokenReserve: synced.args.tokenReserve.toString(),
          };
        }
      }
      if (vaults.has(address)) {
        const decoded = decodeEventLog({
          abi: vestingAbi,
          eventName: "CreatorTokensClaimed",
          data: log.data,
          topics: log.topics,
          strict: true,
        });
        return {
          type: "VestingClaimed",
          vaultAddress: address,
          tokenAddress: normalizeAddress(decoded.args.token),
          creatorAddress: normalizeAddress(decoded.args.creator),
          amount: decoded.args.amount.toString(),
        };
      }
    } catch {
      return null;
    }
    return null;
  }

  private async readCommittedMetadata(
    uri: string,
    expectedHash: Hash,
    tokenName: string,
    tokenSymbol: string,
  ): Promise<z.infer<typeof metadataSchema> | null> {
    if (!this.metadataBaseUrl) return null;
    let url: URL;
    try {
      url = new URL(uri);
    } catch {
      return null;
    }
    if (
      url.origin !== this.metadataBaseUrl.origin ||
      !url.pathname.startsWith(this.metadataBaseUrl.pathname)
    ) {
      return null;
    }
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(3_000),
      });
      if (!response.ok) return null;
      const declaredLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > 64 * 1024) {
        return null;
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > 64 * 1024) return null;
      const actualHash = `0x${createHash("sha256")
        .update(bytes)
        .digest("hex")}`.toLowerCase();
      if (actualHash !== expectedHash.toLowerCase()) return null;
      const parsed = metadataSchema.parse(
        JSON.parse(new TextDecoder().decode(bytes)) as unknown,
      );
      if (parsed.name !== tokenName || parsed.symbol !== tokenSymbol) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }
}

function logIdentity(log: Log): string {
  return `${log.transactionHash ?? ""}:${log.logIndex?.toString() ?? ""}`;
}

function unixSecondsToIso(value: bigint | number): string {
  const seconds = typeof value === "bigint" ? value : BigInt(value);
  if (seconds < 0n || seconds > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Timestamp is outside the safe JavaScript date range");
  }
  return new Date(Number(seconds) * 1_000).toISOString();
}
