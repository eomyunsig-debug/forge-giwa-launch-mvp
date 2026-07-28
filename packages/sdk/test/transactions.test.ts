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
): PublicClient {
  return {
    readContract: vi.fn(({ functionName }: { functionName: string }) =>
      Promise.resolve(implementation(functionName)),
    ),
  } as unknown as PublicClient;
}

describe("launch transaction builder", () => {
  it("commits the exact uploaded metadata hash and exact msg.value", async () => {
    const client = mockClient((functionName) => {
      if (functionName === "creationFee") return 10n;
      if (functionName === "minimumInitialLiquidity") return 100n;
      if (functionName === "adapterEnabled") return true;
      if (functionName === "isConfigured") return true;
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
    const client = mockClient((functionName) => {
      if (functionName === "creationFee") return 0n;
      if (functionName === "minimumInitialLiquidity") return 1n;
      if (functionName === "adapterEnabled") return true;
      if (functionName === "isConfigured") return false;
      throw new Error(`unexpected read: ${functionName}`);
    });

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
      { ...deployment, adapterKind: "giwa-reviewed" },
      account,
      token,
      "buy",
      100n,
      { slippageBps: 100, nowMs: 1_000_000 },
    );

    expect(quote.feeBps).toBeNull();
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
