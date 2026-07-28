import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const clientDirectory = resolve(root, "apps/web/dist/client");
const workerPath = resolve(root, "apps/web/dist/server/index.js");

type AssetBinding = {
  fetch(request: Request): Promise<Response>;
};

type WorkerModule = {
  default: {
    fetch(
      request: Request,
      environment: { ASSETS: AssetBinding },
    ): Promise<Response>;
  };
  securityHeaders: Record<string, string>;
};

function contentType(path: string): string {
  switch (extname(path)) {
    case ".css":
      return "text/css";
    case ".html":
      return "text/html";
    case ".js":
      return "text/javascript";
    case ".png":
      return "image/png";
    default:
      return "application/octet-stream";
  }
}

const assets: AssetBinding = {
  async fetch(request) {
    const pathname = decodeURIComponent(new URL(request.url).pathname);
    const relativePath = pathname.replace(/^\/+/, "");
    const candidate = pathname.endsWith("/")
      ? resolve(clientDirectory, relativePath, "index.html")
      : resolve(clientDirectory, relativePath);
    if (
      candidate !== clientDirectory &&
      !candidate.startsWith(`${clientDirectory}${sep}`)
    ) {
      return new Response(null, { status: 404 });
    }

    try {
      return new Response(await readFile(candidate), {
        headers: { "Content-Type": contentType(candidate) },
      });
    } catch {
      return new Response(null, { status: 404 });
    }
  },
};

async function main() {
  const workerUrl = pathToFileURL(workerPath);
  workerUrl.searchParams.set("verify", `${Date.now()}`);
  const worker = (await import(workerUrl.href)) as WorkerModule;
  const rootResponse = await worker.default.fetch(
    new Request("https://forge.example/"),
    { ASSETS: assets },
  );
  if (rootResponse.status !== 200) {
    throw new Error(`Public demo artifact returned ${rootResponse.status}: /`);
  }
  for (const [name, value] of Object.entries(worker.securityHeaders)) {
    if (rootResponse.headers.get(name) !== value) {
      throw new Error(`Public demo artifact omitted ${name}: /`);
    }
  }
  const indexHtml = await rootResponse.text();
  const scriptPath = indexHtml.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
  if (!scriptPath) {
    throw new Error("Public demo index has no hashed application script");
  }

  for (const path of [
    "/og.png",
    scriptPath,
    "/token/31337/0x8c8519cf76d0427e4d936183b9b10018c11cb3ba",
  ]) {
    const response = await worker.default.fetch(
      new Request(`https://forge.example${path}`),
      { ASSETS: assets },
    );
    if (response.status !== 200) {
      throw new Error(
        `Public demo artifact returned ${response.status}: ${path}`,
      );
    }
    for (const [name, value] of Object.entries(worker.securityHeaders)) {
      if (response.headers.get(name) !== value) {
        throw new Error(`Public demo artifact omitted ${name}: ${path}`);
      }
    }
  }

  process.stdout.write(
    "Verified public demo shell, image, script, deep link, and security headers.\n",
  );
}

void main();
