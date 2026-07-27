import {
  type BlockEnvelope,
  type DecodedEvent,
  type RawChainLog,
  ZERO_ADDRESS,
} from "../src/types.js";

export const CHAIN_ID = 31_337;
export const FACTORY = address(1);
export const TOKEN = address(2);
export const CREATOR = address(3);
export const VAULT = address(4);
export const POOL = address(5);
export const LOCKER = address(6);
export const LP_TOKEN = address(7);
export const CONFIG = address(8);
export const OPERATOR = address(9);
export const ADAPTER = address(10);
export const ALICE = address(11);
export const BOB = address(12);

export function address(value: number): string {
  return `0x${value.toString(16).padStart(40, "0")}`;
}

export function hash(value: number): string {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

export function launchEvent(
  overrides: Partial<Extract<DecodedEvent, { type: "LaunchCreated" }>> = {},
): Extract<DecodedEvent, { type: "LaunchCreated" }> {
  return {
    type: "LaunchCreated",
    factoryAddress: FACTORY,
    tokenAddress: TOKEN,
    creatorAddress: CREATOR,
    name: "커뮤니티",
    symbol: "COMM",
    metadataUri: "https://metadata.example/token.json",
    metadataHash: hash(44),
    imageUrl: "https://metadata.example/token.png",
    description: "검증 가능한 커뮤니티 테스트 토큰",
    totalSupply: "1000",
    creatorAllocationBps: 1_000,
    creatorAllocation: "100",
    vestingVaultAddress: VAULT,
    vestingCliffAt: "2026-01-02T00:00:00.000Z",
    vestingFullyVestedAt: "2026-01-31T00:00:00.000Z",
    poolAddress: POOL,
    lockerAddress: LOCKER,
    lpTokenAddress: LP_TOKEN,
    initialLiquidityNative: "1000000000000000000",
    protocolConfigAddress: CONFIG,
    operatorAddress: OPERATOR,
    mutableParameters: ["creationFee"],
    adapterAddress: ADAPTER,
    ...overrides,
  };
}

export function transferEvent(
  from: string,
  to: string,
  value: string,
  tokenAddress = TOKEN,
): Extract<DecodedEvent, { type: "Transfer" }> {
  return {
    type: "Transfer",
    tokenAddress,
    from,
    to,
    value,
  };
}

export function launchBlock(
  options: {
    readonly blockHash?: string;
    readonly totalSupply?: string;
    readonly creatorAllocation?: string;
    readonly poolAllocation?: string;
    readonly extraEvents?: readonly DecodedEvent[];
  } = {},
): BlockEnvelope {
  const totalSupply = options.totalSupply ?? "1000";
  const creatorAllocation = options.creatorAllocation ?? "100";
  const poolAllocation = options.poolAllocation ?? "900";
  return block(
    1,
    [
      transferEvent(ZERO_ADDRESS, FACTORY, totalSupply),
      transferEvent(FACTORY, VAULT, creatorAllocation),
      transferEvent(FACTORY, POOL, poolAllocation),
      launchEvent({
        totalSupply,
        creatorAllocation,
      }),
      ...(options.extraEvents ?? []),
    ],
    {
      ...(options.blockHash ? { blockHash: options.blockHash } : {}),
      parentHash: hash(0),
    },
  );
}

export function block(
  blockNumber: number,
  events: readonly DecodedEvent[],
  options: {
    readonly blockHash?: string;
    readonly parentHash?: string;
    readonly timestamp?: string;
    readonly reverseLogs?: boolean;
  } = {},
): BlockEnvelope {
  const blockHash = options.blockHash ?? hash(1_000 + blockNumber);
  const timestamp =
    options.timestamp ?? new Date(Date.UTC(2026, 0, blockNumber)).toISOString();
  const logs = events.map((event, index) =>
    rawLog({
      blockNumber,
      blockHash,
      timestamp,
      event,
      logIndex: index,
      transactionHash: hash(blockNumber * 1_000 + index),
    }),
  );
  return {
    chainId: CHAIN_ID,
    number: BigInt(blockNumber),
    hash: blockHash,
    parentHash:
      options.parentHash ??
      (blockNumber === 0 ? hash(0) : hash(1_000 + blockNumber - 1)),
    timestamp,
    logs: options.reverseLogs ? logs.reverse() : logs,
  };
}

export function rawLog(options: {
  readonly blockNumber: number;
  readonly blockHash: string;
  readonly timestamp: string;
  readonly event: DecodedEvent;
  readonly logIndex: number;
  readonly transactionHash: string;
}): RawChainLog {
  return {
    chainId: CHAIN_ID,
    blockNumber: BigInt(options.blockNumber),
    blockHash: options.blockHash,
    transactionHash: options.transactionHash,
    transactionIndex: 0,
    logIndex: options.logIndex,
    address: FACTORY,
    topics: [],
    data: "0x",
    blockTimestamp: options.timestamp,
    decoded: options.event,
  };
}
