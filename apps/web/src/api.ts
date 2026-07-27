import {
  apiEnvelope,
  dataMetaSchema,
  launchDetailSchema,
  launchSummarySchema,
  type DataMeta,
  type LaunchDetail,
  type LaunchSummary,
} from "@forge/shared";
import { z } from "zod";

import { indexerUrl } from "./config";

const launchesEnvelope = apiEnvelope(z.array(launchSummarySchema));
const launchEnvelope = apiEnvelope(launchDetailSchema);

async function requestJson<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/json");
  if (!(init?.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${indexerUrl}${path}`, {
    ...init,
    headers,
  });
  if (!response.ok) {
    throw new Error(`INDEXER_HTTP_${response.status}`);
  }
  return schema.parse(await response.json());
}

export async function fetchLaunches(
  search = "",
  sort: "new" | "trending" | "buyers" | "liquidity" | "social" = "new",
): Promise<{
  data: LaunchSummary[];
  meta: DataMeta;
}> {
  const query = new URLSearchParams({ sort, limit: "50" });
  if (search) query.set("search", search);
  return requestJson(`/api/v1/launches?${query.toString()}`, launchesEnvelope);
}

export async function fetchLaunch(
  chainId: number,
  address: string,
): Promise<{ data: LaunchDetail; meta: DataMeta }> {
  return requestJson(`/api/v1/launches/${chainId}/${address}`, launchEnvelope);
}

const creatorEnvelope = z.object({
  data: z.object({
    address: z.string(),
    socialOwnershipVerified: z.boolean(),
    socialProofStatus: z.enum(["verified", "unverifiable", "collecting"]),
    launches: z.array(launchSummarySchema),
    launchesWithLiquidity: z.number().int().nonnegative().nullable(),
  }),
  meta: dataMetaSchema,
});

export async function fetchCreator(address: string) {
  return requestJson(`/api/v1/creators/${address}`, creatorEnvelope);
}

const portfolioEnvelope = z.object({
  data: z.object({
    address: z.string(),
    holdings: z.array(
      z.object({
        launch: launchSummarySchema,
        balance: z.string(),
        currentValueNative: z.string().nullable(),
        averageEntryNative: z.string().nullable(),
      }),
    ),
    claimableVestings: z.array(
      z.object({
        launch: launchSummarySchema,
        claimable: z.string(),
      }),
    ),
    recentTransactions: z.array(z.string()),
  }),
  meta: dataMetaSchema,
});

export async function fetchPortfolio(chainId: number, address: string) {
  return requestJson(
    `/api/v1/portfolio/${chainId}/${address}`,
    portfolioEnvelope,
  );
}

const imageUploadEnvelope = z.object({
  data: z.object({
    url: z.url(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    size: z.number().int().positive(),
    mimeType: z.string(),
  }),
});

const metadataUploadEnvelope = z.object({
  data: z.object({
    url: z.url(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  }),
});

export async function uploadMetadata(input: {
  image: File;
  name: string;
  symbol: string;
  description: string;
  socialUrl?: string;
}) {
  const imageBody = new FormData();
  imageBody.set("file", input.image);
  const storedImage = await requestJson(
    "/api/uploads/image",
    imageUploadEnvelope,
    {
      method: "POST",
      body: imageBody,
    },
  );
  const storedMetadata = await requestJson(
    "/api/uploads/metadata",
    metadataUploadEnvelope,
    {
      method: "POST",
      body: JSON.stringify({
        name: input.name,
        symbol: input.symbol,
        description: input.description,
        image: storedImage.data.url,
        ...(input.socialUrl ? { socialUrl: input.socialUrl } : {}),
      }),
    },
  );
  return {
    imageUrl: storedImage.data.url,
    metadataUri: storedMetadata.data.url,
    metadataHash: `0x${storedMetadata.data.sha256}` as const,
  };
}
