import { describe, expect, it } from "vitest";

import worker from "../worker/index.js";

describe("public Sites worker", () => {
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
              path === "/"
                ? new Response("<!doctype html><title>Forge</title>", {
                    headers: { "Content-Type": "text/html" },
                  })
                : new Response(null, { status: 404 }),
            );
          },
        },
      },
    );

    expect(requestedPaths).toEqual(["/token/31337/0xabc", "/"]);
    expect(response.status).toBe(200);
    expect(response.headers.get("Location")).toBeNull();
    expect(response.headers.get("Content-Security-Policy")).toContain(
      "connect-src 'self'",
    );
  });
});
