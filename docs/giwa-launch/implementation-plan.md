# Forge GIWA Launch MVP — Implementation Plan

> Status: local MVP implemented and verified; GIWA state-changing smoke blocked
> fail-closed by the AMM and funded-wallet prerequisites below.
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
  the indexer API. Its motion layer uses shared 120/180/420ms
  fast/base/slow tokens and reusable presence/swap primitives. Exiting content
  remains rendered only for the visual handoff and is marked `inert` and
  `aria-hidden`; reduced-motion users receive an immediate state change with no
  JavaScript exit delay. Numeric market data is never replaced by decorative
  count-up animation.
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

- `LaunchToken`: fixed 1,000,000,000 token supply, 18 decimals, no owner,
  post-construction mint, burn, pause, blacklist, transfer restrictions, or
  tax.
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
- `GiwaTestnetConstantProductAdapter`: separately chain-gated, self-hosted
  constant-product adapter and pool for an explicitly opted-in GIWA Sepolia
  testnet smoke. It remains `isTestOnly() == true` and has not been broadcast.
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
Top-holder concentration uses only balances held by ordinary wallets after all
five special buckets are removed from the denominator. Holder rows are ordered
with decimal-string BigInt semantics rather than JavaScript `Number`
conversion. Polling compares each bounded batch with the canonical head and
reports `lagging` until the checkpoint actually catches up.
Standard V2 `Swap`/`Sync`, local-fixture events, and the GIWA self-hosted
test-only pool's custom `Swap`/`ReservesSynced` events have separate decoders.
Anvil `31337` accepts only `local`. GIWA `91342` defaults to `v2` and accepts
`giwa-self-hosted-test-only` only through an explicit
`INDEXER_POOL_EVENT_KIND` opt-in; unsupported or contradictory combinations
fail at startup. The self-hosted decoder never probes V2 `token0`/`token1`.
Because an AMM's initial `Sync` can precede the factory's `LaunchCreated` in one
transaction, replay first seeds launch-owned entities and then applies all
dependent events in canonical order.
Distinct-buyer metrics use the canonical transaction sender rather than a
caller-selected token recipient. A hash-committed metadata fetch that fails
transiently is scheduled in a persistent SQL retry queue with bounded backoff.
Only currently eligible rows are limited, so permanently bad early URIs cannot
starve later launches. Once verified, metadata is persisted into the raw event
so restarts and later projection rebuilds retain it.

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

The web execution path additionally requires the exact
`VITE_GIWA_DEPLOYMENT_MODE=giwa-self-hosted-test-only`, three distinct nonzero
deployment addresses, and a positive deployed block. Public-demo builds ignore
those values and remain read-only. Before launch or quote construction, the SDK
checks adapter approval, `isConfigured()`, `isTestOnly()`, and the exact
`adapterId()` expected for the selected mode.

Both deployment scripts also enforce their exact chain IDs on-chain:
`DeployLocal` accepts only `31337`, and `DeployGiwa` accepts only `91342`.
Changing an environment variable cannot turn either path into a mainnet
deployment. Within `DeployGiwa`, the self-hosted path additionally requires
`USE_SELF_HOSTED_TEST_AMM=true`, conflicts with the external V2 approval mode,
and is the only branch that permits a test adapter.

## AMM choice

The local MVP uses a purpose-built constant-product fixture because it makes
pool creation, LP ownership, locked principal, quotes, minimum output,
deadlines, buys, sells, and event indexing deterministic and testable.

For GIWA Sepolia only, the same product boundary now has a separate self-hosted
constant-product test implementation. It is useful for a permissionless
new-token pool and permanently lockable ERC-20 LP testnet smoke without
inventing third-party addresses. It is explicitly opt-in, unaudited,
test-only on-chain, and unbroadcast; it is not a production AMM claim.

The GIWA adapter targets a verified V2-compatible deployment only if official or
authoritative GIWA ecosystem sources confirm the addresses and bytecode. This
keeps LP locking directly inspectable as an ERC-20 pair balance. No swap
surcharge, creator swap fee, or anti-bot promise is advertised because direct
router/pool calls could bypass those policies.

## Known risks and blockers

- GIWA network settings and read-only RPC/finality behavior are verified from
  current official sources. The self-hosted test-only path satisfies the code
  shape for a new-token pool plus ERC-20 LP lock, but it is unaudited and
  unbroadcast; no approved external AMM currently satisfies that boundary.
- No user-controlled funded GIWA Sepolia wallet was supplied. Forge does not
  import deployment keys, so no state-changing testnet deployment was
  attempted.
- The public faucet is protected by an interactive browser challenge; its
  automated request returned `403`.
- Reorg recovery targets the bounded MVP confirmation window, not archival-node
  replacement.
- Social ownership verification is not connected in this MVP. A submitted
  social URL remains unverified metadata, the feed offers no social-verified
  filter, and the UI marks the capability as unsupported.
- Token images use a local development adapter until a configured
  IPFS-compatible/object-storage provider is available.
- Local AMM prices are fixtures and are never presented as GIWA market data.
- Launch events disclose token and locker addresses, but the indexer does not
  yet attest their runtime bytecode against an approved build. Code-dependent
  facts such as mint/pause/blacklist/tax/proxy absence and permanent LP
  withdrawal resistance therefore remain `데이터 수집 중` instead of being
  promoted to confirmed by an event alone. The immutable public demo separately
  labels facts proven during its captured local vertical run as
  `로컬 실행 시 확인됨`; it does not present them as a current RPC
  revalidation.

## Ordered TODO

- [x] 1. Scaffold workspace, central brand/config, local developer flow.
- [x] 2. Add fail-closed chain configuration and local Anvil orchestration.
- [x] 3. Implement core contracts and local/GIWA AMM adapters.
- [x] 4. Add Foundry unit, fuzz, invariant, and atomic-integration tests.
- [x] 5. Generate/export ABIs and implement typed SDK transaction boundaries.
- [x] 6. Implement durable indexer, data model, API, reorg/idempotency tests.
- [x] 7. Implement EIP-6963 wallet connection and chain/account TOCTOU guards.
- [x] 8. Implement metadata upload and atomic create-launch flow.
- [x] 9. Implement feed, token detail, quote, buy/sell, receipt reconciliation.
- [x] 10. Implement risk facts, creator profile, portfolio, and risk education.
- [x] 11. Automate local Anvil vertical Playwright flow and screenshots.
- [x] 12. Add GIWA adapter configuration, the explicit self-hosted test-only
      deployment path, read-only network checks, and public-RPC fork simulation;
      document the still-unrun broadcast without fabricating results.
- [x] 13. Harden security headers/rate limits/CSP, add CI and deployment
      artifacts.
- [x] 14. Run final browser/accessibility QA and document residual risk.

The TODO list is updated only when the corresponding implementation and tests
have actually run.

Final QA used the running local stack in the in-app browser at 375×812 and
1440×900. It confirmed no horizontal overflow, one main landmark and one H1,
image alt coverage, visible local-test disclaimers, and no browser console
errors. The review also caught and fixed Korean heading orphan characters,
sub-44px mobile controls, raw wei risk values, and the token-image failure
fallback before the final Playwright run.

The motion and visual-hierarchy pass keeps movement tied to state changes:
routes, async loading/error/ready surfaces, wallet state, launch review,
transaction status, reporting, and chart evidence have explicit entry/exit
transitions. Mobile feed controls and hero facts were compressed so a real
launch card is visible at 375×812, while token detail places liquidity, supply,
ordinary-holder count, recent price, and the chart before the longer read-only
explanation. Risk education groups contract-enforced properties separately
from unsupported or unguaranteed claims. Playwright verifies the route exit
contract, focus restoration, reduced-motion behavior, touch targets, and
overflow. Lazy route boundaries are keyed to the displayed location so a slow
chunk can only expose a non-interactive loading fallback, never an active page
from the previous URL. Quote focus restoration is cancelled when a user edits
or moves focus mid-request, and the public token detail keeps its chart,
metrics, read-only disclosure, and risk facts in the same visual and assistive
technology order.

An independent final audit then caught and closed accidental-chain deployment,
GIWA finality/event-decoder mismatch, recipient-spoofable buyer counts,
transient metadata loss and retry-queue starvation, initial AMM event ordering,
zero-claim portfolio actions, and missing sell-gas checks. The complete
Playwright vertical flow was rerun after those changes.

A subsequent UI/data-truth review corrected price precision, ordinary-holder
concentration and balance ordering, quote expiry/signing intent checks,
post-receipt duplicate-submission guards, real indexer lag status, explicit
page-level API failures, and unsupported social/LP-lock labels. It also added a
React error boundary, mobile overflow/contrast/touch-target fixes, metadata
cards, and strict chain/Node runtime allowlists. Rate limiting now keys direct
traffic by the Node server's TCP peer and accepts a proxy-rewritten IP only
through an explicit trusted-proxy configuration; an unavailable peer identity
remains in one fail-closed bucket.

The final security pass additionally made receipt lookup failure fail closed:
once a wallet returns a transaction hash, an RPC timeout remains a locked
`confirming` state and tells the user not to resubmit. Static contract and LP
lock facts are also withheld until runtime bytecode and principal evidence can
be verified together.

The final public-demo polish regenerated the snapshot from a 13-trade local E2E
record produced by 12 distinct buyers, added inverse native/token price labels
and chart low/high context, restored the four-column holder table to the main
content, removed source-verification placeholder facts without a producer, and
added early Node-major guards for test, development, and build entry points.
