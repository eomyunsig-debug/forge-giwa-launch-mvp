import { describe, expect, it } from "vitest";
import {
  encodeAbiParameters,
  encodeEventTopics,
  parseAbiItem,
  parseAbiParameters,
} from "viem";

import { decodeV2PairLog, resolvePoolEventKind } from "../src/onchain.js";
import { normalizeAddress } from "../src/types.js";

const TOKEN = "0x1111111111111111111111111111111111111111";
const POOL = "0x2222222222222222222222222222222222222222";
const SENDER = "0x3333333333333333333333333333333333333333";
const RECIPIENT = "0x4444444444444444444444444444444444444444";

const swapEvent = parseAbiItem(
  "event Swap(address indexed sender,uint256 amount0In,uint256 amount1In,uint256 amount0Out,uint256 amount1Out,address indexed to)",
);
const syncEvent = parseAbiItem("event Sync(uint112 reserve0,uint112 reserve1)");

describe("standard V2 pair event decoder", () => {
  it("fails closed when a chain is paired with the wrong event decoder", () => {
    expect(resolvePoolEventKind(31_337)).toBe("local");
    expect(resolvePoolEventKind(91_342)).toBe("v2");
    expect(() => resolvePoolEventKind(91_342, "local")).toThrow(
      /invalid for chain 91342/u,
    );
    expect(() => resolvePoolEventKind(31_337, "v2")).toThrow(
      /invalid for chain 31337/u,
    );
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
