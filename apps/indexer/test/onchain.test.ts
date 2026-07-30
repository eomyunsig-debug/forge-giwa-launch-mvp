import { describe, expect, it, vi } from "vitest";
import {
  encodeAbiParameters,
  encodeEventTopics,
  parseAbiItem,
  parseAbiParameters,
  type PublicClient,
} from "viem";

import {
  decodeGiwaSelfHostedPoolLog,
  decodeV2PairLog,
  ForgeRpcBlockSource,
  resolvePoolEventKind,
} from "../src/onchain.js";
import { normalizeAddress } from "../src/types.js";

const TOKEN = "0x1111111111111111111111111111111111111111";
const POOL = "0x2222222222222222222222222222222222222222";
const SENDER = "0x3333333333333333333333333333333333333333";
const RECIPIENT = "0x4444444444444444444444444444444444444444";
const FACTORY = "0x5555555555555555555555555555555555555555";
const BLOCK_HASH = `0x${"a".repeat(64)}`;
const PARENT_HASH = `0x${"b".repeat(64)}`;
const TRANSACTION_HASH = `0x${"c".repeat(64)}`;

const swapEvent = parseAbiItem(
  "event Swap(address indexed sender,uint256 amount0In,uint256 amount1In,uint256 amount0Out,uint256 amount1Out,address indexed to)",
);
const syncEvent = parseAbiItem("event Sync(uint112 reserve0,uint112 reserve1)");
const selfHostedSwapEvent = parseAbiItem(
  "event Swap(address indexed recipient,bool indexed nativeToToken,uint256 amountIn,uint256 amountOut,uint256 tokenReserve,uint256 nativeReserve)",
);
const selfHostedReservesSyncedEvent = parseAbiItem(
  "event ReservesSynced(uint256 tokenReserve,uint256 nativeReserve)",
);

describe("standard V2 pair event decoder", () => {
  it("fails closed when a chain is paired with the wrong event decoder", () => {
    expect(resolvePoolEventKind(31_337)).toBe("local");
    expect(resolvePoolEventKind(91_342)).toBe("v2");
    expect(resolvePoolEventKind(91_342, "giwa-self-hosted-test-only")).toBe(
      "giwa-self-hosted-test-only",
    );
    expect(() => resolvePoolEventKind(91_342, "local")).toThrow(
      /invalid for chain 91342/u,
    );
    expect(() => resolvePoolEventKind(31_337, "v2")).toThrow(
      /invalid for chain 31337/u,
    );
    expect(() =>
      resolvePoolEventKind(31_337, "giwa-self-hosted-test-only"),
    ).toThrow(/invalid for chain 31337/u);
    expect(() => resolvePoolEventKind(1)).toThrow(
      /Unsupported Forge indexer chain/u,
    );
  });

  it("decodes a native-to-token buy when the launch token is token0", () => {
    const event = decodeV2PairLog(
      {
        topics: encodeEventTopics({
          abi: [swapEvent],
          eventName: "Swap",
          args: { sender: SENDER, to: RECIPIENT },
        }) as [`0x${string}`, ...`0x${string}`[]],
        data: encodeAbiParameters(
          parseAbiParameters(
            "uint256 amount0In,uint256 amount1In,uint256 amount0Out,uint256 amount1Out",
          ),
          [0n, 10n, 90n, 0n],
        ),
      },
      POOL,
      { tokenAddress: normalizeAddress(TOKEN), tokenIs0: true },
    );

    expect(event).toMatchObject({
      type: "TradeExecuted",
      side: "buy",
      nativeAmount: "10",
      tokenAmount: "90",
      traderAddress: normalizeAddress(RECIPIENT),
    });
  });

  it("decodes a token-to-native sell when the launch token is token1", () => {
    const event = decodeV2PairLog(
      {
        topics: encodeEventTopics({
          abi: [swapEvent],
          eventName: "Swap",
          args: { sender: SENDER, to: RECIPIENT },
        }) as [`0x${string}`, ...`0x${string}`[]],
        data: encodeAbiParameters(
          parseAbiParameters(
            "uint256 amount0In,uint256 amount1In,uint256 amount0Out,uint256 amount1Out",
          ),
          [0n, 75n, 8n, 0n],
        ),
      },
      POOL,
      { tokenAddress: normalizeAddress(TOKEN), tokenIs0: false },
    );

    expect(event).toMatchObject({
      type: "TradeExecuted",
      side: "sell",
      nativeAmount: "8",
      tokenAmount: "75",
    });
  });

  it("maps Sync reserves to native and token sides without Number conversion", () => {
    const event = decodeV2PairLog(
      {
        topics: encodeEventTopics({
          abi: [syncEvent],
          eventName: "Sync",
        }) as [`0x${string}`, ...`0x${string}`[]],
        data: encodeAbiParameters(
          parseAbiParameters("uint112 reserve0,uint112 reserve1"),
          [123_456_789_012_345_678_901n, 987_654_321_098_765_432_109n],
        ),
      },
      POOL,
      { tokenAddress: normalizeAddress(TOKEN), tokenIs0: true },
    );

    expect(event).toMatchObject({
      type: "LiquidityUpdated",
      tokenReserve: "123456789012345678901",
      nativeReserve: "987654321098765432109",
    });
  });
});

describe("GIWA self-hosted test-only pool event decoder", () => {
  it("indexes the custom pool without probing V2 token orientation", async () => {
    const topics = encodeEventTopics({
      abi: [selfHostedSwapEvent],
      eventName: "Swap",
      args: { recipient: RECIPIENT, nativeToToken: true },
    }) as [`0x${string}`, ...`0x${string}`[]];
    const data = encodeAbiParameters(
      parseAbiParameters(
        "uint256 amountIn,uint256 amountOut,uint256 tokenReserve,uint256 nativeReserve",
      ),
      [10n, 90n, 910n, 110n],
    );
    const readContract = vi.fn();
    const getLogs = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          address: POOL,
          blockHash: BLOCK_HASH,
          blockNumber: 1n,
          transactionHash: TRANSACTION_HASH,
          transactionIndex: 0,
          logIndex: 0,
          topics,
          data,
        },
      ]);
    const client = {
      getBlock: vi.fn().mockResolvedValue({
        number: 1n,
        hash: BLOCK_HASH,
        parentHash: PARENT_HASH,
        timestamp: 1_700_000_000n,
      }),
      getLogs,
      getTransaction: vi.fn().mockResolvedValue({ from: SENDER }),
      readContract,
    } as unknown as PublicClient;
    const source = new ForgeRpcBlockSource({
      rpcUrl: "http://127.0.0.1:8545",
      chainId: 91_342,
      factoryAddress: FACTORY,
      poolEventKind: "giwa-self-hosted-test-only",
      trackedContracts: () => ({
        tokens: [],
        pools: new Map([[POOL, TOKEN]]),
        vaults: [],
      }),
      client,
    });

    const block = await source.getBlock(91_342, 1n);

    expect(readContract).not.toHaveBeenCalled();
    expect(getLogs).toHaveBeenCalledTimes(2);
    expect(block.logs).toHaveLength(1);
    expect(block.logs[0]?.decoded).toMatchObject({
      type: "TradeExecuted",
      traderAddress: normalizeAddress(SENDER),
      side: "buy",
      nativeAmount: "10",
      tokenAmount: "90",
    });
  });

  it("decodes the custom native-to-token Swap with canonical reserves", () => {
    const event = decodeGiwaSelfHostedPoolLog(
      {
        topics: encodeEventTopics({
          abi: [selfHostedSwapEvent],
          eventName: "Swap",
          args: { recipient: RECIPIENT, nativeToToken: true },
        }) as [`0x${string}`, ...`0x${string}`[]],
        data: encodeAbiParameters(
          parseAbiParameters(
            "uint256 amountIn,uint256 amountOut,uint256 tokenReserve,uint256 nativeReserve",
          ),
          [10n, 90n, 910n, 110n],
        ),
      },
      POOL,
      TOKEN,
    );

    expect(event).toEqual({
      type: "TradeExecuted",
      tokenAddress: normalizeAddress(TOKEN),
      poolAddress: normalizeAddress(POOL),
      traderAddress: normalizeAddress(RECIPIENT),
      side: "buy",
      nativeAmount: "10",
      tokenAmount: "90",
      nativeReserve: "110",
      tokenReserve: "910",
    });
  });

  it("decodes the custom token-to-native Swap without V2 orientation", () => {
    const event = decodeGiwaSelfHostedPoolLog(
      {
        topics: encodeEventTopics({
          abi: [selfHostedSwapEvent],
          eventName: "Swap",
          args: { recipient: RECIPIENT, nativeToToken: false },
        }) as [`0x${string}`, ...`0x${string}`[]],
        data: encodeAbiParameters(
          parseAbiParameters(
            "uint256 amountIn,uint256 amountOut,uint256 tokenReserve,uint256 nativeReserve",
          ),
          [75n, 8n, 1_075n, 92n],
        ),
      },
      POOL,
      TOKEN,
    );

    expect(event).toMatchObject({
      type: "TradeExecuted",
      side: "sell",
      nativeAmount: "8",
      tokenAmount: "75",
      nativeReserve: "92",
      tokenReserve: "1075",
    });
  });

  it("decodes ReservesSynced and rejects standard V2 logs", () => {
    const synced = decodeGiwaSelfHostedPoolLog(
      {
        topics: encodeEventTopics({
          abi: [selfHostedReservesSyncedEvent],
          eventName: "ReservesSynced",
        }) as [`0x${string}`, ...`0x${string}`[]],
        data: encodeAbiParameters(
          parseAbiParameters("uint256 tokenReserve,uint256 nativeReserve"),
          [123_456_789_012_345_678_901n, 987_654_321_098_765_432_109n],
        ),
      },
      POOL,
      TOKEN,
    );
    const v2Log = {
      topics: encodeEventTopics({
        abi: [syncEvent],
        eventName: "Sync",
      }) as [`0x${string}`, ...`0x${string}`[]],
      data: encodeAbiParameters(
        parseAbiParameters("uint112 reserve0,uint112 reserve1"),
        [1n, 2n],
      ),
    };

    expect(synced).toEqual({
      type: "LiquidityUpdated",
      tokenAddress: normalizeAddress(TOKEN),
      poolAddress: normalizeAddress(POOL),
      nativeReserve: "987654321098765432109",
      tokenReserve: "123456789012345678901",
    });
    expect(decodeGiwaSelfHostedPoolLog(v2Log, POOL, TOKEN)).toBeNull();
  });
});
