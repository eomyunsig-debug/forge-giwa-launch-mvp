import { spawn, type ChildProcess } from "node:child_process";
import { constants } from "node:fs";
import {
  access,
  chmod,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runtimeDirectory = join(root, ".data", "local-stack");
const anvilConfigPath = join(runtimeDirectory, "anvil-config.json");
const deploymentPath = join(runtimeDirectory, "deployment.json");
const rpcUrl = "http://127.0.0.1:8545";
const indexerUrl = "http://127.0.0.1:8787";
const webPort = Number.parseInt(process.env.FORGE_WEB_PORT ?? "5173", 10);
if (!Number.isInteger(webPort) || webPort < 1 || webPort > 65_535) {
  throw new Error("FORGE_WEB_PORT must be an integer between 1 and 65535");
}
const webUrl = `http://127.0.0.1:${webPort.toString()}`;
const chainId = 31_337;
const foundryDirectory = join(root, ".tools", "foundry", "bin");
const children: Array<{ label: string; process: ChildProcess }> = [];

let shuttingDown = false;

interface AnvilConfig {
  available_accounts?: unknown;
  private_keys?: unknown;
}

interface Deployment {
  chainId: number;
  rpcUrl: string;
  deployedAt: string;
  deployedBlock: string;
  protocolConfig: string;
  launchFactory: string;
  localAdapter: string;
  adapterKind: "local-test-only";
}

function assertInsideRoot(path: string): void {
  if (!path.startsWith(`${root}${sep}`)) {
    throw new Error(`Refusing to modify a path outside the workspace: ${path}`);
  }
}

function pnpmInvocation(args: string[]): {
  executable: string;
  args: string[];
} {
  const pnpmPath = process.env.npm_execpath;
  return pnpmPath
    ? { executable: process.execPath, args: [pnpmPath, ...args] }
    : { executable: "pnpm", args };
}

async function foundryExecutable(name: "anvil" | "forge"): Promise<string> {
  const localExecutable = join(foundryDirectory, name);
  try {
    await access(localExecutable, constants.X_OK);
    return localExecutable;
  } catch {
    return name;
  }
}

function stopChild(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid == null || child.exitCode != null) return;
  try {
    if (process.platform === "win32") {
      child.kill(signal);
    } else {
      process.kill(-child.pid, signal);
    }
  } catch {
    child.kill(signal);
  }
}

async function shutdown(exitCode: number): Promise<never> {
  if (shuttingDown) {
    process.exit(exitCode);
  }
  shuttingDown = true;
  for (const child of [...children].reverse()) {
    stopChild(child.process, "SIGTERM");
  }
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 750));
  for (const child of [...children].reverse()) {
    stopChild(child.process, "SIGKILL");
  }
  process.exit(exitCode);
}

function startManaged(
  label: string,
  executable: string,
  args: string[],
  environment: NodeJS.ProcessEnv = process.env,
  output: "inherit" | "ignore" = "inherit",
): ChildProcess {
  const child = spawn(executable, args, {
    cwd: root,
    env: environment,
    detached: process.platform !== "win32",
    stdio: ["ignore", output, output],
  });
  children.push({ label, process: child });
  child.once("error", (error) => {
    if (!shuttingDown) {
      console.error(`[local-stack] ${label} 시작 실패: ${error.message}`);
      void shutdown(1);
    }
  });
  child.once("exit", (code, signal) => {
    if (!shuttingDown) {
      console.error(
        `[local-stack] ${label}이(가) 예기치 않게 종료됨 (${signal ?? code ?? "unknown"})`,
      );
      void shutdown(code && code > 0 ? code : 1);
    }
  });
  return child;
}

async function capture(
  executable: string,
  args: string[],
  options: {
    cwd?: string;
    environment?: NodeJS.ProcessEnv;
    sensitive?: boolean;
  } = {},
): Promise<string> {
  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(executable, args, {
      cwd: options.cwd ?? root,
      env: options.environment ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", rejectPromise);
    child.once("close", (code) => {
      if (code === 0) {
        resolvePromise(stdout);
        return;
      }
      const details = options.sensitive
        ? "sensitive command output omitted"
        : `${stdout}\n${stderr}`.trim().slice(-8_000);
      rejectPromise(
        new Error(
          `Command failed with exit code ${code ?? "unknown"}: ${details}`,
        ),
      );
    });
  });
}

async function waitForFile(path: string, timeoutMs = 15_000): Promise<void> {
  const expiresAt = Date.now() + timeoutMs;
  while (Date.now() < expiresAt) {
    try {
      const value = await readFile(path, "utf8");
      if (value.length > 0) return;
    } catch {
      // Anvil writes the file shortly after startup.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`Timed out waiting for ${path}`);
}

async function rpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
  });
  if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
  const payload = (await response.json()) as {
    result?: T;
    error?: { message?: string };
  };
  if (payload.error) {
    throw new Error(payload.error.message ?? `RPC ${method} failed`);
  }
  if (payload.result === undefined) {
    throw new Error(`RPC ${method} returned no result`);
  }
  return payload.result;
}

async function waitForRpc(timeoutMs = 30_000): Promise<void> {
  const expiresAt = Date.now() + timeoutMs;
  while (Date.now() < expiresAt) {
    try {
      const currentChain = await rpc<string>("eth_chainId");
      if (Number.parseInt(currentChain.slice(2), 16) === chainId) return;
    } catch {
      // The process is still binding its RPC listener.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 150));
  }
  throw new Error("Anvil RPC did not become ready");
}

async function waitForHttp(url: string, timeoutMs = 60_000): Promise<void> {
  const expiresAt = Date.now() + timeoutMs;
  let lastError = "no response";
  while (Date.now() < expiresAt) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 200));
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError}`);
}

function firstString(value: unknown): string | null {
  return Array.isArray(value) && typeof value[0] === "string" ? value[0] : null;
}

function parseAddress(output: string, label: string): string {
  const expression = new RegExp(
    `${label}:\\s+(?:contract\\s+[A-Za-z0-9_]+\\s+)?(0x[a-fA-F0-9]{40})`,
    "i",
  );
  const address = expression.exec(output)?.[1];
  if (!address) throw new Error(`DeployLocal output is missing ${label}`);
  return address;
}

async function prepareRuntimeDirectory(): Promise<void> {
  assertInsideRoot(runtimeDirectory);
  await rm(runtimeDirectory, { recursive: true, force: true });
  await mkdir(runtimeDirectory, { recursive: true });
}

async function startAnvil(): Promise<string> {
  const anvilExecutable = await foundryExecutable("anvil");
  startManaged(
    "Anvil",
    anvilExecutable,
    [
      "--host",
      "127.0.0.1",
      "--port",
      "8545",
      "--chain-id",
      chainId.toString(),
      "--accounts",
      "20",
      "--balance",
      "10000",
      "--mnemonic-random",
      "24",
      "--config-out",
      anvilConfigPath,
      "--quiet",
    ],
    {
      ...process.env,
      RUST_LOG: "error",
    },
    "ignore",
  );
  await Promise.all([waitForRpc(), waitForFile(anvilConfigPath)]);
  await chmod(anvilConfigPath, 0o600);
  const config = JSON.parse(
    await readFile(anvilConfigPath, "utf8"),
  ) as AnvilConfig;
  const account = firstString(config.available_accounts);
  const privateKey = firstString(config.private_keys);
  if (
    !account ||
    !/^0x[a-fA-F0-9]{40}$/.test(account) ||
    !privateKey ||
    !/^0x[a-fA-F0-9]{64}$/.test(privateKey)
  ) {
    throw new Error("Anvil did not provide a valid ephemeral deployer");
  }
  await rm(anvilConfigPath, { force: true });
  return privateKey;
}

async function deployContracts(privateKey: string): Promise<Deployment> {
  const forgeExecutable = await foundryExecutable("forge");
  const output = await capture(
    forgeExecutable,
    [
      "script",
      "script/DeployLocal.s.sol:DeployLocal",
      "--rpc-url",
      rpcUrl,
      "--broadcast",
      "-vv",
    ],
    {
      cwd: join(root, "packages", "contracts"),
      sensitive: true,
      environment: {
        ...process.env,
        DEPLOYER_PRIVATE_KEY: privateKey,
        CREATION_FEE_WEI: "1000000000000000",
        MIN_INITIAL_LIQUIDITY_WEI: "10000000000000000",
      },
    },
  );
  const blockHex = await rpc<string>("eth_blockNumber");
  const deployment: Deployment = {
    chainId,
    rpcUrl,
    deployedAt: new Date().toISOString(),
    deployedBlock: BigInt(blockHex).toString(),
    protocolConfig: parseAddress(output, "protocolConfig"),
    launchFactory: parseAddress(output, "launchFactory"),
    localAdapter: parseAddress(output, "localAdapter"),
    adapterKind: "local-test-only",
  };
  await writeFile(deploymentPath, `${JSON.stringify(deployment, null, 2)}\n`, {
    mode: 0o600,
  });
  return deployment;
}

async function startApplication(deployment: Deployment): Promise<void> {
  const sharedEnvironment = {
    ...process.env,
    NODE_ENV: "development",
    CHAIN_ID: chainId.toString(),
    RPC_URL: rpcUrl,
    ANVIL_RPC_URL: rpcUrl,
    FACTORY_ADDRESS: deployment.launchFactory,
    LAUNCH_FACTORY_ADDRESS: deployment.launchFactory,
    PROTOCOL_CONFIG_ADDRESS: deployment.protocolConfig,
    AMM_ADAPTER_ADDRESS: deployment.localAdapter,
    LOCAL_DEPLOYMENT_MANIFEST: deploymentPath,
  };
  const indexerCommand = pnpmInvocation([
    "exec",
    "tsx",
    "apps/indexer/src/server.ts",
  ]);
  startManaged("Indexer", indexerCommand.executable, indexerCommand.args, {
    ...sharedEnvironment,
    INDEXER_PORT: "8787",
    INDEXER_DATABASE_PATH: join(runtimeDirectory, "indexer.sqlite"),
    INDEXER_SOURCE: "onchain-indexer",
    INDEXER_CORS_ORIGIN: webUrl,
    INDEXER_UPLOAD_DIRECTORY: join(runtimeDirectory, "uploads"),
    INDEXER_PUBLIC_BASE_URL: indexerUrl,
    INDEXER_RPC_URL: rpcUrl,
    INDEXER_CHAIN_ID: chainId.toString(),
    INDEXER_FACTORY_ADDRESS: deployment.launchFactory,
    INDEXER_LAUNCH_FACTORY_ADDRESS: deployment.launchFactory,
    INDEXER_PROTOCOL_CONFIG_ADDRESS: deployment.protocolConfig,
    INDEXER_ADAPTER_ADDRESS: deployment.localAdapter,
    INDEXER_START_BLOCK: deployment.deployedBlock,
    INDEXER_DEPLOYED_BLOCK: deployment.deployedBlock,
    INDEXER_CONFIRMATIONS: "0",
    INDEXER_POLL_INTERVAL_MS: "250",
  });
  await waitForHttp(`${indexerUrl}/health`);

  const webCommand = pnpmInvocation([
    "--filter",
    "@forge/web",
    "exec",
    "vite",
    "--host",
    "127.0.0.1",
    "--port",
    webPort.toString(),
    "--strictPort",
  ]);
  startManaged("Web", webCommand.executable, webCommand.args, {
    ...sharedEnvironment,
    VITE_CHAIN_ID: chainId.toString(),
    VITE_CHAIN_NAME: "Anvil (Forge local fixture)",
    VITE_LOCAL_RPC_URL: rpcUrl,
    VITE_INDEXER_URL: indexerUrl,
    VITE_FACTORY_ADDRESS: deployment.launchFactory,
    VITE_PROTOCOL_CONFIG_ADDRESS: deployment.protocolConfig,
    VITE_LOCAL_AMM_ADAPTER_ADDRESS: deployment.localAdapter,
  });
  await waitForHttp(webUrl);
}

async function main(): Promise<void> {
  await prepareRuntimeDirectory();
  const privateKey = await startAnvil();
  const deployment = await deployContracts(privateKey);
  await startApplication(deployment);
  console.log(
    `[local-stack] 준비됨: web=${webUrl}, indexer=${indexerUrl}, chain=${chainId}`,
  );
  console.log(
    `[local-stack] contracts: factory=${deployment.launchFactory}, adapter=${deployment.localAdapter}`,
  );
  await new Promise<never>(() => undefined);
}

process.once("SIGINT", () => {
  void shutdown(0);
});
process.once("SIGTERM", () => {
  void shutdown(0);
});

main().catch((error: unknown) => {
  console.error(
    `[local-stack] 시작 실패: ${error instanceof Error ? error.message : String(error)}`,
  );
  void shutdown(1);
});
