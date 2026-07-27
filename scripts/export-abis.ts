import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const contracts = [
  ["LaunchToken", "LaunchToken.sol/LaunchToken.json"],
  ["LaunchFactory", "LaunchFactory.sol/LaunchFactory.json"],
  ["CreatorVestingVault", "CreatorVestingVault.sol/CreatorVestingVault.json"],
  [
    "PermanentLiquidityLocker",
    "PermanentLiquidityLocker.sol/PermanentLiquidityLocker.json",
  ],
  ["ProtocolConfig", "ProtocolConfig.sol/ProtocolConfig.json"],
  ["IAMMAdapter", "IAMMAdapter.sol/IAMMAdapter.json"],
  [
    "LocalConstantProductAdapter",
    "LocalConstantProductAdapter.sol/LocalConstantProductAdapter.json",
  ],
  ["GiwaV2Adapter", "GiwaV2Adapter.sol/GiwaV2Adapter.json"],
] as const;

async function main(): Promise<void> {
  const outputDirectory = resolve(root, "artifacts/abi");
  await mkdir(outputDirectory, { recursive: true });

  for (const [name, artifactPath] of contracts) {
    const sourcePath = resolve(root, "packages/contracts/out", artifactPath);
    const artifact = JSON.parse(await readFile(sourcePath, "utf8")) as {
      abi?: unknown;
    };
    if (!Array.isArray(artifact.abi)) {
      throw new Error(`Foundry artifact has no ABI: ${sourcePath}`);
    }
    await writeFile(
      resolve(outputDirectory, `${name}.json`),
      `${JSON.stringify(artifact.abi, null, 2)}\n`,
      "utf8",
    );
  }

  await writeFile(
    resolve(outputDirectory, "manifest.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        generator: "scripts/export-abis.ts",
        contracts: contracts.map(([name]) => `${name}.json`),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  process.stdout.write(`Exported ${contracts.length} ABIs to artifacts/abi\n`);
}

void main();
