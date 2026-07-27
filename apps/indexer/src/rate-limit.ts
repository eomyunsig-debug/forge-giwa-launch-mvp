import { createMiddleware } from "hono/factory";

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  readonly limit?: number;
  readonly windowMs?: number;
  readonly clock?: () => number;
  readonly key?: (request: Request) => string;
}

export function rateLimit(options: RateLimitOptions = {}) {
  const limit = options.limit ?? 120;
  const windowMs = options.windowMs ?? 60_000;
  const clock = options.clock ?? Date.now;
  // The MVP has no trusted reverse-proxy boundary. Client-supplied IP or ID
  // headers would let an attacker mint unlimited buckets, so the safe default
  // is one shared unauthenticated bucket. A deployment may inject a key
  // function only after its proxy strips and rewrites the relevant header.
  const key = options.key ?? (() => "anonymous");
  const buckets = new Map<string, Bucket>();

  return createMiddleware(async (context, next) => {
    const now = clock();
    const bucketKey = key(context.req.raw);
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
