# GIWA Sepolia smoke record

Checked at: 2026-07-28 KST

This record separates read-only network verification from state-changing
deployment. No mainnet request, private key, signature, token launch, or
real-value transaction was used.

## Primary-source configuration

The values in `.env.example` were checked against GIWA's current
[connection guide](https://docs.giwa.io/giwa-chain/en/get-started/connect-to-giwa),
[system-contract list](https://docs.giwa.io/giwa-chain/en/network-information/contracts),
[Flashblocks guide](https://docs.giwa.io/giwa-chain/en/network-information/flashblocks),
[faucet guide](https://docs.giwa.io/get-started/faucets), and
[bridge guide](https://docs.giwa.io/tools/bridges):

| Setting               | Verified value                               |
| --------------------- | -------------------------------------------- |
| Network               | GIWA Sepolia                                 |
| Chain ID              | `91342` (`0x164ce`)                          |
| HTTP RPC              | `https://sepolia-rpc.giwa.io`                |
| Flashblocks HTTP RPC  | `https://sepolia-rpc-flashblocks.giwa.io`    |
| Explorer              | `https://sepolia-explorer.giwa.io`           |
| Native currency       | Ether (`ETH`), 18 decimals                   |
| WETH9 system contract | `0x4200000000000000000000000000000000000006` |
| Bridge                | `https://sepolia-bridge.giwa.io/`            |
| Faucet                | `https://faucet.giwa.io/`                    |

The official public RPC is rate-limited. Forge does not treat Flashblocks
preconfirmation as a transaction receipt or finalized state. The indexer uses
the standard HTTP RPC and requests the `safe` block tag for GIWA.
`DeployGiwa` also reverts unless the active chain ID is exactly `91342`, while
the shared chain configuration rejects any non-official network identity.
Changing an RPC or environment value cannot enable mainnet.

## Live read-only results

The public RPC returned:

- `eth_chainId`: `0x164ce`
- `safe`: block `31824149`,
  hash `0x77301c17919af9725ecc1488cec883c1a2126be8b4df0c0a341a01098f524ff3`
- `finalized`: block `31823203`,
  hash `0x4776ec11fd43f6db8518b5c83a42a08abe1ec632f1dbc9e7a06a8f8fa4403a16`
- `eth_getBalance` at the `safe` tag: method succeeded
- Blockscout-compatible explorer API `eth_block_number`: block `31824889`
- Bridge web endpoint: HTTP `200`
- Faucet automated request: HTTP `403` from its browser-protection layer;
  the faucet must be used interactively

These block values are evidence from one smoke run, not configuration
constants.

## State-changing smoke status

GIWA deployment and buy/sell smoke were not run. There are two independent
blockers:

1. Forge was not given a user-controlled, funded GIWA Sepolia wallet. The app
   never asks for or stores a private key; signing must remain in the user's
   browser wallet.
2. No official or sufficiently reviewed GIWA AMM deployment supports Forge's
   required permissionless new-token pool, initial liquidity, quote, swap, and
   verifiable permanent LP-lock flow. The only live candidate found is the
   third-party OSIGE CLAMM described in `amm-decision.md`.

Accordingly, `packages/contracts/deployments/giwa-testnet.json` contains no
invented addresses, and the GIWA adapter remains fail-closed. The complete
state-changing flow is tested against local Anvil only.
