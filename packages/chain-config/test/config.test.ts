import { describe, expect, it } from "vitest";

import {
  giwaSepoliaOfficialReference,
  loadGiwaTestnetConfig,
} from "../src/index.js";

const valid = {
  GIWA_TESTNET_ENABLED: "true",
  GIWA_TESTNET_CHAIN_ID: "123",
  GIWA_TESTNET_RPC_URL: "https://rpc.example.test",
  GIWA_TESTNET_EXPLORER_URL: "https://explorer.example.test",
  GIWA_TESTNET_NATIVE_NAME: "Test",
  GIWA_TESTNET_NATIVE_SYMBOL: "TEST",
  GIWA_TESTNET_NATIVE_DECIMALS: "18",
  GIWA_TESTNET_FINALITY_TAG: "safe",
};

describe("GIWA chain config", () => {
  it("keeps the primary-source checked Sepolia reference centralized", () => {
    expect(giwaSepoliaOfficialReference).toMatchObject({
      checkedAt: "2026-07-28",
      chainId: 91_342,
      rpcUrl: "https://sepolia-rpc.giwa.io",
      explorerUrl: "https://sepolia-explorer.giwa.io",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    });
  });

  it("fails closed when official values are missing", () => {
    expect(() => loadGiwaTestnetConfig({})).toThrow(
      "GIWA_TESTNET_CONFIG_INVALID",
    );
  });

  it("does not accept a partial AMM address set", () => {
    expect(() =>
      loadGiwaTestnetConfig({
        ...valid,
        GIWA_TESTNET_AMM_ROUTER: "0x1111111111111111111111111111111111111111",
      }),
    ).toThrow("GIWA_AMM_CONFIG_INCOMPLETE");
  });

  it("loads a complete explicitly enabled testnet", () => {
    expect(loadGiwaTestnetConfig(valid).chain.id).toBe(123);
  });

  it("treats explicit empty optional placeholders as unset", () => {
    const config = loadGiwaTestnetConfig({
      ...valid,
      GIWA_TESTNET_WS_URL: "",
      GIWA_TESTNET_AMM_FACTORY: "",
      GIWA_TESTNET_AMM_ROUTER: "",
      GIWA_TESTNET_WRAPPED_NATIVE: "",
    });
    expect(config.webSocketUrl).toBeUndefined();
    expect(config.amm).toBeUndefined();
  });
});
