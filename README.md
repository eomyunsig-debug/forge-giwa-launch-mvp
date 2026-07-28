# Forge

Forge is a mobile-first community token launch market for local Anvil and GIWA
Sepolia. Anyone can launch a fixed-template token, while creator allocation,
vesting, liquidity custody, administrator powers, holder concentration, and
indexer freshness remain visible as separate facts.

Forge is testnet software. It is not an official GIWA, Dunamu, or Upbit
service, and it does not promise safety, listing, price appreciation, or
returns.

## What the MVP contains

- a fixed-supply ERC-20 with no owner, post-launch mint, pause, blacklist,
  transfer tax, buy tax, sell tax, or proxy;
- atomic token, vesting vault, pool, initial liquidity, and LP locker creation;
- immutable 24-hour cliff and 30-day linear creator vesting, capped at 10%;
- an Anvil-only constant-product AMM fixture with on-chain exact-input and
  exact-output quotes, minimum output, deadline, buy, and sell;
- a fail-closed GIWA adapter boundary with no invented DEX addresses;
- a SQLite event indexer with idempotent logs, checkpoints, reorg rollback,
  BigInt-safe balances, holder classification, standard V2/local pool event
  decoding, committed-metadata retries, and source/freshness metadata;
- an EIP-6963/injected-wallet React app with explicit chain switching,
  transaction-intent checks, exact sell allowance, receipt confirmation, and
  indexer reconciliation;
- local content-addressed image/metadata storage with extension, MIME,
  magic-byte, size, URL, and schema validation;
- Korean-first responsive pages for launch feed, creation, trading, creator
  history, portfolio/vesting claims, and risk education.

No private-key or seed-phrase input exists. The deployment scripts enforce
local Anvil `31337` or GIWA Sepolia `91342` and reject mainnet.

## Public read-only demo

The public-hosting build is intentionally read-only. It displays one real
local Anvil vertical-run record captured from the on-chain indexer at block
`18` (`0x3a4069210ed56876f0f235ed18bd9b9789f9c7e187c813649df2d8a13ee5074d`)
on 2026-07-27T18:34:31.193Z. Its canonical JSON SHA-256 is
`c3c18c0a913119be8a5135c017c4c26d8fcb97fcc92e1afb6e0acd124f758d81`.

This is not a live GIWA deployment. Wallet connection, launch, portfolio, and
trade mutations are disabled in the public build, and no localhost API is
called. Missing remote assets remain missing rather than being replaced with
invented data.

```sh
pnpm build:public-demo
```

## Requirements

- Node.js `>=22.22` (Node 24 is used in CI)
- pnpm `11.9.0`
- macOS or Linux
- Chromium for Playwright

Foundry can already be installed globally, or the repository can download the
current official release into the ignored `.tools/` directory.

## Install

```sh
corepack enable
corepack prepare pnpm@11.9.0 --activate
pnpm install --frozen-lockfile
scripts/bootstrap-foundry.sh
pnpm exec playwright install chromium
```

No `.env` file is needed for the deterministic local test stack. Copy
`.env.example` only when overriding development ports or configuring the
fail-closed GIWA boundary. Never put wallet secrets in a `VITE_` variable.

## Run the local vertical stack

```sh
pnpm dev:local
```

This starts local Anvil, deploys `ProtocolConfig`,
`LocalConstantProductAdapter`, and `LaunchFactory`, writes the ephemeral Anvil
manifest, starts the indexer at `http://127.0.0.1:8787`, and starts the web app
at `http://127.0.0.1:5173`.

The local AMM and its prices are test fixtures. They are never presented as
GIWA market data.

## Verify

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:contracts
pnpm contracts:snapshot:check
pnpm contracts:build
pnpm abi:generate
pnpm verify:manifests
pnpm build
pnpm verify:secrets
pnpm audit --audit-level high
pnpm test:e2e
```

The non-browser checks are also grouped as:

```sh
pnpm verify
```

Foundry tests include unit, fuzz, invariant, and local integration suites.
Playwright owns an ephemeral local chain and exercises create, index, feed,
detail, buy, sell, balance/trade reconciliation, refresh persistence, and the
375×812, 430×932, and 1440×900 viewports.

The exact executed results and screenshot paths are recorded in
[`verification-report.md`](docs/giwa-launch/verification-report.md).

## Workspace

| Path                    | Responsibility                                           |
| ----------------------- | -------------------------------------------------------- |
| `apps/web`              | React/Vite wallet and launch/trade UI                    |
| `apps/indexer`          | SQLite event ingestion, projections, uploads, and API    |
| `packages/contracts`    | Solidity contracts, deployment scripts, Foundry tests    |
| `packages/sdk`          | ABI, quote, approval, launch, trade, and intent builders |
| `packages/chain-config` | local and fail-closed GIWA chain configuration           |
| `packages/ui`           | accessible shared UI primitives                          |
| `packages/shared`       | schemas, BigInt wire types, formatting, brand config     |
| `artifacts/abi`         | generated committed ABI artifacts                        |
| `docs/giwa-launch`      | architecture, AMM decision, smoke record, threat model   |

The product name and copy live in `packages/shared/src/brand.ts` and can be
overridden by `VITE_APP_NAME` and `VITE_APP_TAGLINE`.

## GIWA status

The official GIWA Sepolia RPC and explorer pass read-only smoke checks. A
state-changing GIWA launch is intentionally not enabled because no approved
AMM satisfies the new-token pool and permanent LP-lock requirements, and no
funded user wallet was supplied. See
[`giwa-testnet-smoke.md`](docs/giwa-launch/giwa-testnet-smoke.md) and
[`amm-decision.md`](docs/giwa-launch/amm-decision.md).

`packages/contracts/deployments/giwa-testnet.json` contains `null` contract
addresses and the exact blocker. Absence is represented as absence; it is not
replaced with a guessed address.

## Security boundary

Read [`threat-model.md`](docs/giwa-launch/threat-model.md) before enabling a
remote adapter. The protocol administrator can change only future creation
fees, their recipient, and the adapter allowlist. The administrator cannot
mint, pause, blacklist, tax, seize creator allocations, withdraw LP principal,
or upgrade deployed contracts.
