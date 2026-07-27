# GIWA AMM integration decision

Decision date: 2026-07-28

## Decision

Forge enables `LocalConstantProductAdapter` only on local Anvil. GIWA Sepolia
launch and trade actions remain disabled. `GiwaV2Adapter` is a fail-closed
integration boundary, not a claim that a compatible GIWA DEX exists.

No official DEX deployment was found in the
[GIWA organization repositories](https://github.com/orgs/giwa-io/repositories).
The official Uniswap and PancakeSwap deployment lists also do not publish a
chain `91342` deployment. No factory, router, or pool address is inferred or
invented.

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

## Reconsideration gate

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

Until then the local fixture provides deterministic vertical verification, and
GIWA actions fail closed.
