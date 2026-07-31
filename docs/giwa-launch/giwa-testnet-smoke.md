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

GIWA state-changing smoke has been completed on GIWA Sepolia with the deployed
self-hosted test AMM stack.

Chain: `91342` (`0x164ce`), deployer/fee recipient:
`0xf7a25FDc7522133Bc493Fd772D7A347daa4973b4`.

- `ProtocolConfig`: `0x30a60f2FA757Dc95b9a38738a07D5F89Fa9c39Ea`
- `LaunchFactory`: `0x7DacAa1F7d18F4E0336B21FeA2cFB9960a3d2325`
- `GiwaTestnetConstantProductAdapter`: `0xF27a0684a9E65709F6eD2E842d25a1F0eF734F37`

Executed flow:

1. launch
   - tx: `0x7659f63d3b26c56a69efc6ba1ea1fa939d47b2763dbc6d75028e67a833a93333`
   - block: `32121698`
   - status: `1 (success)`
   - launchId: `1`
   - token: `0x6583E1A8B0217b285EF1F430f2040a117269d1df`
2. buy
   - tx: `0x890ba5ddfbf8cda4253ee6750ab7482eee0a3e7aa97e6aeefee76683e20a0fed`
   - block: `32121705`
   - status: `1 (success)`
3. approve
   - tx: `0xfa828d00bbd799773ed7ea723b8f523ca3f9ed7dcec8e70259360865f206b90e`
   - block: `32121710`
   - status: `1 (success)`
4. sell
   - tx: `0x6e0e0ad54bf37f6e51a830db22981602bc07fdc6533b4b0c9d29aa48776b739e`
   - block: `32121714`
   - status: `1 (success)`

Result balance:

- Deployer remaining ETH: `0.002764135495271738 ETH`

`packages/contracts/deployments/giwa-testnet.json` carries these chain proofs:
deployed block, broadcast tx hashes, runtime bytecode hashes, adapter ID, and
verified explorer URLs. The default external V2 adapter remains fail-closed, and
the deployed AMM is still Forge's own unaudited test-only adapter.

This run was executed via the dedicated Foundry keystore path used for deployment
smoke, not via browser-wallet transactions. This document keeps explorer/tx-level
proof for the vertical flow.

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
