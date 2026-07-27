import { describe, expect, it } from "vitest";

import { isTransientRpcError, withExponentialBackoff } from "../src/rpc.js";

describe("RPC retry policy", () => {
  it("uses bounded exponential backoff with injectable jitter", async () => {
    const delays: number[] = [];
    let calls = 0;
    const value = await withExponentialBackoff(
      () => {
        calls += 1;
        return calls < 4
          ? Promise.reject(new Error("503 upstream"))
          : Promise.resolve("ok");
      },
      {
        attempts: 5,
        baseDelayMs: 100,
        maxDelayMs: 250,
        random: () => 0.5,
        sleep: (delay) => {
          delays.push(delay);
          return Promise.resolve();
        },
      },
    );

    expect(value).toBe("ok");
    expect(calls).toBe(4);
    expect(delays).toEqual([100, 200, 250]);
  });

  it("fails fast for non-transient errors", async () => {
    let calls = 0;
    await expect(
      withExponentialBackoff(
        () => {
          calls += 1;
          return Promise.reject(new Error("invalid params"));
        },
        {
          attempts: 5,
          sleep: () => Promise.resolve(),
        },
      ),
    ).rejects.toThrow("invalid params");
    expect(calls).toBe(1);
  });

  it("classifies only retryable transport and provider failures", () => {
    expect(isTransientRpcError(new Error("request timed out"))).toBe(true);
    expect(isTransientRpcError(new Error("429 rate limit"))).toBe(true);
    expect(isTransientRpcError(new Error("execution reverted"))).toBe(false);
  });
});
