import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

import { z } from "zod";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const allowedImages = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
} as const;

type AllowedExtension = keyof typeof allowedImages;
type AllowedMime = (typeof allowedImages)[AllowedExtension];

const metadataSchema = z.object({
  name: z.string().trim().min(1).max(40),
  symbol: z
    .string()
    .trim()
    .min(2)
    .max(10)
    .regex(/^[A-Z][A-Z0-9]*$/u),
  description: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .refine(
      (value) => !/[<>]/u.test(value),
      "설명에는 실행 가능한 HTML markup을 포함할 수 없습니다.",
    ),
  image: z.url().refine((url) => {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" ||
      parsed.protocol === "ipfs:" ||
      (parsed.protocol === "http:" &&
        (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1"))
    );
  }, "지원되지 않는 이미지 URL protocol입니다."),
  socialUrl: z
    .url()
    .refine((url) => new URL(url).protocol === "https:")
    .optional(),
});

export interface ImageUpload {
  readonly originalName: string;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
}

export interface StoredUpload {
  readonly url: string;
  readonly sha256: string;
  readonly size: number;
  readonly mimeType: AllowedMime;
}

export type TokenMetadata = z.infer<typeof metadataSchema>;

export class UploadValidationError extends Error {
  override readonly name = "UploadValidationError";
}

export class LocalUploadStore {
  private readonly root: string;

  constructor(
    rootDirectory: string,
    private readonly publicBaseUrl: string,
  ) {
    this.root = resolve(rootDirectory);
    const base = new URL(publicBaseUrl);
    if (
      base.protocol !== "https:" &&
      !(
        base.protocol === "http:" &&
        (base.hostname === "localhost" || base.hostname === "127.0.0.1")
      )
    ) {
      throw new Error(
        "Local upload public URL must be HTTPS or localhost HTTP",
      );
    }
  }

  async storeImage(upload: ImageUpload): Promise<StoredUpload> {
    const extension = extname(upload.originalName).toLowerCase();
    if (!(extension in allowedImages)) {
      throw new UploadValidationError(
        "PNG, JPEG, WebP 또는 GIF 이미지만 업로드할 수 있습니다.",
      );
    }
    const typedExtension = extension as AllowedExtension;
    const expectedMime = allowedImages[typedExtension];
    if (upload.mimeType.toLowerCase() !== expectedMime) {
      throw new UploadValidationError(
        "파일 확장자와 MIME type이 일치하지 않습니다.",
      );
    }
    if (upload.bytes.byteLength === 0) {
      throw new UploadValidationError("빈 파일은 업로드할 수 없습니다.");
    }
    if (upload.bytes.byteLength > MAX_IMAGE_BYTES) {
      throw new UploadValidationError("이미지는 5MB 이하여야 합니다.");
    }
    if (!hasValidSignature(upload.bytes, expectedMime)) {
      throw new UploadValidationError(
        "파일 내용이 선언된 이미지 형식과 일치하지 않습니다.",
      );
    }

    const sha256 = createHash("sha256").update(upload.bytes).digest("hex");
    const canonicalExtension =
      expectedMime === "image/jpeg" ? ".jpg" : typedExtension;
    const fileName = `${sha256}${canonicalExtension}`;
    await mkdir(this.root, { recursive: true });
    await writeFile(resolve(this.root, fileName), upload.bytes, {
      flag: "wx",
    }).catch((error: unknown) => {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "EEXIST"
      ) {
        return;
      }
      throw error;
    });
    return {
      url: new URL(
        `uploads/${fileName}`,
        ensureTrailingSlash(this.publicBaseUrl),
      ).toString(),
      sha256,
      size: upload.bytes.byteLength,
      mimeType: expectedMime,
    };
  }

  async storeMetadata(input: unknown): Promise<{
    readonly url: string;
    readonly sha256: string;
    readonly metadata: TokenMetadata;
  }> {
    const metadata = metadataSchema.parse(input);
    const serialized = `${JSON.stringify(metadata, null, 2)}\n`;
    const sha256 = createHash("sha256").update(serialized).digest("hex");
    const fileName = `${sha256}.json`;
    await mkdir(this.root, { recursive: true });
    await writeFile(resolve(this.root, fileName), serialized, {
      encoding: "utf8",
      flag: "wx",
    }).catch((error: unknown) => {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "EEXIST"
      ) {
        return;
      }
      throw error;
    });
    return {
      url: new URL(
        `uploads/${fileName}`,
        ensureTrailingSlash(this.publicBaseUrl),
      ).toString(),
      sha256,
      metadata,
    };
  }

  async read(fileName: string): Promise<{
    readonly bytes: Uint8Array<ArrayBuffer>;
    readonly contentType: string;
  } | null> {
    if (!/^[a-f0-9]{64}\.(?:png|jpg|jpeg|webp|gif|json)$/u.test(fileName)) {
      return null;
    }
    const path = resolve(this.root, fileName);
    if (!path.startsWith(`${this.root}${sep}`)) return null;
    try {
      const file = await readFile(path);
      const bytes = new Uint8Array(new ArrayBuffer(file.byteLength));
      bytes.set(file);
      const extension = extname(fileName) as AllowedExtension | ".json";
      return {
        bytes,
        contentType:
          extension === ".json"
            ? "application/json; charset=utf-8"
            : allowedImages[extension],
      };
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return null;
      }
      throw error;
    }
  }
}

export function validateMetadata(input: unknown): TokenMetadata {
  return metadataSchema.parse(input);
}

function hasValidSignature(bytes: Uint8Array, mime: AllowedMime): boolean {
  switch (mime) {
    case "image/png":
      return beginsWith(
        bytes,
        [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      );
    case "image/jpeg":
      return beginsWith(bytes, [0xff, 0xd8, 0xff]);
    case "image/webp":
      return (
        beginsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
        new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
      );
    case "image/gif": {
      const header = new TextDecoder().decode(bytes.slice(0, 6));
      return header === "GIF87a" || header === "GIF89a";
    }
  }
}

function beginsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return (
    bytes.byteLength >= prefix.length &&
    prefix.every((value, index) => bytes[index] === value)
  );
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

export { MAX_IMAGE_BYTES };
