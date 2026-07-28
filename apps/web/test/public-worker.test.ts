import { describe, expect, it } from "vitest";

import worker, {
  internalAssetPrefix,
  securityHeaders,
} from "../worker/index.js";

describe("public Sites worker", () => {
  it("proxies public assets through the security-header worker", async () => {
    const requestedPaths: string[] = [];
    const response = await worker.fetch(
      new Request("https://forge.example/assets/app.js"),
      {
        ASSETS: {
          fetch(request: Request) {
            const path = new URL(request.url).pathname;
            requestedPaths.push(path);
            return Promise.resolve(
              path === `${internalAssetPrefix}/assets/app.js`
                ? new Response("export {};", {
                    headers: { "Content-Type": "text/javascript" },
                  })
                : new Response(null, { status: 404 }),
            );
          },
        },
      },
    );

    expect(requestedPaths).toEqual([`${internalAssetPrefix}/assets/app.js`]);
    expect(response.status).toBe(200);
    for (const [name, value] of Object.entries(securityHeaders)) {
      expect(response.headers.get(name)).toBe(value);
    }
  });

  it("serves the root asset for a deep SPA route without a redirect", async () => {
    const requestedPaths: string[] = [];
    const response = await worker.fetch(
      new Request("https://forge.example/token/31337/0xabc"),
      {
        ASSETS: {
          fetch(request: Request) {
            const path = new URL(request.url).pathname;
            requestedPaths.push(path);
            return Promise.resolve(
              path === `${internalAssetPrefix}/`
                ? new Response("<!doctype html><title>Forge</title>", {
                    headers: { "Content-Type": "text/html" },
                  })
                : new Response(null, { status: 404 }),
            );
          },
        },
      },
    );

    expect(requestedPaths).toEqual([
      `${internalAssetPrefix}/token/31337/0xabc`,
      `${internalAssetPrefix}/`,
    ]);
    expect(response.status).toBe(200);
    expect(response.headers.get("Location")).toBeNull();
    expect(response.headers.get("Content-Security-Policy")).toContain(
      "connect-src 'self'",
    );
  });
});
