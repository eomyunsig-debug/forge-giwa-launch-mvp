# GIWA Sepolia deployment and vertical-flow evidence

Chain: GIWA Sepolia `91342` · RPC `https://sepolia-rpc.giwa.io` ·
Explorer `https://sepolia-explorer.giwa.io`

Every address, hash, and number below was read back from the chain after the
fact. Nothing here is copied from a console log; Foundry's broadcast summary
mislabelled two of the four deployment transactions, so the receipts were
re-fetched by hash and re-matched to their contracts.

## Protocol stack

Deployed in block `32120680`. Total cost `0.000007074736313211 ETH`.

| Contract                            | Address                                                                                                                                          | Source verified |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- |
| `ProtocolConfig`                    | [`0x30a60f2FA757Dc95b9a38738a07D5F89Fa9c39Ea`](https://sepolia-explorer.giwa.io/address/0x30a60f2FA757Dc95b9a38738a07D5F89Fa9c39Ea?tab=contract) | yes             |
| `LaunchFactory`                     | [`0x7DacAa1F7d18F4E0336B21FeA2cFB9960a3d2325`](https://sepolia-explorer.giwa.io/address/0x7DacAa1F7d18F4E0336B21FeA2cFB9960a3d2325?tab=contract) | yes             |
| `GiwaTestnetConstantProductAdapter` | [`0xF27a0684a9E65709F6eD2E842d25a1F0eF734F37`](https://sepolia-explorer.giwa.io/address/0xF27a0684a9E65709F6eD2E842d25a1F0eF734F37?tab=contract) | yes             |

| Deployment transaction                                               | Contract                  | Gas       |
| -------------------------------------------------------------------- | ------------------------- | --------- |
| `0x003d6248b0e2c49aa302f0b3883f54fa9846d3244356626bb784b8f19cac10be` | `ProtocolConfig`          | 598,352   |
| `0x855e620d0e084f7064dfc7710659851187d322038b953c58fcd03b84ffc63561` | adapter                   | 2,829,813 |
| `0xffc016b023ca9a869d3f9cd7d9f30a5f434a1657b7d09f2ddcb8df4fba973897` | `LaunchFactory`           | 3,593,430 |
| `0x8dafa3507caf5dddffc2bfde60b5ad4002002851682d6b97d38e1018e3e0ec5a` | `setAdapterApproval` call | 51,366    |

Configuration read back from the chain:

```
admin                   = 0xf7a25FDc7522133Bc493Fd772D7A347daa4973b4
feeRecipient            = 0xf7a25FDc7522133Bc493Fd772D7A347daa4973b4
creationFee             = 0
minimumInitialLiquidity = 1000000000000000        (0.001 ETH)
allowTestAdapters       = true
adapterEnabled(adapter) = true
adapter.isConfigured()  = true
adapter.isTestOnly()    = true
launchFactory.config()  = 0x30a60f2FA757Dc95b9a38738a07D5F89Fa9c39Ea
```

The AMM is Forge's own unaudited constant-product adapter, not an approved
third-party GIWA DEX. `allowTestAdapters` is immutable and `true` in this
`ProtocolConfig`, so this deployment must never be reused for a production
chain. See [`amm-decision.md`](amm-decision.md) for why no third-party GIWA
Sepolia DEX was integrated.

## Vertical flow: launch, buy, exact-amount approve, sell

Executed by `0xf7a25FDc7522133Bc493Fd772D7A347daa4973b4`. All four receipts
returned `status = 1`.

| Step    | Transaction                                                          | Block    |
| ------- | -------------------------------------------------------------------- | -------- |
| launch  | `0x7659f63d3b26c56a69efc6ba1ea1fa939d47b2763dbc6d75028e67a833a93333` | 32121698 |
| buy     | `0x890ba5ddfbf8cda4253ee6750ab7482eee0a3e7aa97e6aeefee76683e20a0fed` | 32121705 |
| approve | `0xfa828d00bbd799773ed7ea723b8f523ca3f9ed7dcec8e70259360865f206b90e` | 32121710 |
| sell    | `0x6e0e0ad54bf37f6e51a830db22981602bc07fdc6533b4b0c9d29aa48776b739e` | 32121714 |

`launchId = 1`, `Forge GIWA Smoke` / `FGIWA`, creator allocation 5%,
initial liquidity `0.002 ETH`.

| Launch artifact            | Address                                                                                                                                          | Source verified |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- |
| `LaunchToken`              | [`0x6583E1A8B0217b285EF1F430f2040a117269d1df`](https://sepolia-explorer.giwa.io/address/0x6583E1A8B0217b285EF1F430f2040a117269d1df?tab=contract) | yes             |
| pool                       | [`0x7cb39a042be90c8e0d5cf8ba1f211969d862cb8d`](https://sepolia-explorer.giwa.io/address/0x7cb39a042be90c8e0d5cf8ba1f211969d862cb8d?tab=contract) | yes             |
| `PermanentLiquidityLocker` | [`0xd6aacab7dfae15dc8cf35a2dac2f7cac8e5c2ae5`](https://sepolia-explorer.giwa.io/address/0xd6aacab7dfae15dc8cf35a2dac2f7cac8e5c2ae5?tab=contract) | yes             |
| `CreatorVestingVault`      | [`0xa4003a24a0ab085e8200af1f98fb59b596383db0`](https://sepolia-explorer.giwa.io/address/0xa4003a24a0ab085e8200af1f98fb59b596383db0?tab=contract) | yes             |

## Claims checked against the deployed chain

Supply distribution after the vertical flow, read from `balanceOf`:

| Holder                | FGIWA             | Share                   |
| --------------------- | ----------------- | ----------------------- |
| pool                  | 855,228,137       | 85.52%                  |
| creator vesting vault | 50,000,000        | 5.00%                   |
| trader wallet         | 94,771,863        | 9.47%                   |
| `LaunchFactory`       | 0                 | 0.00%                   |
| **total**             | **1,000,000,000** | matches `totalSupply()` |

- **The factory keeps no residue.** Its post-launch token balance is `0`, which
  is what `UnexpectedFactoryTokenBalance` exists to enforce.
- **The sell approval leaves nothing behind.** `allowance(trader, adapter)` was
  set to exactly the sell amount and reads `0` after the sell settled.
- **LP principal has no exit.** The locker holds `1378404875209022176795` LP,
  equal to the pool's entire `totalSupply()`. `withdraw()`, `withdraw(uint256)`,
  `owner()`, `recover(address)`, `sweep(address)` and `emergencyWithdraw()` all
  fail to resolve on the deployed locker.
- **The token has no administrative surface.** `owner()`, `mint(address,uint256)`,
  `pause()` and `blacklist(address)` do not resolve.
- **Creator allocation is locked.** The vault holds `50000000000000000000000000`
  and `claimable()` reads `0` before the 24-hour cliff.

These are the same properties the Foundry unit, fuzz, and invariant suites
assert locally. This document records that they also hold on GIWA Sepolia.

## Reproduce

```sh
cast call 0x30a60f2FA757Dc95b9a38738a07D5F89Fa9c39Ea "adapterEnabled(address)(bool)" \
  0xF27a0684a9E65709F6eD2E842d25a1F0eF734F37 --rpc-url https://sepolia-rpc.giwa.io

cast call 0x6583E1A8B0217b285EF1F430f2040a117269d1df "allowance(address,address)(uint256)" \
  0xf7a25FDc7522133Bc493Fd772D7A347daa4973b4 0xF27a0684a9E65709F6eD2E842d25a1F0eF734F37 \
  --rpc-url https://sepolia-rpc.giwa.io

cast call 0x7cb39a042be90c8e0d5cf8ba1f211969d862cb8d "balanceOf(address)(uint256)" \
  0xd6aacab7dfae15dc8cf35a2dac2f7cac8e5c2ae5 --rpc-url https://sepolia-rpc.giwa.io
```

Runtime bytecode hashes for the three protocol contracts are recorded in
[`giwa-testnet.json`](../../packages/contracts/deployments/giwa-testnet.json)
and can be re-derived with `cast keccak $(cast code <address> --rpc-url ...)`.
