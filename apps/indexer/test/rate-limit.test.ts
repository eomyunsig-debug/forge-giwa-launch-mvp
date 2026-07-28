import { Hono, type Context } from "hono";
import { describe, expect, it } from "vitest";

import { peerIpKey, rateLimit, trustedProxyIpKey } from "../src/rate-limit.js";

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
  it("uses the TCP peer address without trusting client headers", () => {
    const context = {
      env: {
        incoming: {
          socket: {
            remoteAddress: "203.0.113.44",
            remotePort: 51_234,
            remoteFamily: "IPv4",
          },
        },
      },
    } as unknown as Context;

    expect(peerIpKey(context)).toBe("ip:203.0.113.44");
  });

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
