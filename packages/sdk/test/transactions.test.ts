import {
  decodeFunctionData,
  encodeFunctionData,
  type Address,
  type PublicClient,
} from "viem";
import { describe, expect, it, vi } from "vitest";

import {
  ammAdapterAbi,
  buildLaunchRequest,
  fetchTradeQuote,
  launchFactoryAbi,
  vestingVaultAbi,
  type ContractDeployment,
} from "../src/index.js";

const account = "0x1111111111111111111111111111111111111111";
const token = "0x2222222222222222222222222222222222222222";
const factory = "0x3333333333333333333333333333333333333333";
const protocolConfig = "0x4444444444444444444444444444444444444444";
const adapter = "0x5555555555555555555555555555555555555555";
const pool = "0x6666666666666666666666666666666666666666";
const metadataHash = `0x${"ab".repeat(32)}` as const;
const localAdapterId =
  "0x529107a6fffee894eacf393d5603c815b5a160079f631af8c950fa0decb0a353";
const giwaReviewedAdapterId =
  "0x86083f9bb77f3cd1ba3747500b712be58a9fd20e7becf9bf1fc328de44f91ed4";
const giwaSelfHostedAdapterId =
  "0x7cc46dc44520b82e1e4f957c97a99ddaf86723ac155212e8cabe0850adab8567";

const deployment: ContractDeployment = {
  chainId: 31_337,
  factory,
  protocolConfig,
  adapter,
  deployedBlock: 1n,
  adapterKind: "local-test-only",
};

function mockClient(
  implementation: (functionName: string) => unknown,
  adapterSafety: {
    adapterEnabled?: boolean;
    configured?: boolean;
    adapterId?: `0x${string}`;
    testOnly?: boolean;
  } = {},
): PublicClient {
  const safety = {
    adapterEnabled: true,
    configured: true,
    adapterId: localAdapterId,
    testOnly: true,
    ...adapterSafety,
  };
  return {
    readContract: vi.fn(({ functionName }: { functionName: string }) => {
      if (functionName === "adapterEnabled")
        return Promise.resolve(safety.adapterEnabled);
      if (functionName === "isConfigured")
        return Promise.resolve(safety.configured);
      if (functionName === "adapterId")
        return Promise.resolve(safety.adapterId);
      if (functionName === "isTestOnly")
        return Promise.resolve(safety.testOnly);
      return Promise.resolve(implementation(functionName));
    }),
  } as unknown as PublicClient;
}

describe("launch transaction builder", () => {
  it("commits the exact uploaded metadata hash and exact msg.value", async () => {
    const client = mockClient((functionName) => {
      if (functionName === "creationFee") return 10n;
      if (functionName === "minimumInitialLiquidity") return 100n;
      throw new Error(`unexpected read: ${functionName}`);
    });

    const request = await buildLaunchRequest(
      client,
      deployment,
      account,
      {
        name: "Forge Friends",
        symbol: "FORGE",
        description: "A community test token.",
        imageUrl: "http://127.0.0.1:8787/uploads/image.png",
        metadataUri: "http://127.0.0.1:8787/uploads/metadata.json",
        metadataHash,
        creatorAllocationBps: 500,
        nativeLiquidityWei: "100",
      },
      { now: 1_000, deadlineSeconds: 600 },
    );

    const decoded = decodeFunctionData({
      abi: launchFactoryAbi,
      data: request.data,
    });
    const launch = decoded.args[0] as {
      metadataHash: `0x${string}`;
      deadline: bigint;
      creatorAllocationBps: number;
    };

    expect(request.account).toBe(account);
    expect(request.to).toBe(factory);
    expect(request.value).toBe(110n);
    expect(launch.metadataHash).toBe(metadataHash);
    expect(launch.deadline).toBe(1_600n);
    expect(launch.creatorAllocationBps).toBe(500);
  });

  it("fails closed when the configured adapter is unavailable", async () => {
    const client = mockClient(
      (functionName) => {
        if (functionName === "creationFee") return 0n;
        if (functionName === "minimumInitialLiquidity") return 1n;
        throw new Error(`unexpected read: ${functionName}`);
      },
      { configured: false },
    );

    await expect(
      buildLaunchRequest(client, deployment, account, {
        name: "Forge",
        symbol: "FRG",
        description: "test",
        imageUrl: "http://localhost/image.png",
        metadataUri: "http://localhost/metadata.json",
        metadataHash,
        creatorAllocationBps: 0,
        nativeLiquidityWei: "1",
      }),
    ).rejects.toThrow("AMM_ADAPTER_DISABLED");
  });

  it("rejects a configured address that does not prove the expected adapter identity", async () => {
    const client = mockClient(
      (functionName) => {
        if (functionName === "creationFee") return 0n;
        if (functionName === "minimumInitialLiquidity") return 1n;
        throw new Error(`unexpected read: ${functionName}`);
      },
      { adapterId: `0x${"ff".repeat(32)}` },
    );

    await expect(
      buildLaunchRequest(client, deployment, account, {
        name: "Forge",
        symbol: "FRG",
        description: "test",
        imageUrl: "http://localhost/image.png",
        metadataUri: "http://localhost/metadata.json",
        metadataHash,
        creatorAllocationBps: 0,
        nativeLiquidityWei: "1",
      }),
    ).rejects.toThrow("AMM_ADAPTER_IDENTITY_MISMATCH");
  });

  it("never builds a launch for an explicitly disabled GIWA adapter", async () => {
    const client = mockClient(() => {
      throw new Error("disabled deployments must not perform RPC reads");
    });

    await expect(
      buildLaunchRequest(
        client,
        { ...deployment, adapterKind: "giwa-disabled" },
        account,
        {
          name: "Forge",
          symbol: "FRG",
          description: "test",
          imageUrl: "http://localhost/image.png",
          metadataUri: "http://localhost/metadata.json",
          metadataHash,
          creatorAllocationBps: 0,
          nativeLiquidityWei: "1",
        },
      ),
    ).rejects.toThrow("GIWA_AMM_INTEGRATION_DISABLED");
  });
});

describe("trade quote builder", () => {
  it("shows the enforced local-pool fee and applies slippage", async () => {
    const client = mockClient((functionName) => {
      if (functionName === "quoteExactInput") return 900n;
      if (functionName === "getPoolState") {
        return {
          pool,
          tokenReserve: 10_000n,
          nativeReserve: 1_000n,
          totalLiquidity: 1_000n,
          initialized: true,
        };
      }
      throw new Error(`unexpected read: ${functionName}`);
    });

    const quote = await fetchTradeQuote(
      client,
      deployment,
      account,
      token,
      "buy",
      100n,
      { slippageBps: 100, nowMs: 1_000_000 },
    );

    expect(quote.amountOut).toBe(900n);
    expect(quote.minAmountOut).toBe(891n);
    expect(quote.priceImpactBps).toBe(1_000);
    expect(quote.feeBps).toBe(30);
    expect(quote.deadline).toBe(1_030);
    expect(quote.expiresAt).toBe(quote.deadline * 1_000);
  });

  it("uses the earliest quote TTL or requested onchain deadline", async () => {
    const client = mockClient((functionName) => {
      if (functionName === "quoteExactInput") return 900n;
      if (functionName === "getPoolState") {
        return {
          pool,
          tokenReserve: 10_000n,
          nativeReserve: 1_000n,
          totalLiquidity: 1_000n,
          initialized: true,
        };
      }
      throw new Error(`unexpected read: ${functionName}`);
    });

    const quote = await fetchTradeQuote(
      client,
      deployment,
      account,
      token,
      "buy",
      100n,
      {
        slippageBps: 100,
        nowMs: 1_000_000,
        ttlMs: 60_000,
        deadlineSeconds: 20,
      },
    );

    expect(quote.deadline).toBe(1_020);
    expect(quote.expiresAt).toBe(1_020_000);
  });

  it("keeps an unverified GIWA swap fee undisclosed", async () => {
    const client = mockClient(
      (functionName) => {
        if (functionName === "quoteExactInput") return 900n;
        if (functionName === "getPoolState") {
          return {
            pool,
            tokenReserve: 10_000n,
            nativeReserve: 1_000n,
            totalLiquidity: 1_000n,
            initialized: true,
          };
        }
        throw new Error(`unexpected read: ${functionName}`);
      },
      { adapterId: giwaReviewedAdapterId, testOnly: false },
    );

    await expect(
      fetchTradeQuote(
        client,
        { ...deployment, adapterKind: "giwa-disabled" },
        account,
        token,
        "buy",
        100n,
        { slippageBps: 100, nowMs: 1_000_000 },
      ),
    ).rejects.toThrow("GIWA_AMM_INTEGRATION_DISABLED");
    expect(client.readContract).not.toHaveBeenCalled();
  });

  it("keeps an approved GIWA fee undisclosed until the adapter exposes it", async () => {
    const client = mockClient(
      (functionName) => {
        if (functionName === "quoteExactInput") return 900n;
        if (functionName === "getPoolState") {
          return {
            pool,
            tokenReserve: 10_000n,
            nativeReserve: 1_000n,
            totalLiquidity: 1_000n,
            initialized: true,
          };
        }
        throw new Error(`unexpected read: ${functionName}`);
      },
      { adapterId: giwaReviewedAdapterId, testOnly: false },
    );

    const quote = await fetchTradeQuote(
      client,
      { ...deployment, adapterKind: "giwa-reviewed" },
      account,
      token,
      "buy",
      100n,
      { slippageBps: 100, nowMs: 1_000_000 },
    );

    expect(quote.feeBps).toBeNull();
  });

  it("discloses the fixed fee for the self-hosted GIWA test adapter", async () => {
    const client = mockClient(
      (functionName) => {
        if (functionName === "quoteExactInput") return 900n;
        if (functionName === "getPoolState") {
          return {
            pool,
            tokenReserve: 10_000n,
            nativeReserve: 1_000n,
            totalLiquidity: 1_000n,
            initialized: true,
          };
        }
        throw new Error(`unexpected read: ${functionName}`);
      },
      { adapterId: giwaSelfHostedAdapterId, testOnly: true },
    );

    const quote = await fetchTradeQuote(
      client,
      { ...deployment, adapterKind: "giwa-self-hosted-test-only" },
      account,
      token,
      "buy",
      100n,
      { slippageBps: 100, nowMs: 1_000_000 },
    );

    expect(quote.feeBps).toBe(30);
  });
});

describe("vesting ABI", () => {
  it.each(["totalAllocation", "released", "lockedAmount"] as const)(
    "encodes the deployed %s view",
    (functionName) => {
      expect(
        encodeFunctionData({
          abi: vestingVaultAbi,
          functionName,
        }),
      ).toMatch(/^0x[0-9a-f]{8}$/);
    },
  );

  it("keeps adapter quote encoding compatible", () => {
    expect(
      encodeFunctionData({
        abi: ammAdapterAbi,
        functionName: "quoteExactInput",
        args: [token as Address, true, 1n],
      }),
    ).toMatch(/^0x[0-9a-f]+$/);
  });
});
