import { describe, expect, it } from "vitest";

import { parseTargetChainId, resolveContractDeployment } from "../src/config";

const factory = "0x1111111111111111111111111111111111111111";
const protocolConfig = "0x2222222222222222222222222222222222222222";
const adapter = "0x3333333333333333333333333333333333333333";

describe("web chain allowlist", () => {
  it("accepts only local Anvil and the official GIWA Sepolia chain", () => {
    expect(parseTargetChainId(undefined)).toBe(31_337);
    expect(parseTargetChainId("31337")).toBe(31_337);
    expect(parseTargetChainId("91342")).toBe(91_342);
  });

  it.each(["", "1", "31338", "91342.0", "not-a-chain"])(
    "fails closed for unsupported chain input %s",
    (value) => {
      expect(() => parseTargetChainId(value)).toThrow("CHAIN_ID_UNSUPPORTED");
    },
  );
});

describe("web deployment allowlist", () => {
  it("keeps GIWA execution disabled without the exact explicit mode", () => {
    expect(
      resolveContractDeployment(91_342, {
        giwaFactoryAddress: factory,
        giwaProtocolConfigAddress: protocolConfig,
        giwaSelfHostedAdapterAddress: adapter,
        giwaDeployedBlock: "123",
      }),
    ).toBeNull();
    expect(
      resolveContractDeployment(91_342, {
        giwaDeploymentMode: "disabled",
        giwaFactoryAddress: factory,
        giwaProtocolConfigAddress: protocolConfig,
        giwaSelfHostedAdapterAddress: adapter,
        giwaDeployedBlock: "123",
      }),
    ).toBeNull();
    expect(() =>
      resolveContractDeployment(91_342, {
        giwaDeploymentMode: "giwa-reviewed",
        giwaFactoryAddress: factory,
        giwaProtocolConfigAddress: protocolConfig,
        giwaSelfHostedAdapterAddress: adapter,
        giwaDeployedBlock: "123",
      }),
    ).toThrow("GIWA_DEPLOYMENT_MODE_UNSUPPORTED");
  });

  it("constructs only a complete self-hosted test-only GIWA deployment", () => {
    expect(
      resolveContractDeployment(91_342, {
        giwaDeploymentMode: "giwa-self-hosted-test-only",
        giwaFactoryAddress: factory,
        giwaProtocolConfigAddress: protocolConfig,
        giwaSelfHostedAdapterAddress: adapter,
        giwaDeployedBlock: "123456",
      }),
    ).toEqual({
      chainId: 91_342,
      factory,
      protocolConfig,
      adapter,
      deployedBlock: 123_456n,
      adapterKind: "giwa-self-hosted-test-only",
    });
  });

  it.each([
    ["factory", { giwaFactoryAddress: undefined }],
    ["protocol config", { giwaProtocolConfigAddress: undefined }],
    ["adapter", { giwaSelfHostedAdapterAddress: undefined }],
    ["deployed block", { giwaDeployedBlock: undefined }],
  ])("rejects an incomplete GIWA deployment missing %s", (_label, missing) => {
    expect(() =>
      resolveContractDeployment(91_342, {
        giwaDeploymentMode: "giwa-self-hosted-test-only",
        giwaFactoryAddress: factory,
        giwaProtocolConfigAddress: protocolConfig,
        giwaSelfHostedAdapterAddress: adapter,
        giwaDeployedBlock: "123",
        ...missing,
      }),
    ).toThrow(/GIWA_SELF_HOSTED_/u);
  });

  it.each(["0", "-1", "1.5", "latest"])(
    "rejects invalid GIWA deployment block %s",
    (giwaDeployedBlock) => {
      expect(() =>
        resolveContractDeployment(91_342, {
          giwaDeploymentMode: "giwa-self-hosted-test-only",
          giwaFactoryAddress: factory,
          giwaProtocolConfigAddress: protocolConfig,
          giwaSelfHostedAdapterAddress: adapter,
          giwaDeployedBlock,
        }),
      ).toThrow("GIWA_SELF_HOSTED_DEPLOYED_BLOCK_INVALID");
    },
  );

  it("rejects zero, malformed, and duplicate GIWA addresses", () => {
    expect(() =>
      resolveContractDeployment(91_342, {
        giwaDeploymentMode: "giwa-self-hosted-test-only",
        giwaFactoryAddress: "0x0000000000000000000000000000000000000000",
        giwaProtocolConfigAddress: protocolConfig,
        giwaSelfHostedAdapterAddress: adapter,
        giwaDeployedBlock: "123",
      }),
    ).toThrow("GIWA_SELF_HOSTED_FACTORY_ADDRESS_INVALID");
    expect(() =>
      resolveContractDeployment(91_342, {
        giwaDeploymentMode: "giwa-self-hosted-test-only",
        giwaFactoryAddress: "not-an-address",
        giwaProtocolConfigAddress: protocolConfig,
        giwaSelfHostedAdapterAddress: adapter,
        giwaDeployedBlock: "123",
      }),
    ).toThrow("GIWA_SELF_HOSTED_FACTORY_ADDRESS_INVALID");
    expect(() =>
      resolveContractDeployment(91_342, {
        giwaDeploymentMode: "giwa-self-hosted-test-only",
        giwaFactoryAddress: factory,
        giwaProtocolConfigAddress: factory,
        giwaSelfHostedAdapterAddress: adapter,
        giwaDeployedBlock: "123",
      }),
    ).toThrow("GIWA_SELF_HOSTED_DEPLOYMENT_ADDRESSES_NOT_DISTINCT");
  });

  it("forces every public-demo build to remain deployment-free", () => {
    expect(
      resolveContractDeployment(91_342, {
        publicDemo: true,
        giwaDeploymentMode: "giwa-self-hosted-test-only",
        giwaFactoryAddress: factory,
        giwaProtocolConfigAddress: protocolConfig,
        giwaSelfHostedAdapterAddress: adapter,
        giwaDeployedBlock: "123",
      }),
    ).toBeNull();
  });

  it("preserves the local fixture deployment path", () => {
    expect(
      resolveContractDeployment(31_337, {
        localFactoryAddress: factory,
        localProtocolConfigAddress: protocolConfig,
        localAdapterAddress: adapter,
      }),
    ).toEqual({
      chainId: 31_337,
      factory,
      protocolConfig,
      adapter,
      deployedBlock: 0n,
      adapterKind: "local-test-only",
    });
  });
});
