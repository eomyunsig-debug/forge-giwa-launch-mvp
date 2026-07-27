# Forge contracts

Non-upgradeable launch contracts for the Forge GIWA testnet MVP.

The default local integration uses `LocalConstantProductAdapter`, which is
deliberately marked `isTestOnly() == true`. Its pool is a deterministic test
fixture, not a production DEX.

`GiwaV2Adapter` has no embedded DEX addresses. GIWA currently has no approved
V2 integration for this MVP, so deployment uses `integrationApproved=false`.
That state returns `isConfigured() == false` and every pool, quote, and trade
path reverts `UnsupportedIntegration`. A future enabled deployment requires an
expected chain ID plus separately verified, non-zero, code-bearing V2 factory,
router, and wrapped-native addresses. Placeholder addresses are not accepted.

## Security boundary

- `LaunchToken` has no owner, mint, pause, blacklist, tax, or upgrade surface.
- Creator allocations are held by one immutable vesting vault per launch.
- LP ERC-20 principal is minted directly to a locker with no withdrawal method.
- `ProtocolConfig` can change only the bounded creation fee, fee recipient, and
  adapter allowlist. Its admin cannot change launched token, vesting, or locker
  behavior.
- The factory rejects excess or insufficient `msg.value`; it never silently
  refunds an ambiguous remainder.
- Only accrued creation fees can leave the factory, and only the configured fee
  recipient can claim them.

Build and test from the repository root with `pnpm test:contracts` and
`pnpm contracts:build`.
