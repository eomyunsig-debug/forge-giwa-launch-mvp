# GIWA AMM integration decision

- Decision date: 2026-07-28
- Test-only path update: 2026-07-30

## Decision

Forge enables `LocalConstantProductAdapter` only on local Anvil. GIWA Sepolia
external-DEX launch and trade actions remain disabled by default.
`GiwaV2Adapter` is a fail-closed integration boundary, not a claim that a
compatible GIWA DEX exists.

Forge now also has a separate, explicitly opted-in
`GiwaTestnetConstantProductAdapter` and pool for a self-hosted GIWA Sepolia
testnet smoke. This path is test-only, unaudited, and unbroadcast. It does not
change the external-DEX decision or establish mainnet readiness.

No official DEX deployment was found in the
[GIWA organization repositories](https://github.com/orgs/giwa-io/repositories).
The official Uniswap and PancakeSwap deployment lists also do not publish a
chain `91342` deployment. No factory, router, or pool address is inferred or
invented.

## Self-hosted GIWA Sepolia test path

The test path has these fail-closed boundaries:

- `USE_SELF_HOSTED_TEST_AMM=true` is required; the default remains the disabled
  V2 adapter path;
- enabling both the self-hosted path and
  `GIWA_AMM_INTEGRATION_APPROVED=true` reverts with `ConflictingAmmModes`;
- the adapter and each pool enforce chain ID `91342`;
- the adapter ID is
  `FORGE_GIWA_SEPOLIA_SELF_HOSTED_TEST_ONLY_CP_V1`;
- `isTestOnly()` remains true on-chain, and `ProtocolConfig` allows test
  adapters only in this explicit mode;
- the pool issues ERC-20 LP principal compatible with the existing permanent
  locker boundary;
- `giwa-testnet.json` remains `deployed: false` with null contract addresses.

The complete Foundry suite passed 69/69, including seven self-hosted GIWA flow
tests and six GIWA invariants. The same seven flow tests passed against a
read-only fork of the official public GIWA Sepolia RPC, and the explicit
deployment-mode branch passed 1/1 on that fork. Fork execution was local EVM
simulation: no `--broadcast`, signing key, transaction, contract address, or
explorer receipt was produced.

These results establish code-path and current-state compatibility only. A real
state-changing smoke still requires a funded user-controlled wallet, explicit
administrator and fee inputs, preflight simulation, broadcast, source
verification, launch/buy/sell receipts, and indexer reconciliation.

## Investigated live candidate

The third-party OSIGE service exposes a PancakeSwap Infinity-derived
concentrated-liquidity deployment on GIWA Sepolia. Its explorer-verified
contracts include:

| Component       | Address                                      |
| --------------- | -------------------------------------------- |
| PoolManager     | `0x19a5d4CA9E8f8b3bF27213E8f0CfCB996Cf28D94` |
| PositionManager | `0x20431c73e7107C3229937C3d8C85b8615290D493` |
| Quoter          | `0xF00F3f3c62366aaC02442507A7beee449303514f` |
| UniversalRouter | `0xbFcA12d31F5D1d232e0fc8c2A2c596F4804F4543` |
| Operations Safe | `0xa5cDdaA4FC523B923704FB0Ae30D72854e1eCDC4` |

An existing OSIGE pool swap is visible in the
[GIWA explorer](https://sepolia-explorer.giwa.io/tx/0xa76f20ab883e85bf34a134a6477b529168c4cd344694581492dbda8310078271).
That proves one existing-pool route worked; it does not prove the Forge
new-token/WETH pool path.

OSIGE is not enabled because:

- it is a very recent third-party deployment, not an official GIWA DEX;
- no independent audit or durable public source repository was found;
- its operations Safe was observed as `1-of-1`;
- the operator can pause pool/router operation and alter protocol fees;
- LP positions are ERC-721 concentrated-liquidity positions, while the
  reviewed Forge locker supports ERC-20 LP principal only;
- no Forge token/WETH create-pool, mint-position, quote, buy, sell, and locker
  end-to-end transaction was verified;
- its fee behavior must be read from the deployed controller/quote path and
  cannot be advertised as a fixed `0.3%`.

## External AMM reconsideration gate

A GIWA adapter can be enabled only after all of the following are true:

1. deployment provenance, source, bytecode, ownership, pause, and fee powers
   are rechecked;
2. the exact new-token/WETH flow succeeds with test amounts;
3. the NFT position locker proves custody without a principal withdrawal or
   approval escape path;
4. quotes, minimum output, deadlines, buy, sell, receipts, and indexer
   reconciliation pass;
5. the UI discloses the AMM operator's remaining powers and does not call it an
   official GIWA DEX;
6. an explicit production integration flag is set in a reviewed deployment
   manifest.

Until then the external-DEX path fails closed. Local Anvil remains the
deterministic full-product vertical flow; the GIWA self-hosted path remains an
explicit testnet-only option. The indexer has separately tested standard V2
and GIWA self-hosted event decoders. GIWA defaults to V2 and requires an
explicit `INDEXER_POOL_EVENT_KIND=giwa-self-hosted-test-only` opt-in for the
custom pool; the presence of either decoder is not evidence that a deployment
is approved or compatible.
