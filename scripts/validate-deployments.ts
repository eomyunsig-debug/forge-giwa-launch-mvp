import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import Ajv2020 from "ajv/dist/2020.js";

const deploymentDirectory = resolve(
  process.cwd(),
  "packages/contracts/deployments",
);
const schemaPath = resolve(deploymentDirectory, "manifest.schema.json");

async function main(): Promise<void> {
  const schema = JSON.parse(await readFile(schemaPath, "utf8")) as object;
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);

  function formattedErrors(): string {
    return ajv.errorsText(validate.errors, { separator: "\n  " });
  }

  function assertValid(value: unknown, label: string): void {
    if (!validate(value)) {
      throw new Error(`${label} is invalid:\n  ${formattedErrors()}`);
    }
  }

  function assertInvalid(value: unknown, label: string): void {
    if (validate(value)) {
      throw new Error(`${label} unexpectedly passed deployment validation`);
    }
  }

  const manifestNames = (await readdir(deploymentDirectory))
    .filter((name) => name.endsWith(".json") && name !== "manifest.schema.json")
    .sort();
  for (const name of manifestNames) {
    const path = resolve(deploymentDirectory, name);
    assertValid(JSON.parse(await readFile(path, "utf8")) as unknown, name);
  }

  const address = `0x${"1".repeat(40)}`;
  const zeroAddress = `0x${"0".repeat(40)}`;
  const bytes32 = `0x${"2".repeat(64)}`;
  const validGiwaDeployment = {
    schemaVersion: 1,
    network: "giwa-testnet",
    chainId: 91_342,
    deployed: true,
    contracts: {
      protocolConfig: address,
      launchFactory: address,
      ammAdapter: address,
    },
    ammIntegration: {
      kind: "uniswap-v2-compatible-candidate",
      integrationApproved: true,
    },
    deploymentEvidence: {
      deployedBlock: 1,
      broadcastTxHashes: [bytes32],
      adapterId: bytes32,
      protocolConfigRuntimeCodeHash: bytes32,
      launchFactoryRuntimeCodeHash: bytes32,
      ammAdapterRuntimeCodeHash: bytes32,
      verifiedSourceUrls: [
        "https://sepolia-explorer.giwa.io/address/protocol",
        "https://sepolia-explorer.giwa.io/address/factory",
        "https://sepolia-explorer.giwa.io/address/adapter",
      ],
    },
  };
  assertValid(validGiwaDeployment, "synthetic complete GIWA deployment");
  assertInvalid(
    { ...validGiwaDeployment, chainId: null },
    "null deployed chain ID probe",
  );
  assertInvalid(
    {
      ...validGiwaDeployment,
      contracts: { arbitraryContract: address },
    },
    "arbitrary deployed contract key probe",
  );
  assertInvalid(
    {
      ...validGiwaDeployment,
      contracts: {
        ...validGiwaDeployment.contracts,
        protocolConfig: zeroAddress,
      },
    },
    "zero deployed address probe",
  );
  assertInvalid(
    {
      ...validGiwaDeployment,
      contracts: {
        protocolConfig: address,
        launchFactory: address,
      },
    },
    "incomplete deployed address probe",
  );
  assertInvalid(
    { ...validGiwaDeployment, chainId: 1 },
    "wrong GIWA chain probe",
  );
  const { deploymentEvidence: _deploymentEvidence, ...missingEvidence } =
    validGiwaDeployment;
  assertInvalid(
    missingEvidence,
    "deployed manifest without transaction and bytecode evidence",
  );
  assertInvalid(
    {
      ...validGiwaDeployment,
      deploymentEvidence: {
        ...validGiwaDeployment.deploymentEvidence,
        ammAdapterRuntimeCodeHash: "0x1234",
      },
    },
    "deployed manifest with malformed runtime bytecode hash",
  );
  const validSelfHostedTestnetDeployment = {
    ...validGiwaDeployment,
    ammIntegration: {
      kind: "forge-self-hosted-constant-product-testnet",
      integrationApproved: true,
      testOnly: true,
    },
    deploymentEvidence: {
      ...validGiwaDeployment.deploymentEvidence,
      adapterId:
        "0x7cc46dc44520b82e1e4f957c97a99ddaf86723ac155212e8cabe0850adab8567",
    },
  };
  assertValid(
    validSelfHostedTestnetDeployment,
    "synthetic self-hosted GIWA testnet deployment",
  );
  assertInvalid(
    {
      ...validSelfHostedTestnetDeployment,
      ammIntegration: {
        ...validSelfHostedTestnetDeployment.ammIntegration,
        testOnly: false,
      },
    },
    "self-hosted GIWA adapter without test-only disclosure",
  );
  assertInvalid(
    {
      ...validSelfHostedTestnetDeployment,
      deploymentEvidence: {
        ...validSelfHostedTestnetDeployment.deploymentEvidence,
        adapterId: bytes32,
      },
    },
    "self-hosted GIWA deployment with the wrong adapter identity",
  );
  assertInvalid(
    {
      ...validSelfHostedTestnetDeployment,
      ammIntegration: {
        ...validSelfHostedTestnetDeployment.ammIntegration,
        integrationApproved: false,
      },
    },
    "deployed but unapproved GIWA integration",
  );

  process.stdout.write(
    `Validated ${manifestNames.length.toString()} deployment manifests and fail-closed probes.\n`,
  );
}

void main();
