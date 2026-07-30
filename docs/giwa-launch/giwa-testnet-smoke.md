# GIWA Sepolia smoke record

- Network check: 2026-07-28 KST
- Test-only path simulation update: 2026-07-30 KST

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

GIWA deployment and buy/sell broadcast were not run. There are two independent
boundaries:

1. Forge was not given a user-controlled, funded GIWA Sepolia deployer. The
   app never asks for or stores a private key. `DeployGiwa` accepts only the
   public `DEPLOYER_ADDRESS`; the signer must be loaded from a dedicated local
   encrypted Foundry keystore with `--account`. A private key, seed phrase, or
   keystore password must never be pasted into chat, committed, or stored in
   an env file. Product launch and trade actions after deployment remain
   browser-wallet signed.
2. No official or sufficiently reviewed external GIWA AMM deployment supports
   Forge's required permissionless new-token pool, initial liquidity, quote,
   swap, and verifiable permanent LP-lock flow. The only live external
   candidate found is the third-party OSIGE CLAMM described in
   `amm-decision.md`.

Forge now includes an explicit `USE_SELF_HOSTED_TEST_AMM=true` path for its
chain-gated, self-hosted GIWA Sepolia constant-product test AMM. The full
Foundry suite passed 69/69. The seven GIWA flow tests passed again on a
read-only fork of the official public RPC, and the deployment-mode branch
passed 1/1 on that fork. These were local EVM simulations without `--broadcast`;
they produced no GIWA transaction, address, receipt, or explorer verification.

Accordingly, `packages/contracts/deployments/giwa-testnet.json` still contains
null addresses and `deployed: false`. The default external adapter remains
fail-closed, and the complete state-changing product flow has been executed
only against local Anvil.

## Authorized deployment signer flow

After the applicant creates and funds a dedicated GIWA Sepolia account, import
it interactively into Foundry's encrypted local keystore:

```sh
cast wallet import forge-giwa-deployer --interactive
```

Then review the public deployer and fee settings, and run the exact-chain script
with the imported account. `DEPLOYER_ADDRESS` and `--sender` must be the same
public address:

```sh
DEPLOYER_ADDRESS=0xYourPublicAddress \
FEE_RECIPIENT=0xYourReviewedFeeRecipient \
USE_SELF_HOSTED_TEST_AMM=true \
GIWA_AMM_INTEGRATION_APPROVED=false \
scripts/foundry.sh script script/DeployGiwa.s.sol:DeployGiwa \
  --account forge-giwa-deployer \
  --sender 0xYourPublicAddress \
  --rpc-url https://sepolia-rpc.giwa.io \
  --broadcast
```

Do not run this command until the applicant has reviewed the admin, fee
recipient, creation fee, minimum liquidity, balance, simulation, and
test-only/unaudited AMM disclosure. A successful broadcast is still incomplete
until the manifest, explorer source verification, runtime bytecode hashes,
launch/buy/sell receipts, and indexer reconciliation gates are recorded.
