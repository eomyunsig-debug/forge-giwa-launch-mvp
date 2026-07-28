import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { rateLimit, trustedProxyIpKey } from "../src/rate-limit.js";

function limitedApp() {
  const app = new Hono();
  app.use(
    "*",
    rateLimit({
      limit: 1,
      clock: () => 1_000,
      key: trustedProxyIpKey("cf-connecting-ip"),
    }),
  );
  app.get("/", (context) => context.text("ok"));
  return app;
}

describe("trusted proxy rate-limit identity", () => {
  it("isolates valid proxy-provided IP addresses", async () => {
    const app = limitedApp();

    expect(
      (
        await app.request("/", {
          headers: { "cf-connecting-ip": "203.0.113.4" },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await app.request("/", {
          headers: { "cf-connecting-ip": "203.0.113.4" },
        })
      ).status,
    ).toBe(429);
    expect(
      (
        await app.request("/", {
          headers: { "cf-connecting-ip": "2001:db8::4" },
        })
      ).status,
    ).toBe(200);
  });

  it("keeps missing and malformed identities in one fail-closed bucket", async () => {
    const app = limitedApp();

    expect((await app.request("/")).status).toBe(200);
    expect(
      (
        await app.request("/", {
          headers: { "cf-connecting-ip": "spoofed, 203.0.113.9" },
        })
      ).status,
    ).toBe(429);
  });
});
