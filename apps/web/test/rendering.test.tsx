import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router";

import {
  formatInverseTradePrice,
  LaunchCard,
  PriceChart,
  summarizeTradePrices,
} from "../src/components";
import type { LaunchSummary, Trade } from "@forge/shared";

const launch: LaunchSummary = {
  chainId: 31_337,
  tokenAddress: "0x1111111111111111111111111111111111111111",
  name: "No Fake Data",
  symbol: "NFD",
  metadataUri: "http://127.0.0.1:8787/metadata/test.json",
  metadataHash: `0x${"ab".repeat(32)}`,
  imageUrl: null,
  description: null,
  creatorAddress: "0x2222222222222222222222222222222222222222",
  creatorAllocationBps: 500,
  creatorAllocation: "50000000000000000000000000",
  vestingVaultAddress: "0x3333333333333333333333333333333333333333",
  poolAddress: "0x4444444444444444444444444444444444444444",
  lockerAddress: "0x5555555555555555555555555555555555555555",
  lpTokenAddress: "0x4444444444444444444444444444444444444444",
  actualLiquidityNative: null,
  uniqueHolders: null,
  recentVolumeNative: null,
  recentTrades: null,
  topTenOrdinaryHolderBps: null,
  createdAt: new Date(0).toISOString(),
  createdBlock: "1",
  transactionHash: `0x${"ab".repeat(32)}`,
  socialOwnershipVerified: false,
};

describe("honest missing-data rendering", () => {
  it("renders missing metrics as dashes, not fake zeroes or badges", () => {
    render(
      <MemoryRouter>
        <LaunchCard launch={{ ...launch, socialOwnershipVerified: true }} />
      </MemoryRouter>,
    );
    expect(screen.getAllByText(/—/).length).toBeGreaterThan(1);
    expect(screen.queryByText(/Identity Verified/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/소셜 소유권/)).not.toBeInTheDocument();
    expect(screen.queryByText("LP 원금 잠금")).not.toBeInTheDocument();
  });

  it("does not draw a chart from insufficient trades", () => {
    render(<PriceChart trades={[]} />);
    expect(screen.getByText("가격 차트 데이터 수집 중")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("draws only from actual trade inputs", () => {
    const trades: Trade[] = [1n, 2n].map((value, index) => ({
      chainId: 31_337,
      tokenAddress: launch.tokenAddress,
      poolAddress: launch.poolAddress,
      transactionHash: `0x${String(index + 1).padStart(64, "0")}`,
      logIndex: index,
      traderAddress: launch.creatorAddress,
      side: index === 0 ? "buy" : "sell",
      nativeAmount: (value * 10n ** 18n).toString(),
      tokenAmount: (100n * 10n ** 18n).toString(),
      blockNumber: String(index + 1),
      blockTimestamp: new Date(index * 1_000).toISOString(),
    }));
    render(<PriceChart trades={trades} />);
    expect(screen.getByRole("img")).toHaveAccessibleName(/실제 거래 2건/);
    expect(screen.getByText(/모의 데이터 없음/)).toBeInTheDocument();
    expect(screen.getByText(/저점 대비/)).toBeInTheDocument();
    expect(screen.getByText("가장 싸게 체결")).toBeInTheDocument();
    expect(screen.getByText("가장 비싸게 체결")).toBeInTheDocument();
  });

  it("renders retail-readable inverse prices and an exact range", () => {
    expect(
      formatInverseTradePrice(
        "400000000000000000",
        "133446943562853594590865185",
      ),
    ).toBe("3.34억");

    const trades: Trade[] = [
      {
        chainId: 31_337,
        tokenAddress: launch.tokenAddress,
        poolAddress: launch.poolAddress,
        transactionHash: `0x${"1".padStart(64, "0")}`,
        logIndex: 0,
        traderAddress: launch.creatorAddress,
        side: "buy",
        nativeAmount: "1",
        tokenAmount: "100",
        blockNumber: "1",
        blockTimestamp: new Date(0).toISOString(),
      },
      {
        chainId: 31_337,
        tokenAddress: launch.tokenAddress,
        poolAddress: launch.poolAddress,
        transactionHash: `0x${"2".padStart(64, "0")}`,
        logIndex: 0,
        traderAddress: launch.creatorAddress,
        side: "buy",
        nativeAmount: "2",
        tokenAmount: "100",
        blockNumber: "2",
        blockTimestamp: new Date(1_000).toISOString(),
      },
    ];

    expect(summarizeTradePrices(trades)).toMatchObject({ changeBps: 10_000 });
  });

  it("preserves sub-nano price moves and a final decline in the chart", () => {
    const prices = [559n, 727n, 953n, 1_310n, 1_720n, 1_920n, 1_810n];
    const trades: Trade[] = prices
      .map((nativeAmount, index) => ({
        chainId: 31_337,
        tokenAddress: launch.tokenAddress,
        poolAddress: launch.poolAddress,
        transactionHash: `0x${String(index + 1).padStart(64, "0")}`,
        logIndex: index,
        traderAddress: launch.creatorAddress,
        side:
          index === prices.length - 1 ? ("sell" as const) : ("buy" as const),
        nativeAmount: nativeAmount.toString(),
        tokenAmount: "1000000000000",
        blockNumber: String(index + 1),
        blockTimestamp: new Date(index * 1_000).toISOString(),
      }))
      .reverse();

    render(<PriceChart trades={trades} />);
    const points =
      screen
        .getByRole("img")
        .querySelector("polyline")
        ?.getAttribute("points") ?? "";
    const yValues = points
      .split(" ")
      .map((point) => Number(point.split(",")[1]));

    expect(new Set(yValues).size).toBe(prices.length);
    expect(yValues.at(-1)).toBeGreaterThan(yValues.at(-2) ?? Number.NaN);
  });
});
