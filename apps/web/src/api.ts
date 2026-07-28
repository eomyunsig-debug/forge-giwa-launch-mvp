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

import { indexerUrl, isPublicDemo } from "./config";
import {
  publicDemoLaunch,
  publicDemoLaunches,
  publicDemoMeta,
} from "./publicDemoSnapshot";

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
  if (isPublicDemo) {
    const needle = search.trim().toLowerCase();
    const data = publicDemoLaunches.filter(
      (launch) =>
        !needle ||
        launch.name.toLowerCase().includes(needle) ||
        launch.symbol.toLowerCase().includes(needle) ||
        launch.tokenAddress.toLowerCase().includes(needle),
    );
    return {
      data: sort === "social" ? [] : data,
      meta: publicDemoMeta,
    };
  }
  const query = new URLSearchParams({ sort, limit: "50" });
  if (search) query.set("search", search);
  return requestJson(`/api/v1/launches?${query.toString()}`, launchesEnvelope);
}

export async function fetchLaunch(
  chainId: number,
  address: string,
): Promise<{ data: LaunchDetail; meta: DataMeta }> {
  if (isPublicDemo) {
    if (
      chainId === publicDemoLaunch.chainId &&
      address.toLowerCase() === publicDemoLaunch.tokenAddress.toLowerCase()
    ) {
      return { data: publicDemoLaunch, meta: publicDemoMeta };
    }
    throw new Error("PUBLIC_DEMO_LAUNCH_NOT_FOUND");
  }
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
  if (isPublicDemo) {
    const launches = publicDemoLaunches.filter(
      (launch) => launch.creatorAddress.toLowerCase() === address.toLowerCase(),
    );
    return creatorEnvelope.parse({
      data: {
        address,
        socialOwnershipVerified: false,
        socialProofStatus: "unverifiable",
        launches,
        launchesWithLiquidity: launches.filter(
          (launch) =>
            launch.actualLiquidityNative != null &&
            BigInt(launch.actualLiquidityNative) > 0n,
        ).length,
      },
      meta: publicDemoMeta,
    });
  }
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
  if (isPublicDemo) {
    return portfolioEnvelope.parse({
      data: {
        address,
        holdings: [],
        claimableVestings: [],
        recentTransactions: [],
      },
      meta: publicDemoMeta,
    });
  }
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
  if (isPublicDemo) {
    throw new Error("PUBLIC_DEMO_READ_ONLY");
  }
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
