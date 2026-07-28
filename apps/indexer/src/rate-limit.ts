import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { isIP } from "node:net";

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  readonly limit?: number;
  readonly windowMs?: number;
  readonly clock?: () => number;
  readonly key?: (context: Context) => string;
}

export type TrustedProxyIpHeader = "cf-connecting-ip" | "x-real-ip";

export function trustedProxyIpKey(
  header: TrustedProxyIpHeader,
): (context: Context) => string {
  return (context) => {
    const candidate = context.req.raw.headers.get(header)?.trim();
    return candidate && isIP(candidate) !== 0
      ? `ip:${candidate.toLowerCase()}`
      : "ip:unknown";
  };
}

export function peerIpKey(context: Context): string {
  try {
    const candidate = getConnInfo(context).remote.address?.trim();
    return candidate && isIP(candidate) !== 0
      ? `ip:${candidate.toLowerCase()}`
      : "ip:unknown";
  } catch {
    // In-memory Hono requests have no TCP socket. Keeping them in one bucket is
    // fail-closed and mirrors an unavailable peer identity.
    return "ip:unknown";
  }
}

export function rateLimit(options: RateLimitOptions = {}) {
  const limit = options.limit ?? 600;
  const windowMs = options.windowMs ?? 60_000;
  const clock = options.clock ?? Date.now;
  // The Node server's TCP peer is the safe default because a client cannot
  // mint arbitrary buckets with request headers. A deployment may override
  // this only after its proxy strips and rewrites a trusted IP header.
  const key = options.key ?? peerIpKey;
  const buckets = new Map<string, Bucket>();

  return createMiddleware(async (context, next) => {
    const now = clock();
    const bucketKey = key(context);
    const current = buckets.get(bucketKey);
    const bucket =
      !current || current.resetAt <= now
        ? { count: 0, resetAt: now + windowMs }
        : current;
    bucket.count += 1;
    buckets.set(bucketKey, bucket);

    const remaining = Math.max(0, limit - bucket.count);
    context.header("RateLimit-Limit", limit.toString());
    context.header("RateLimit-Remaining", remaining.toString());
    context.header(
      "RateLimit-Reset",
      Math.ceil(bucket.resetAt / 1_000).toString(),
    );
    if (bucket.count > limit) {
      return context.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
          },
        },
        429,
      );
    }
    await next();

    if (buckets.size > 10_000) {
      for (const [storedKey, stored] of buckets) {
        if (stored.resetAt <= now) buckets.delete(storedKey);
      }
    }
  });
}
