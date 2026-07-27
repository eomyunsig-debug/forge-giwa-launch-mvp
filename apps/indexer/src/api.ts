import { randomUUID } from "node:crypto";

import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { createMiddleware } from "hono/factory";
import { Hono } from "hono";
import { z, ZodError } from "zod";

import { type IndexerDatabase } from "./database.js";
import { type IndexerService } from "./indexer.js";
import { ApiRepository } from "./queries.js";
import { rateLimit, type RateLimitOptions } from "./rate-limit.js";
import { MAX_IMAGE_BYTES, UploadValidationError } from "./upload.js";
import { type LocalUploadStore } from "./upload.js";
import { normalizeAddress } from "./types.js";

const chainIdSchema = z.coerce.number().int().positive();
const launchQuerySchema = z.object({
  q: z.string().max(100).optional(),
  search: z.string().max(100).optional(),
  sort: z.enum(["new", "trending", "buyers", "liquidity", "social"]).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  cursor: z.string().max(100).optional(),
});
const reportSchema = z.object({
  chainId: chainIdSchema,
  tokenAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/u)
    .transform(normalizeAddress),
  reason: z
    .string()
    .trim()
    .min(10)
    .max(500)
    .refine((value) => !/[<>]/u.test(value)),
});

export interface ApiOptions {
  readonly database: IndexerDatabase;
  readonly indexer: IndexerService;
  readonly repository?: ApiRepository;
  readonly uploads?: LocalUploadStore;
  readonly defaultChainId?: number;
  readonly corsOrigin?: string;
  readonly rateLimit?: RateLimitOptions;
}

interface CreatorProjection {
  readonly address: string;
  readonly launchesWithLiquidity: number;
  readonly socialOwnershipVerified: boolean;
  readonly launches: readonly unknown[];
}

interface PortfolioProjection {
  readonly holdings: readonly {
    readonly tokenAddress: string;
    readonly balance: string;
    readonly currentValueNative: string | null;
    readonly averagePurchasePriceNative: string | null;
  }[];
  readonly claimableCreatorVestings: readonly {
    readonly tokenAddress: string;
    readonly claimable: string;
  }[];
  readonly recentTransactions: readonly {
    readonly transactionHash: string;
  }[];
}

export function createApi(options: ApiOptions): Hono {
  const app = new Hono();
  const repository =
    options.repository ?? new ApiRepository(options.database, options.indexer);

  app.use("*", securityHeaders());
  app.use(
    "/api/*",
    cors({
      origin: options.corsOrigin ?? "http://localhost:5173",
      allowHeaders: ["Content-Type"],
      allowMethods: ["GET", "POST", "OPTIONS"],
      maxAge: 600,
    }),
  );
  app.use("/api/*", rateLimit(options.rateLimit));
  app.use(
    "/api/uploads/*",
    bodyLimit({
      maxSize: MAX_IMAGE_BYTES + 64 * 1024,
      onError: (context) =>
        context.json(
          {
            error: {
              code: "UPLOAD_TOO_LARGE",
              message: "업로드 요청은 5MB 이하여야 합니다.",
            },
          },
          413,
        ),
    }),
  );

  app.get("/health", (context) => {
    context.header("Cache-Control", "no-store");
    return context.json(repository.health());
  });

  const listHandler = (chainId: number, query: Record<string, string>) => {
    const parsed = launchQuerySchema.parse(query);
    const search = parsed.search ?? parsed.q;
    return {
      data: repository.listLaunches(chainId, {
        ...(search ? { query: search } : {}),
        ...(parsed.sort ? { sort: parsed.sort } : {}),
        ...(parsed.limit ? { limit: parsed.limit } : {}),
        ...(parsed.cursor ? { cursor: parsed.cursor } : {}),
      }),
      meta: repository.meta(chainId),
    };
  };

  app.get("/api/launches", (context) => {
    const chainId = chainIdSchema.parse(context.req.query("chainId"));
    context.header(
      "Cache-Control",
      "public, max-age=2, stale-while-revalidate=5",
    );
    return context.json(listHandler(chainId, context.req.query()));
  });

  app.get("/api/launches/:chainId", (context) => {
    const chainId = chainIdSchema.parse(context.req.param("chainId"));
    context.header(
      "Cache-Control",
      "public, max-age=2, stale-while-revalidate=5",
    );
    return context.json(listHandler(chainId, context.req.query()));
  });

  app.get("/api/tokens/:chainId/:address", (context) => {
    const chainId = chainIdSchema.parse(context.req.param("chainId"));
    const data = repository.getLaunchDetail(
      chainId,
      context.req.param("address"),
    );
    if (data == null) {
      return context.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "인덱서에서 해당 토큰을 찾지 못했습니다.",
          },
          meta: repository.meta(chainId),
        },
        404,
      );
    }
    context.header(
      "Cache-Control",
      "public, max-age=2, stale-while-revalidate=5",
    );
    return context.json({ data, meta: repository.meta(chainId) });
  });

  app.get("/api/creators/:chainId/:address", (context) => {
    const chainId = chainIdSchema.parse(context.req.param("chainId"));
    const data = repository.getCreator(chainId, context.req.param("address"));
    if (data == null) {
      return context.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "인덱서에서 해당 창작자를 찾지 못했습니다.",
          },
          meta: repository.meta(chainId),
        },
        404,
      );
    }
    context.header(
      "Cache-Control",
      "public, max-age=5, stale-while-revalidate=10",
    );
    return context.json({ data, meta: repository.meta(chainId) });
  });

  app.get("/api/portfolio/:chainId/:address", (context) => {
    const chainId = chainIdSchema.parse(context.req.param("chainId"));
    context.header("Cache-Control", "private, no-store");
    return context.json({
      data: repository.getPortfolio(chainId, context.req.param("address")),
      meta: repository.meta(chainId),
    });
  });

  app.get("/api/v1/launches", (context) => {
    const chainId = chainIdSchema.parse(
      context.req.query("chainId") ?? options.defaultChainId,
    );
    const parsed = launchQuerySchema.parse(context.req.query());
    const search = parsed.search ?? parsed.q;
    const page = repository.listLaunches(chainId, {
      ...(search ? { query: search } : {}),
      ...(parsed.sort ? { sort: parsed.sort } : {}),
      ...(parsed.limit ? { limit: parsed.limit } : {}),
      ...(parsed.cursor ? { cursor: parsed.cursor } : {}),
    });
    context.header(
      "Cache-Control",
      "public, max-age=2, stale-while-revalidate=5",
    );
    return context.json({
      data: page.items,
      meta: repository.meta(chainId),
      pagination: { nextCursor: page.nextCursor },
    });
  });

  app.get("/api/v1/launches/:chainId/:address", (context) => {
    const chainId = chainIdSchema.parse(context.req.param("chainId"));
    const data = repository.getLaunchDetail(
      chainId,
      context.req.param("address"),
    );
    if (data == null) {
      return context.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "인덱서에서 해당 토큰을 찾지 못했습니다.",
          },
          meta: repository.meta(chainId),
        },
        404,
      );
    }
    context.header(
      "Cache-Control",
      "public, max-age=2, stale-while-revalidate=5",
    );
    return context.json({ data, meta: repository.meta(chainId) });
  });

  app.get("/api/v1/creators/:address", (context) => {
    const chainId = chainIdSchema.parse(
      context.req.query("chainId") ?? options.defaultChainId,
    );
    const data = repository.getCreator(
      chainId,
      context.req.param("address"),
    ) as CreatorProjection | null;
    if (data == null) {
      return context.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "인덱서에서 해당 창작자를 찾지 못했습니다.",
          },
          meta: repository.meta(chainId),
        },
        404,
      );
    }
    return context.json({
      data: {
        address: data.address,
        socialOwnershipVerified: data.socialOwnershipVerified,
        socialProofStatus: data.socialOwnershipVerified
          ? ("verified" as const)
          : ("unverifiable" as const),
        launches: data.launches,
        launchesWithLiquidity: data.launchesWithLiquidity,
      },
      meta: repository.meta(chainId),
    });
  });

  app.get("/api/v1/portfolio/:chainId/:address", (context) => {
    const chainId = chainIdSchema.parse(context.req.param("chainId"));
    const address = normalizeAddress(context.req.param("address"));
    const projection = repository.getPortfolio(
      chainId,
      address,
    ) as PortfolioProjection;
    const launchByToken = new Map<string, unknown>();
    const loadLaunch = (tokenAddress: string) => {
      const known = launchByToken.get(tokenAddress);
      if (known) return known;
      const launch = repository.getLaunchDetail(chainId, tokenAddress);
      if (launch) launchByToken.set(tokenAddress, launch);
      return launch;
    };
    context.header("Cache-Control", "private, no-store");
    return context.json({
      data: {
        address,
        holdings: projection.holdings.flatMap((holding) => {
          const launch = loadLaunch(holding.tokenAddress);
          return launch
            ? [
                {
                  launch,
                  balance: holding.balance,
                  currentValueNative: holding.currentValueNative,
                  averageEntryNative: holding.averagePurchasePriceNative,
                },
              ]
            : [];
        }),
        claimableVestings: projection.claimableCreatorVestings.flatMap(
          (vesting) => {
            const launch = loadLaunch(vesting.tokenAddress);
            return launch ? [{ launch, claimable: vesting.claimable }] : [];
          },
        ),
        recentTransactions: Array.from(
          new Set(
            projection.recentTransactions.map(
              (transaction) => transaction.transactionHash,
            ),
          ),
        ),
      },
      meta: repository.meta(chainId),
    });
  });

  app.post("/api/v1/reports", async (context) => {
    const report = reportSchema.parse(await context.req.json());
    if (
      repository.getLaunchDetail(report.chainId, report.tokenAddress) == null
    ) {
      return context.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "인덱싱된 런치만 신고할 수 있습니다.",
          },
        },
        404,
      );
    }
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    options.database.db
      .prepare(
        `INSERT INTO reports
           (id, chain_id, token_address, reason, source, created_at)
         VALUES (?, ?, ?, ?, 'api-user-report', ?)`,
      )
      .run(id, report.chainId, report.tokenAddress, report.reason, createdAt);
    return context.json(
      {
        data: {
          id,
          source: "api-user-report",
          createdAt,
        },
      },
      201,
    );
  });

  app.post("/api/uploads/image", async (context) => {
    if (!options.uploads) {
      return context.json(
        {
          error: {
            code: "UPLOADS_DISABLED",
            message: "이 환경에서는 로컬 업로드가 비활성화되어 있습니다.",
          },
        },
        503,
      );
    }
    const body = await context.req.parseBody();
    const file = body.file;
    if (!(file instanceof File)) {
      return context.json(
        {
          error: {
            code: "INVALID_UPLOAD",
            message: "이미지 파일이 필요합니다.",
          },
        },
        400,
      );
    }
    const stored = await options.uploads.storeImage({
      originalName: file.name,
      mimeType: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    return context.json({ data: stored }, 201);
  });

  app.post("/api/uploads/metadata", async (context) => {
    if (!options.uploads) {
      return context.json(
        {
          error: {
            code: "UPLOADS_DISABLED",
            message: "이 환경에서는 로컬 업로드가 비활성화되어 있습니다.",
          },
        },
        503,
      );
    }
    const input: unknown = await context.req.json();
    const stored = await options.uploads.storeMetadata(input);
    return context.json({ data: stored }, 201);
  });

  app.get("/uploads/:fileName", async (context) => {
    if (!options.uploads) return context.notFound();
    const stored = await options.uploads.read(context.req.param("fileName"));
    if (!stored) return context.notFound();
    return context.body(stored.bytes, 200, {
      "Content-Type": stored.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    });
  });

  app.notFound((context) =>
    context.json(
      {
        error: {
          code: "NOT_FOUND",
          message: "요청한 API 경로를 찾지 못했습니다.",
        },
      },
      404,
    ),
  );
  app.onError((error, context) => {
    if (error instanceof ZodError) {
      return context.json(
        {
          error: {
            code: "INVALID_REQUEST",
            message: "요청 값이 올바르지 않습니다.",
            issues: error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          },
        },
        400,
      );
    }
    if (error instanceof UploadValidationError) {
      return context.json(
        {
          error: {
            code: "INVALID_UPLOAD",
            message: error.message,
          },
        },
        400,
      );
    }
    return context.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message:
            "요청을 처리하지 못했습니다. 기존 인덱싱 데이터는 유지됩니다.",
        },
      },
      500,
    );
  });

  return app;
}

function securityHeaders() {
  return createMiddleware(async (context, next) => {
    context.header("X-Content-Type-Options", "nosniff");
    context.header("X-Frame-Options", "DENY");
    context.header("Referrer-Policy", "no-referrer");
    context.header(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    context.header(
      "Content-Security-Policy",
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    );
    await next();
  });
}
