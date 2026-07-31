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
  BigInt-safe balances, holder classification, standard V2/local/self-hosted
  test-pool event decoding, committed-metadata retries, and source/freshness
  metadata;
- an EIP-6963/injected-wallet React app with explicit chain switching,
  transaction-intent checks, exact sell allowance, receipt confirmation, and
  indexer reconciliation;
- local content-addressed image/metadata storage with extension, MIME,
  magic-byte, size, URL, and schema validation;
- Korean-first responsive pages for launch feed, creation, trading, creator
  history, portfolio/vesting claims, and risk education.

No browser private-key or seed-phrase input exists. The local runner supplies
only disposable Anvil test keys. The GIWA Foundry deployment script accepts
only the deployer's public `DEPLOYER_ADDRESS`; its signer must be supplied by
Foundry from a dedicated local encrypted keystore with `--account`. No raw
GIWA private key, seed phrase, or keystore password belongs in the process
environment, chat, repository, or shared `.env`. Post-deployment product
actions remain browser-wallet signed. The deployment scripts enforce local
Anvil `31337` or GIWA Sepolia `91342` and reject mainnet.

## Public read-only demo

[Open the public demo](https://forge-giwa-launch-eomyunsig.eomyunsig.chatgpt.site)
or [browse the public source](https://github.com/eomyunsig-debug/forge-giwa-launch-mvp).

The public-hosting build is intentionally read-only. It displays one real
local Anvil vertical-run record captured from the on-chain indexer at block
`18` (`0x33a6c41e0d8ccacfd5d12d4e909c1e275ab2c7408c1980c24c31982218de37e9`)
on 2026-07-28T17:30:41.963Z. Its canonical JSON SHA-256 is
`f2ae8f5766cf798a8185b84626ed89de30388f5c4597776c3a5efdfcbbd6da08`.
The recorded run includes the launch, buys from 12 distinct accounts, an
exact-amount approval, one sell, 13 indexed trades, and refresh restoration.
That distribution records 12 ordinary holders and an 86.10% top-ten ordinary
holder concentration instead of a mathematically degenerate single-holder
snapshot.

This is not a live GIWA deployment. Wallet connection, launch, portfolio, and
trade mutations are disabled in the public build, and no localhost API is
called. Missing remote assets remain missing rather than being replaced with
invented data. Facts verified only during the local vertical run are labeled
`로컬 실행 시 확인됨`; this state does not claim that the public URL
independently revalidated the contracts.

```sh
pnpm build:public-demo
```

## Requirements

- Node.js `>=22.22 <25` (Node 24 is used in CI; native SQLite builds are
  verified on that major)
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

To keep another local service on `5173` untouched, select an isolated web port
for the complete stack:

```sh
FORGE_WEB_PORT=5180 pnpm dev:local
```

The same variable isolates Playwright's managed stack:

```sh
FORGE_WEB_PORT=5180 pnpm test:e2e
```

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
375×812, 430×932, and 1440×900 viewports. It also checks actual route
entry/exit state, inert outgoing content, main-focus restoration,
reduced-motion behavior, delayed-route fallbacks, mid-quote focus ownership,
public-demo reading order, touch targets, and horizontal overflow.

The exact executed results and screenshot paths are recorded in
[`verification-report.md`](docs/giwa-launch/verification-report.md).

## GASOK application readiness

The application evidence and remaining external actions are kept separate:

- candidate code commit
  `0c6778ba5d75d8fdffc2977f2ee372a56270bc47` passed the complete local
  verifier. Published candidate evidence commit
  [`0c6778ba5d75d8fdffc2977f2ee372a56270bc47`](https://github.com/eomyunsig-debug/forge-giwa-launch-mvp/commit/0c6778ba5d75d8fdffc2977f2ee372a56270bc47)
  is available in
  [PR #5](https://github.com/eomyunsig-debug/forge-giwa-launch-mvp/pull/5) (merged)
  and backs the current public read-only demo;

- [`application-readiness.md`](docs/giwa-launch/application-readiness.md) maps
  the eight GASOK Phase 1 + 2 criteria to current evidence and gaps;
- [`application-answers.ko.md`](docs/giwa-launch/application-answers.ko.md)
  provides Korean form-ready answers without guessing applicant identity;
- [`why-giwa.md`](docs/giwa-launch/why-giwa.md) records the GIWA rationale
  without claiming a deployment or listing relationship;
- [`submission-checklist.md`](docs/giwa-launch/submission-checklist.md) keeps
  canonical links, GIWA proof gates, and the non-simulated external-wallet
  pilot in one place;
- the
  [Forge GASOK pitch deck](https://github.com/eomyunsig-debug/forge-giwa-launch-mvp/blob/0c6778ba5d75d8fdffc2977f2ee372a56270bc47/docs/pitch/Forge-GASOK-Pitch-Deck.pptx)
  is the immutable public-repository submission deck;
- the
  [GASOK screenshot set](artifacts/screenshots/gasok/home-first-view-1440x900.png)
  includes the desktop first view plus
  [wallet home](artifacts/screenshots/gasok/wallet-embed-home-390x844.png) and
  [wallet token](artifacts/screenshots/gasok/wallet-embed-token-390x844.png)
  prototypes;
- [`pilot-invite.ko.md`](docs/giwa-launch/pilot-invite.ko.md) is the
  consent-based Korean invitation draft and must not be sent before a real
  deployment and operator preflight.

Forge is currently a solo-builder prototype developed with AI-assisted tools.
Contributor identities are not inferred from Git metadata; the applicant must
provide accurate names, roles, and legal/contact information directly in the
application. AI tools are not team members, and repository tests or AI review
are not an independent security audit.

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

Forge is deployed on GIWA Sepolia `91342`, and every contract is source
verified on the official explorer.

| Contract         | Address                                                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ProtocolConfig` | [`0x30a60f2FA757Dc95b9a38738a07D5F89Fa9c39Ea`](https://sepolia-explorer.giwa.io/address/0x30a60f2FA757Dc95b9a38738a07D5F89Fa9c39Ea?tab=contract) |
| `LaunchFactory`  | [`0x7DacAa1F7d18F4E0336B21FeA2cFB9960a3d2325`](https://sepolia-explorer.giwa.io/address/0x7DacAa1F7d18F4E0336B21FeA2cFB9960a3d2325?tab=contract) |
| AMM adapter      | [`0xF27a0684a9E65709F6eD2E842d25a1F0eF734F37`](https://sepolia-explorer.giwa.io/address/0xF27a0684a9E65709F6eD2E842d25a1F0eF734F37?tab=contract) |

A launch, buy, exact-amount approval, and sell were executed end to end against
that deployment. The resulting token, pool, LP locker, and creator vesting
vault are also source verified, and the on-chain state was read back to confirm
that the factory keeps no token residue, the sell allowance settles to zero,
the LP principal has no withdrawal path, and the creator allocation stays
locked until its cliff. Addresses, transaction hashes, and the exact `cast`
commands to reproduce each check are in
[`giwa-sepolia-deployment.md`](docs/giwa-launch/giwa-sepolia-deployment.md).

The AMM is Forge's own constant-product adapter, deployed under
`USE_SELF_HOSTED_TEST_AMM=true` and marked test-only on-chain. It is not
audited, not mainnet ready, and not an approval of any external GIWA DEX; the
`ProtocolConfig` behind it was constructed with `allowTestAdapters=true` and
must never be reused for a production chain. The web app and indexer need the
matching `VITE_GIWA_DEPLOYMENT_MODE=giwa-self-hosted-test-only` and
`INDEXER_POOL_EVENT_KIND=giwa-self-hosted-test-only`; both default to disabled
or V2 behavior and reject contradictory inputs. The SDK rechecks the approved
adapter's on-chain identity, test-only marker, and configured state before
building launch or quote requests. See
[`giwa-testnet-smoke.md`](docs/giwa-launch/giwa-testnet-smoke.md) and
[`amm-decision.md`](docs/giwa-launch/amm-decision.md) for why no third-party
GIWA Sepolia DEX was integrated.

`packages/contracts/deployments/giwa-testnet.json` carries the deployed
addresses together with the block, transaction hashes, adapter identity,
runtime bytecode hashes, and verified-source URLs.

## Security boundary

Read [`threat-model.md`](docs/giwa-launch/threat-model.md) before enabling a
remote adapter. The protocol administrator can change only future creation
fees, their recipient, and the adapter allowlist. The administrator cannot
mint, pause, blacklist, tax, seize creator allocations, withdraw LP principal,
or upgrade deployed contracts.

## License

Forge is available under the [MIT License](LICENSE).
