import { serve } from "@hono/node-server";
import { resolve } from "node:path";
import { z } from "zod";

import { createApi } from "./api.js";
import { IndexerDatabase } from "./database.js";
import { IndexerService } from "./indexer.js";
import { ForgeRpcBlockSource } from "./onchain.js";
import { IndexerPoller } from "./poller.js";
import { trustedProxyIpKey } from "./rate-limit.js";
import { LocalUploadStore } from "./upload.js";

const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/u);
const optionalFinalityTag = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.enum(["latest", "safe", "finalized"]).optional(),
);
const environmentSchema = z.object({
  INDEXER_DATABASE_PATH: z.string().min(1).default(".data/indexer.sqlite"),
  INDEXER_PORT: z.coerce.number().int().min(1).max(65_535).default(8787),
  INDEXER_SOURCE: z
    .enum(["onchain-indexer", "local-fixture"])
    .default("onchain-indexer"),
  INDEXER_CORS_ORIGIN: z.url().default("http://localhost:5173"),
  INDEXER_UPLOAD_DIRECTORY: z.string().min(1).default(".data/uploads"),
  INDEXER_PUBLIC_BASE_URL: z.url().optional(),
  INDEXER_CHAIN_ID: z.coerce.number().int().positive().optional(),
  INDEXER_RPC_URL: z.url().optional(),
  INDEXER_FACTORY_ADDRESS: addressSchema.optional(),
  INDEXER_START_BLOCK: z
    .string()
    .regex(/^(0|[1-9]\d*)$/u)
    .default("0"),
  INDEXER_FINALITY_TAG: optionalFinalityTag,
  INDEXER_POOL_EVENT_KIND: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.enum(["local", "v2"]).optional(),
  ),
  INDEXER_POLL_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(60_000)
    .default(1_000),
  INDEXER_RATE_LIMIT_PER_MINUTE: z.coerce
    .number()
    .int()
    .min(10)
    .max(10_000)
    .default(600),
  INDEXER_TRUSTED_PROXY_IP_HEADER: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.enum(["cf-connecting-ip", "x-real-ip"]).optional(),
  ),
});

const environment = environmentSchema.parse(process.env);
const database = new IndexerDatabase(
  resolve(process.cwd(), environment.INDEXER_DATABASE_PATH),
  { source: environment.INDEXER_SOURCE },
);
const indexer = new IndexerService(database);
const baseUrl =
  environment.INDEXER_PUBLIC_BASE_URL ??
  `http://localhost:${environment.INDEXER_PORT.toString()}`;
const uploads = new LocalUploadStore(
  resolve(process.cwd(), environment.INDEXER_UPLOAD_DIRECTORY),
  baseUrl,
);
const app = createApi({
  database,
  indexer,
  uploads,
  corsOrigin: environment.INDEXER_CORS_ORIGIN,
  ...(environment.INDEXER_CHAIN_ID
    ? { defaultChainId: environment.INDEXER_CHAIN_ID }
    : {}),
  rateLimit: {
    limit: environment.INDEXER_RATE_LIMIT_PER_MINUTE,
    windowMs: 60_000,
    ...(environment.INDEXER_TRUSTED_PROXY_IP_HEADER
      ? {
          key: trustedProxyIpKey(environment.INDEXER_TRUSTED_PROXY_IP_HEADER),
        }
      : {}),
  },
});

const server = serve({
  fetch: app.fetch,
  port: environment.INDEXER_PORT,
});

const rpcSettings = [
  environment.INDEXER_CHAIN_ID,
  environment.INDEXER_RPC_URL,
  environment.INDEXER_FACTORY_ADDRESS,
];
const configuredRpcSettings = rpcSettings.filter(
  (value) => value !== undefined,
).length;
if (
  configuredRpcSettings !== 0 &&
  configuredRpcSettings !== rpcSettings.length
) {
  server.close();
  database.close();
  throw new Error(
    "INDEXER_CHAIN_ID, INDEXER_RPC_URL and INDEXER_FACTORY_ADDRESS must be configured together",
  );
}

const pollingAbort = new AbortController();
if (
  environment.INDEXER_CHAIN_ID &&
  environment.INDEXER_RPC_URL &&
  environment.INDEXER_FACTORY_ADDRESS
) {
  const chainId = environment.INDEXER_CHAIN_ID;
  const source = new ForgeRpcBlockSource({
    rpcUrl: environment.INDEXER_RPC_URL,
    chainId,
    factoryAddress: environment.INDEXER_FACTORY_ADDRESS,
    ...(environment.INDEXER_POOL_EVENT_KIND
      ? { poolEventKind: environment.INDEXER_POOL_EVENT_KIND }
      : {}),
    metadataBaseUrl: new URL("uploads/", `${baseUrl}/`).toString(),
    trackedContracts: () => {
      const tokens = database.db
        .prepare("SELECT address FROM tokens WHERE chain_id = ?")
        .all(chainId) as { address: string }[];
      const pools = database.db
        .prepare(`SELECT address, token_address FROM pools WHERE chain_id = ?`)
        .all(chainId) as {
        address: string;
        token_address: string;
      }[];
      const vaults = database.db
        .prepare(
          `SELECT vesting_vault_address AS address
           FROM launches WHERE chain_id = ?`,
        )
        .all(chainId) as { address: string }[];
      return {
        tokens: tokens.map((row) => row.address),
        pools: new Map(pools.map((row) => [row.address, row.token_address])),
        vaults: vaults.map((row) => row.address),
      };
    },
  });
  const hydrateMetadata = async (): Promise<void> => {
    const now = Date.now();
    for (const pending of indexer.getPendingLaunchMetadata(
      chainId,
      5,
      new Date(now),
    )) {
      const metadata = await source.readCommittedMetadata(
        pending.metadataUri,
        pending.metadataHash,
        pending.name,
        pending.symbol,
      );
      if (metadata) {
        indexer.hydrateLaunchMetadata(pending, {
          imageUrl: metadata.image,
          description: metadata.description,
        });
        continue;
      }

      const attempts = pending.attempts + 1;
      const delay = Math.min(60_000, 1_000 * 2 ** Math.min(attempts, 6));
      indexer.deferLaunchMetadata(pending, new Date(now + delay));
    }
  };
  const poller = new IndexerPoller(indexer, source, {
    chainId,
    startBlock: BigInt(environment.INDEXER_START_BLOCK),
    finalityTag:
      environment.INDEXER_FINALITY_TAG ??
      (chainId === 91_342 ? "safe" : "latest"),
    intervalMs: environment.INDEXER_POLL_INTERVAL_MS,
    afterCycle: hydrateMetadata,
  });
  void poller.run(pollingAbort.signal).catch((error: unknown) => {
    indexer.recordFailure(chainId, error);
  });
}

const shutdown = (): void => {
  pollingAbort.abort();
  server.close(() => {
    database.close();
    process.exitCode = 0;
  });
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
