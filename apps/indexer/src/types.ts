import { z } from "zod";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
export const DEAD_ADDRESS = "0x000000000000000000000000000000000000dead";

const addressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/)
  .transform((value) => value.toLowerCase());
const hashSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/)
  .transform((value) => value.toLowerCase());
const amountSchema = z.string().regex(/^(0|[1-9]\d*)$/);
const isoDateSchema = z.iso.datetime({ offset: true });

const eventBaseSchema = z.object({
  type: z.string(),
});

export const launchCreatedEventSchema = eventBaseSchema.extend({
  type: z.literal("LaunchCreated"),
  factoryAddress: addressSchema,
  tokenAddress: addressSchema,
  creatorAddress: addressSchema,
  name: z.string().min(1).max(80),
  symbol: z.string().min(1).max(20),
  metadataUri: z.string().max(512),
  metadataHash: hashSchema,
  imageUrl: z.url().nullable().default(null),
  description: z.string().max(2_000).nullable().default(null),
  totalSupply: amountSchema,
  creatorAllocationBps: z.number().int().min(0).max(1_000),
  creatorAllocation: amountSchema,
  vestingVaultAddress: addressSchema,
  vestingCliffAt: isoDateSchema,
  vestingFullyVestedAt: isoDateSchema,
  poolAddress: addressSchema,
  lockerAddress: addressSchema,
  lpTokenAddress: addressSchema,
  initialLiquidityNative: amountSchema,
  protocolConfigAddress: addressSchema,
  operatorAddress: addressSchema,
  mutableParameters: z.array(z.string().max(80)).default([]),
  adapterAddress: addressSchema,
});

export const transferEventSchema = eventBaseSchema.extend({
  type: z.literal("Transfer"),
  tokenAddress: addressSchema,
  from: addressSchema,
  to: addressSchema,
  value: amountSchema,
});

export const tradeExecutedEventSchema = eventBaseSchema.extend({
  type: z.literal("TradeExecuted"),
  tokenAddress: addressSchema,
  poolAddress: addressSchema,
  traderAddress: addressSchema,
  side: z.enum(["buy", "sell"]),
  nativeAmount: amountSchema,
  tokenAmount: amountSchema,
  nativeReserve: amountSchema.optional(),
  tokenReserve: amountSchema.optional(),
});

export const vestingClaimedEventSchema = eventBaseSchema.extend({
  type: z.literal("VestingClaimed"),
  vaultAddress: addressSchema,
  tokenAddress: addressSchema,
  creatorAddress: addressSchema,
  amount: amountSchema,
});

export const liquidityUpdatedEventSchema = eventBaseSchema.extend({
  type: z.literal("LiquidityUpdated"),
  tokenAddress: addressSchema,
  poolAddress: addressSchema,
  nativeReserve: amountSchema,
  tokenReserve: amountSchema,
});

export const creatorSocialVerifiedEventSchema = eventBaseSchema.extend({
  type: z.literal("CreatorSocialVerified"),
  creatorAddress: addressSchema,
  platform: z.enum(["x", "discord", "website"]),
  handle: z.string().min(1).max(256),
  proofUrl: z.url(),
  proofHash: hashSchema,
  expiresAt: isoDateSchema,
});

export const contractSourceStatusEventSchema = eventBaseSchema.extend({
  type: z.literal("ContractSourceStatus"),
  contractAddress: addressSchema,
  verified: z.boolean(),
  explorerUrl: z.url().nullable(),
});

export const moderationReportEventSchema = eventBaseSchema.extend({
  type: z.literal("ModerationReport"),
  tokenAddress: addressSchema,
  reporterAddress: addressSchema,
  reason: z.enum(["spam", "impersonation", "malicious-link", "other"]),
  detailsHash: hashSchema.nullable(),
});

export const decodedEventSchema = z.discriminatedUnion("type", [
  launchCreatedEventSchema,
  transferEventSchema,
  tradeExecutedEventSchema,
  vestingClaimedEventSchema,
  liquidityUpdatedEventSchema,
  creatorSocialVerifiedEventSchema,
  contractSourceStatusEventSchema,
  moderationReportEventSchema,
]);

export type DecodedEvent = z.infer<typeof decodedEventSchema>;

export interface RawChainLog {
  readonly chainId: number;
  readonly blockNumber: bigint;
  readonly blockHash: string;
  readonly transactionHash: string;
  readonly transactionIndex?: number;
  readonly logIndex: number;
  readonly address: string;
  readonly topics: readonly string[];
  readonly data: string;
  readonly blockTimestamp: string;
  readonly decoded?: DecodedEvent;
}

export interface BlockEnvelope {
  readonly chainId: number;
  readonly number: bigint;
  readonly hash: string;
  readonly parentHash: string;
  readonly timestamp: string;
  readonly logs: readonly RawChainLog[];
}

export interface LogDecoder {
  decode(log: RawChainLog): DecodedEvent | null;
}

export class EmbeddedEventDecoder implements LogDecoder {
  decode(log: RawChainLog): DecodedEvent | null {
    return log.decoded ? decodedEventSchema.parse(log.decoded) : null;
  }
}

export interface RpcBlockSource {
  getBlock(chainId: number, blockNumber: bigint): Promise<BlockEnvelope>;
}

export type IndexerSource = "onchain-indexer" | "local-fixture";

export interface IndexerCheckpoint {
  readonly chainId: number;
  readonly blockNumber: string | null;
  readonly blockHash: string | null;
  readonly updatedAt: string | null;
  readonly status: "synced" | "lagging" | "starting" | "error";
  readonly error: string | null;
}

export interface IndexerOptions {
  readonly source?: IndexerSource;
  readonly clock?: () => Date;
}

export function normalizeAddress(value: string): string {
  return addressSchema.parse(value);
}

export function normalizeHash(value: string): string {
  return hashSchema.parse(value);
}

export function parseDecodedEvent(value: unknown): DecodedEvent {
  return decodedEventSchema.parse(value);
}

export function serializeDecodedEvent(value: DecodedEvent): string {
  return JSON.stringify(value);
}

export function deserializeDecodedEvent(value: string): DecodedEvent {
  return decodedEventSchema.parse(JSON.parse(value) as unknown);
}
