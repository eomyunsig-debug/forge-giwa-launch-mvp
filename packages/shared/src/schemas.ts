import { z } from "zod";

export const addressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "올바른 EVM 주소가 아닙니다.");

export const chainIdSchema = z.number().int().positive();
export const bigintStringSchema = z.string().regex(/^(0|[1-9]\d*)$/);
export const signedBigintStringSchema = z.string().regex(/^-?(0|[1-9]\d*)$/);
export const hashSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
export const nonZeroHashSchema = hashSchema.refine(
  (value) => value.toLowerCase() !== `0x${"0".repeat(64)}`,
  "빈 콘텐츠 해시는 사용할 수 없습니다.",
);
export const nullableMetricSchema = z.union([bigintStringSchema, z.null()]);

export const dataMetaSchema = z.object({
  chainId: chainIdSchema,
  source: z.enum(["onchain-indexer", "local-fixture"]),
  indexedBlock: bigintStringSchema.nullable(),
  indexedBlockHash: hashSchema.nullable(),
  updatedAt: z.iso.datetime().nullable(),
  status: z.enum(["synced", "lagging", "starting", "error"]),
  error: z.string().nullable(),
});

export const riskFactStatusSchema = z.enum([
  "confirmed",
  "recorded-confirmed",
  "not-applicable",
  "caution",
  "high-concentration",
  "unverifiable",
  "collecting",
]);

export const riskFactSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  status: riskFactStatusSchema,
  value: z.string().nullable(),
  evidence: z
    .object({
      contractAddress: addressSchema.optional(),
      transactionHash: hashSchema.optional(),
      blockNumber: bigintStringSchema.optional(),
    })
    .nullable(),
  explanation: z.string().min(1),
});

export const launchSummarySchema = z.object({
  chainId: chainIdSchema,
  tokenAddress: addressSchema,
  name: z.string().min(1),
  symbol: z.string().min(1),
  metadataUri: z.string(),
  metadataHash: hashSchema,
  imageUrl: z.url().nullable(),
  description: z.string().nullable(),
  creatorAddress: addressSchema,
  creatorAllocationBps: z.number().int().min(0).max(10_000),
  creatorAllocation: bigintStringSchema,
  vestingVaultAddress: addressSchema,
  poolAddress: addressSchema,
  lockerAddress: addressSchema,
  lpTokenAddress: addressSchema,
  actualLiquidityNative: bigintStringSchema.nullable(),
  uniqueHolders: z.number().int().nonnegative().nullable(),
  recentVolumeNative: bigintStringSchema.nullable(),
  recentTrades: z.number().int().nonnegative().nullable(),
  topTenOrdinaryHolderBps: z.number().int().min(0).max(10_000).nullable(),
  createdAt: z.iso.datetime(),
  createdBlock: bigintStringSchema,
  transactionHash: hashSchema,
  socialOwnershipVerified: z.boolean(),
});

export const holderBucketSchema = z.object({
  address: addressSchema,
  category: z.enum(["ordinary", "pool", "locker", "vesting", "burn", "zero"]),
  balance: bigintStringSchema,
  circulatingShareBps: z.number().int().min(0).max(10_000).nullable(),
});

export const tradeSchema = z.object({
  chainId: chainIdSchema,
  tokenAddress: addressSchema,
  poolAddress: addressSchema,
  transactionHash: hashSchema,
  logIndex: z.number().int().nonnegative(),
  traderAddress: addressSchema,
  side: z.enum(["buy", "sell"]),
  nativeAmount: bigintStringSchema,
  tokenAmount: bigintStringSchema,
  blockNumber: bigintStringSchema,
  blockTimestamp: z.iso.datetime(),
});

export const vestingScheduleSchema = z.object({
  vaultAddress: addressSchema,
  tokenAddress: addressSchema,
  creatorAddress: addressSchema,
  totalAllocation: bigintStringSchema,
  claimed: bigintStringSchema,
  claimable: bigintStringSchema,
  locked: bigintStringSchema,
  cliffAt: z.iso.datetime(),
  fullyVestedAt: z.iso.datetime(),
});

export const launchDetailSchema = launchSummarySchema.extend({
  totalSupply: bigintStringSchema,
  circulatingSupply: bigintStringSchema.nullable(),
  holders: z.array(holderBucketSchema),
  trades: z.array(tradeSchema),
  vesting: vestingScheduleSchema,
  riskFacts: z.array(riskFactSchema),
  admin: z.object({
    protocolConfigAddress: addressSchema,
    operatorAddress: addressSchema,
    proxyUpgradeable: z.boolean().nullable(),
    mutableParameters: z.array(z.string()),
  }),
});

export const apiEnvelope = <T extends z.ZodType>(data: T) =>
  z.object({
    data,
    meta: dataMetaSchema,
  });

export const createLaunchInputSchema = z.object({
  name: z.string().trim().min(1).max(40),
  symbol: z
    .string()
    .trim()
    .min(2)
    .max(10)
    .regex(/^[A-Z][A-Z0-9]*$/),
  description: z.string().trim().min(1).max(500),
  imageUrl: z.url(),
  metadataUri: z.url().max(256),
  metadataHash: nonZeroHashSchema,
  socialUrl: z
    .url()
    .refine((value) => value.startsWith("https://"))
    .optional(),
  creatorAllocationBps: z.number().int().min(0).max(1_000),
  nativeLiquidityWei: bigintStringSchema.refine((value) => BigInt(value) > 0n),
});

export type DataMeta = z.infer<typeof dataMetaSchema>;
export type RiskFact = z.infer<typeof riskFactSchema>;
export type LaunchSummary = z.infer<typeof launchSummarySchema>;
export type LaunchDetail = z.infer<typeof launchDetailSchema>;
export type Trade = z.infer<typeof tradeSchema>;
export type VestingSchedule = z.infer<typeof vestingScheduleSchema>;
export type CreateLaunchInput = z.infer<typeof createLaunchInputSchema>;
