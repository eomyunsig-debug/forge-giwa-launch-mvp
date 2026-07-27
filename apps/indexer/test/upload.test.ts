import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  LocalUploadStore,
  MAX_IMAGE_BYTES,
  UploadValidationError,
} from "../src/upload.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), "forge-uploads-"));
  directories.push(directory);
  return new LocalUploadStore(directory, "http://localhost:8787");
}

describe("local upload adapter", () => {
  it("stores content-addressed images after MIME and magic-byte checks", async () => {
    const store = await setup();
    const png = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
    ]);
    const first = await store.storeImage({
      originalName: "token.png",
      mimeType: "image/png",
      bytes: png,
    });
    const duplicate = await store.storeImage({
      originalName: "token.png",
      mimeType: "image/png",
      bytes: png,
    });

    expect(first).toEqual(duplicate);
    expect(first.url).toMatch(
      /^http:\/\/localhost:8787\/uploads\/[a-f0-9]{64}\.png$/u,
    );
    expect(await store.read(first.url.split("/").at(-1) ?? "")).toMatchObject({
      contentType: "image/png",
      bytes: png,
    });
  });

  it("rejects SVG, mismatched MIME, invalid signatures and oversized images", async () => {
    const store = await setup();
    await expect(
      store.storeImage({
        originalName: "attack.svg",
        mimeType: "image/svg+xml",
        bytes: new TextEncoder().encode("<svg onload=alert(1)>"),
      }),
    ).rejects.toBeInstanceOf(UploadValidationError);
    await expect(
      store.storeImage({
        originalName: "attack.png",
        mimeType: "text/html",
        bytes: new TextEncoder().encode("<script>alert(1)</script>"),
      }),
    ).rejects.toBeInstanceOf(UploadValidationError);
    await expect(
      store.storeImage({
        originalName: "fake.png",
        mimeType: "image/png",
        bytes: new TextEncoder().encode("not a png"),
      }),
    ).rejects.toBeInstanceOf(UploadValidationError);
    await expect(
      store.storeImage({
        originalName: "large.png",
        mimeType: "image/png",
        bytes: new Uint8Array(MAX_IMAGE_BYTES + 1),
      }),
    ).rejects.toThrow("5MB");
  });

  it("validates metadata protocols and rejects executable markup", async () => {
    const store = await setup();
    const valid = await store.storeMetadata({
      name: "커뮤니티",
      symbol: "COMM",
      description: "온체인 사실을 공개하는 테스트 토큰",
      image: "http://localhost:8787/uploads/example.png",
      socialUrl: "https://x.com/community",
    });
    expect(valid.url).toMatch(/\.json$/u);
    expect(
      (await store.read(valid.url.split("/").at(-1) ?? ""))?.contentType,
    ).toBe("application/json; charset=utf-8");

    await expect(
      store.storeMetadata({
        name: "공격",
        symbol: "EVIL",
        description: "<img src=x onerror=alert(1)>",
        image: "javascript:alert(1)",
      }),
    ).rejects.toThrow();
    await expect(store.read("../../etc/passwd")).resolves.toBeNull();
  });
});
