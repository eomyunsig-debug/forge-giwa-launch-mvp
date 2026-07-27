# Forge GIWA Launch MVP — Implementation Plan

> Status: active implementation
>
> Scope: GIWA testnet and local Anvil only. Mainnet deployment and real-value
> trading are explicitly out of scope.

## Repository survey

The parent ChatGPT project mirror contained only a read-only `AGENTS.md` and an
empty, read-only `sources/` directory. It was not a Git repository and had no
README, package manager, source code, tests, CI, remotes, or user changes.

Forge is therefore isolated in `forge/` as a new Git repository on
`feature/giwa-launch-mvp`. The parent mirror and `sources/` remain untouched.

## Selected architecture

Forge is a strict TypeScript pnpm workspace:

- `apps/web`: React/Vite mobile-first SPA. It uses an EIP-6963/injected-wallet
  connector without private-key inputs and reads durable launch state only from
  the indexer API.
- `apps/indexer`: event-sourced Node service backed by SQLite. It ingests
  factory, token, pool, vesting, and locker events idempotently and exposes
  source-aware APIs.
- `packages/contracts`: non-upgradeable Solidity contracts and Foundry
  unit/fuzz/invariant/integration tests.
- `packages/sdk`: viem ABIs, quote/transaction builders, and runtime guards.
- `packages/chain-config`: fail-closed GIWA and local Anvil chain definitions.
- `packages/ui`: accessible shared UI primitives.
- `packages/shared`: Zod schemas, BigInt-safe wire types, formatters, and the
  central `Forge` brand configuration.

This is intentionally a small modular monorepo rather than a microservice
fleet. It keeps the on-chain safety boundary, indexer durability, and browser
transaction boundary independently testable without adding prototype-stage
operational overhead.

## Smart-contract composition

- `LaunchToken`: fixed 1,000,000,000 token supply, 18 decimals, no owner, mint,
  pause, blacklist, transfer restrictions, or tax. Optional holder-only burn.
- `LaunchFactory`: validates launch input, deploys the token, vesting vault and
  permanent locker, routes the exact native liquidity and creation fee, calls
  one approved AMM adapter, and emits the canonical launch record atomically.
- `CreatorVestingVault`: immutable creator/token/allocation/cliff/end; linear
  vesting after the cliff; pull-based, non-reentrant claim.
- `PermanentLiquidityLocker`: records and holds one LP asset/position and has no
  principal withdrawal path or emergency escape hatch.
- `ProtocolConfig`: non-proxy parameter registry. The operator can only manage
  bounded creation-fee settings, fee recipient, and adapter allowlisting.
  Parameter changes emit events and cannot change launched token/vault/locker
  behavior.
- `IAMMAdapter`: normalized pool creation, liquidity provision, quote,
  buy/sell, deadline, minimum-output, position identity, and pool-state surface.
- `LocalConstantProductAdapter`: Anvil-only constant-product AMM fixture with an
  explicit test-only marker.
- `GiwaV2Adapter`: production-shaped Uniswap-V2-compatible adapter that can only
  be deployed with nonzero, code-bearing, explicitly configured GIWA addresses.
  It remains disabled while official deployments are unconfirmed.

## Indexing strategy

The indexer stores canonical logs keyed by
`chainId/blockNumber/blockHash/transactionHash/logIndex`. A transaction ingests
all decoded effects in one SQLite transaction and advances a chain checkpoint
only after successful commit.

On restart it resumes from the last checkpoint. Before continuing, it checks
the checkpoint block hash. A mismatch rolls back derived rows and raw events
from the fork point, then replays. RPC failures use bounded exponential backoff;
the API continues serving the last-good snapshot with an explicit stale/error
status rather than replacing data with zeroes.

Holder balances are derived from `Transfer` events as decimal strings. Pool,
locker, vesting vault, zero, and burn addresses are classified separately.
Top-holder concentration uses only circulating balances of ordinary wallets.

## GIWA testnet integration strategy

Network values were rechecked on 2026-07-28 against the
[official connection guide](https://docs.giwa.io/giwa-chain/en/get-started/connect-to-giwa),
[official node repository](https://github.com/giwa-io/node),
and live RPC:

- GIWA Sepolia chain ID: `91342` (`0x164ce`)
- HTTP RPC: `https://sepolia-rpc.giwa.io`
- Explorer: `https://sepolia-explorer.giwa.io`
- Native currency: Ether (`ETH`), 18 decimals
- Bridge: `https://sepolia-bridge.giwa.io/`
- Faucet: `https://faucet.giwa.io/`

The documented Flashblocks socket is a preconfirmation stream, not a documented
general JSON-RPC WebSocket, so the standard WebSocket setting stays empty.
GIWA documents `safe` and `finalized` block tags rather than a universal fixed
application confirmation count. The indexer therefore polls the HTTP RPC at
`safe`; Flashblocks are never presented as finalized receipts.

The chain package still requires an explicit `GIWA_TESTNET_ENABLED=true`.
Unconfirmed AMM values are not invented. Missing values keep the GIWA AMM
adapter disabled with an actionable configuration error. Local Anvil remains
fully functional for vertical-flow validation.

## AMM choice

The local MVP uses a purpose-built constant-product fixture because it makes
pool creation, LP ownership, locked principal, quotes, minimum output,
deadlines, buys, sells, and event indexing deterministic and testable.

The GIWA adapter targets a verified V2-compatible deployment only if official or
authoritative GIWA ecosystem sources confirm the addresses and bytecode. This
keeps LP locking directly inspectable as an ERC-20 pair balance. No swap
surcharge, creator swap fee, or anti-bot promise is advertised because direct
router/pool calls could bypass those policies.

## Known risks and blockers

- GIWA testnet network and DEX values are pending current primary-source
  verification.
- A public GIWA faucet, funded test wallet, and official DEX liquidity may be
  external blockers for live smoke tests.
- Reorg recovery targets the bounded MVP confirmation window, not archival-node
  replacement.
- Social ownership proofs can verify wallet-to-account control evidence only;
  they do not establish identity or project trustworthiness.
- Token images use a local development adapter until a configured
  IPFS-compatible/object-storage provider is available.
- Local AMM prices are fixtures and are never presented as GIWA market data.

## Ordered TODO

- [ ] 1. Scaffold workspace, central brand/config, local developer flow.
- [ ] 2. Add fail-closed chain configuration and local Anvil orchestration.
- [ ] 3. Implement core contracts and local/GIWA AMM adapters.
- [ ] 4. Add Foundry unit, fuzz, invariant, and atomic-integration tests.
- [ ] 5. Generate/export ABIs and implement typed SDK transaction boundaries.
- [ ] 6. Implement durable indexer, data model, API, reorg/idempotency tests.
- [ ] 7. Implement EIP-6963 wallet connection and chain/account TOCTOU guards.
- [ ] 8. Implement metadata upload and atomic create-launch flow.
- [ ] 9. Implement feed, token detail, quote, buy/sell, receipt reconciliation.
- [ ] 10. Implement risk facts, creator profile, portfolio, and risk education.
- [ ] 11. Automate local Anvil vertical Playwright flow and screenshots.
- [ ] 12. Add GIWA adapter configuration and run the available smoke checks.
- [ ] 13. Harden security headers/rate limits/CSP, add CI and deployment
      artifacts.
- [ ] 14. Run final browser/accessibility QA and document residual risk.

The TODO list is updated only when the corresponding implementation and tests
have actually run.
