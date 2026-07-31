# Forge verification report

- Baseline checked at: 2026-07-29 KST
- GASOK readiness delta checked at: 2026-07-30 KST
- GIWA Sepolia deployment and post-deployment verifier: 2026-07-31 KST
- Submission commit:
  `0c6778ba5d75d8fdffc2977f2ee372a56270bc47`
- Earlier published evidence commit:
  `3cad0b47530269ce9cc48c61c0dc2552956693a1`
- GitHub review:
  [PR #5](https://github.com/eomyunsig-debug/forge-giwa-launch-mvp/pull/5) (merged)

This report records the local MVP evidence and the GIWA Sepolia deployment
separately.

## GIWA Sepolia deployment run — 2026-07-31 KST

- The stack was broadcast to chain `91342` in block `32120680`.
  `ProtocolConfig`, `LaunchFactory`, and the self-hosted test-only adapter are
  live, and all three are source verified on the official explorer.
- A launch, buy, exact-amount approval, and sell were executed against that
  deployment across blocks `32121698`–`32121714`. All four receipts returned
  `status = 1`. The resulting `LaunchToken`, pool, `PermanentLiquidityLocker`,
  and `CreatorVestingVault` are source verified as well, so all seven contracts
  resolve on the explorer.
- Chain state was re-read afterwards rather than trusted from console output.
  Foundry's broadcast summary mislabelled two of the four deployment
  transactions, so every receipt was re-fetched by hash and re-matched.
- Supply after the flow: pool 85.52%, creator vesting vault 5.00%, trader
  9.47%, `LaunchFactory` 0.00%, summing exactly to `totalSupply()`. The sell
  allowance settled to `0`, the locker holds the pool's entire LP
  `totalSupply()` with no withdrawal function resolving, the token exposes no
  `owner`/`mint`/`pause`/`blacklist`, and vault `claimable()` reads `0` before
  the cliff.
- Runtime bytecode hashes recorded in `giwa-testnet.json` were re-derived from
  chain and match.
- Addresses, transaction hashes, and reproduction commands are in
  [`giwa-sepolia-deployment.md`](giwa-sepolia-deployment.md).
- This is not an audit. The deployed AMM is Forge's own unaudited test-only
  adapter, and its `ProtocolConfig` was constructed with
  `allowTestAdapters=true`.

## Post-deployment verifier run — 2026-07-31 KST

- `pnpm verify` completed end to end on Node 24.18.1: format check, lint,
  strict typecheck, 151/151 Vitest across 22 files, 69/69 Foundry, contract
  size and full builds, ABI export, deployment-manifest validation, production
  and public-demo builds, response protections, and a 209-file secret scan.
- Playwright passed 3/3 in 2.2 minutes.
- The three indexer test files that fail on Node 25 pass here; the
  `pretest` Node-version guard exists to make that mismatch explicit rather
  than surfacing as cascading native-module errors.

## GASOK readiness delta

- The final candidate worktree passed the complete workspace verifier:
  151/151 Vitest tests across 22 files, 69/69 Foundry tests, strict typecheck,
  lint and formatting, contract-size and gas-snapshot checks, ABI export,
  deployment-manifest validation, production and public-demo builds, response
  protections, and a 207-file secret scan.
- The complete verifier was rerun at published evidence commit
  `3cad0b47530269ce9cc48c61c0dc2552956693a1` immediately before the branch
  was pushed. The worktree remained clean.
- The full Playwright suite passed 3/3 in 2.2 minutes, including the local
  launch → buy → exact-approval sell → indexer recovery flow and both
  wallet-layout/motion scenarios. `pnpm audit --audit-level high` reported no
  known vulnerabilities.
- The complete Foundry suite passed 69/69, including seven GIWA self-hosted
  flow tests and six GIWA invariants.
- The same seven flow tests passed 7/7 against a read-only fork of the official
  public GIWA Sepolia RPC. The explicit deployment-mode branch also passed 1/1
  on that fork. Fork execution was local EVM simulation without `--broadcast`,
  so it created no chain transaction, address, receipt, or explorer evidence.
- The final signer-boundary pass removed the raw GIWA private-key environment
  input. `DeployGiwa` now accepts only a nonzero public
  `DEPLOYER_ADDRESS`; Foundry must supply the corresponding encrypted local
  account interactively with `--account`. The complete verifier, gas snapshot
  regeneration plus two reproducibility checks, focused deployment guard, and
  public-RPC fork 1/1 + 7/7 checks passed after this change.
- Web Vitest passed 75/75 across 10 files, web strict typecheck passed, and the
  public-demo production build passed.
- The indexer suite passed 41/41, including the explicitly opted-in GIWA
  self-hosted event decoder and proof that it performs no V2 orientation read.
  The SDK suite passed 23/23, including exact adapter identity, test-only,
  configured, and approval checks before launch or quote construction.
- Playwright motion smoke passed 2/2 with 1440px first-view coverage and a
  390px `?embed=wallet` single-column layout, query preservation, and
  reduced-motion coverage. The recorded public demo still emitted zero
  connect, quote, approval, or buy/sell actions.
- The submission pitch deck was generated and visually reviewed. The candidate
  deck SHA-256 is
  `16e17cac7c198b907565fe3f6ba009491890389f7455a7ad6d398132f16c81cb`.
  The candidate
  submission images are:
  - `artifacts/screenshots/gasok/home-first-view-1440x900.png`
  - `artifacts/screenshots/gasok/wallet-embed-home-390x844.png`
  - `artifacts/screenshots/gasok/wallet-embed-token-390x844.png`

The wallet mode is layout evidence, not a GIWA Wallet SDK/bridge integration.
The GIWA AMM path is now broadcast on GIWA Sepolia as a test-only flow
for this release, and it is still not independently audited.

## Public release verification

Sites version 15 was deployed from published evidence commit
`3cad0b47530269ce9cc48c61c0dc2552956693a1` and checked on 2026-07-30 KST. The live
demo still serves that build; it predates the GIWA Sepolia deployment and
intentionally replays the local Anvil recording:

- `/`, `/?embed=wallet`, and the representative token deep link with
  `?embed=wallet` returned 200 and rendered the recorded local state;
- the wallet query remained on the detail link, the 390px view had no
  horizontal overflow, and the detail page exposed no connect, quote,
  approval, buy, or sell control;
- the application JavaScript and CSS, favicon, and 1200×630 OG image returned
  200; emitted JavaScript and CSS source-map URLs returned 404;
- CSP, Permissions Policy, Referrer Policy, `nosniff`, and clickjacking
  protections were present; browser console warnings and errors were zero.
- the matching GitHub commit, draft PR, license, submission screenshot, and
  pitch deck returned 200 without authentication. The downloaded public deck
  matched the reviewed SHA-256
  `16e17cac7c198b907565fe3f6ba009491890389f7455a7ad6d398132f16c81cb`.

`frame-ancestors 'none'` and `X-Frame-Options: DENY` intentionally prevent
third-party iframe embedding. `?embed=wallet` therefore means a top-level
wallet WebView/container layout prototype, not an iframe or accepted GIWA
Wallet host integration.

## Baseline automated verification (2026-07-29)

| Check                        | Result                                                           |
| ---------------------------- | ---------------------------------------------------------------- |
| Prettier formatting          | passed                                                           |
| ESLint                       | passed                                                           |
| TypeScript strict typecheck  | passed across 7 workspace projects and tools                     |
| Vitest                       | 128 passed, 0 failed across 21 files; web 58, SDK 21, indexer 37 |
| Foundry                      | 54 passed, 0 failed across 13 suites                             |
| Foundry fuzz                 | 11 properties, 256 cases per property                            |
| Foundry invariants           | 6 invariants, 128 runs × 32 calls, 0 reverts                     |
| Gas snapshot                 | regenerated with fixed seed; two consecutive checks passed       |
| Contract sizes               | passed; largest runtime was `LaunchFactory` at 16,402 bytes      |
| ABI export                   | 8 contract ABIs and one manifest generated                       |
| Deployment manifests         | 2 validated; incomplete, zero, wrong-chain probes rejected       |
| Production build             | passed; source maps disabled                                     |
| Secret scan                  | passed across 189 files                                          |
| Dependency audit             | no known vulnerabilities                                         |
| Public-demo production build | passed                                                           |
| Public response protections  | CSP, nosniff, frame, referrer, and permissions via worker proxy  |
| Playwright                   | 2 end-to-end scenarios passed in 2.2 minutes                     |

Slither and `git-secrets` were not installed in the execution environment.
Their absence did not replace the Foundry suites or repository secret scanner.

## Browser flow

Playwright started a disposable Anvil chain, deployed the local contracts,
connected an EIP-6963 test wallet, uploaded content-addressed metadata, created
the token/pool/vault/locker atomically, waited for the indexer, and opened the
token detail view. It then executed 12 buys from independent accounts, approved
exactly the sell amount, executed one sell, reconciled all 13 indexed trades
and receipts, refreshed the page, and confirmed that state was restored from
the indexer.

The browser flow also queried the launch-specific locker directly over Anvil
RPC and required `principalIntact() == true`. The live local UI intentionally
withheld the `Liquidity Locked` and template-verification badges because the
indexer has not yet attested deployed runtime bytecode; those facts remained
`데이터 수집 중`. The immutable public recording translates only facts proven
by that completed local run to `로컬 실행 시 확인됨`, never to a live
`확인됨` claim.

The final E2E rerun occurred after the deployment-chain guards, standard V2
event decoder, transaction-sender buyer attribution, metadata hydration,
persisted non-starving metadata backoff, initial AMM event-order recovery,
zero-claim filtering, sell-gas checks, receipt-unknown persistence/recovery, and
fail-closed contract-fact projection were added.

The public-demo record was then regenerated from the same automated vertical
flow with `FORGE_CAPTURE_PUBLIC_DEMO=1`. It contains FE2E at block `18`, 13
actual indexed trades from 12 distinct buyers, 12 ordinary holders, an 86.10%
top-ten ordinary-holder concentration, and canonical response SHA-256
`f2ae8f5766cf798a8185b84626ed89de30388f5c4597776c3a5efdfcbbd6da08`.
No placeholder chart, volume, price, or holder statistic is added.

The in-app browser was also checked manually at 375×812, 430×932, 768×900, and
1440×900. It had no horizontal overflow or console errors, exposed one main
landmark and one H1, kept image alternatives, and showed the local-test
disclaimer. At 375px the first recorded launch is visible in the initial home
viewport and token evidence appears before the longer read-only explanation. At
768px all four primary navigation links remain available and the chart starts
at 261px, before the read-only explanation at 766px.

The motion regression suite proves that route exit content remains present only
for the 160ms visual handoff while being `inert` and `aria-hidden`, rapid
back-navigation cannot strand an invisible route, and changing
`prefers-reduced-motion` removes outgoing content immediately. A deliberately
delayed lazy route must show a non-interactive loading fallback rather than
reactivating the previous page. It also checks focus restoration from quote to
execute without stealing focus after a mid-request amount edit, public-demo
chart/metric/disclosure DOM order, logical token-page focus order,
44px-or-larger mobile targets, and 721–1050px navigation coverage.

Screenshots:

- `artifacts/screenshots/forge-token-375x812.png`
- `artifacts/screenshots/forge-token-430x932.png`
- `artifacts/screenshots/forge-home-1440x900.png`
- `artifacts/screenshots/motion-audit/after/01-home-desktop.png`
- `artifacts/screenshots/motion-audit/after/02-token-desktop.png`
- `artifacts/screenshots/motion-audit/after/03-create-desktop.png`
- `artifacts/screenshots/motion-audit/after/04-risk-desktop.png`
- `artifacts/screenshots/motion-audit/after/05-home-mobile.png`
- `artifacts/screenshots/motion-audit/after/06-token-mobile.png`
- `artifacts/screenshots/motion-audit/after/07-home-430.png`
- `artifacts/screenshots/motion-audit/after/08-token-430.png`
- `artifacts/screenshots/motion-audit/after/09-home-tablet-768.png`
- `artifacts/screenshots/motion-audit/after/10-token-tablet-768.png`

## Commands

```sh
pnpm verify
pnpm contracts:snapshot
pnpm contracts:snapshot:check
pnpm audit --audit-level high
pnpm verify:public-demo
FORGE_WEB_PORT=5180 pnpm test:e2e
./scripts/foundry.sh test -vv
./scripts/foundry.sh test --match-contract GiwaTestnetSelfHostedFlowTest \
  --fork-url https://sepolia-rpc.giwa.io -vv
./scripts/foundry.sh test \
  --match-test testDeploymentModesAreExplicitAndFailClosed \
  --fork-url https://sepolia-rpc.giwa.io -vv
```

`pnpm contracts:snapshot:check` was run twice after generation to prove the
fixed-seed snapshot is reproducible.

## GIWA boundary

Read-only GIWA Sepolia RPC, chain ID, safe/finalized tags, balance method,
explorer API, bridge, and faucet reachability were checked as recorded in
`giwa-testnet-smoke.md`.

The explicitly opted-in, test-only self-hosted AMM path was broadcast to chain
`91342`. `ProtocolConfig`, `LaunchFactory`, and the adapter are live and source
verified on the official explorer, and a launch, buy, exact-amount approval,
and sell were executed against that deployment. The resulting token, pool, LP
locker, and creator vesting vault are source verified as well, and the factory
residue, sell-allowance, LP-lock, token-authority, and vesting claims were
re-read from chain state. Addresses, transaction hashes, and reproduction
commands are in [`giwa-sepolia-deployment.md`](giwa-sepolia-deployment.md).

This is not an audit. The deployed AMM is Forge's own unaudited test-only
adapter, its `ProtocolConfig` was constructed with `allowTestAdapters=true`, and
the external Uniswap-V2-compatible AMM path remains fail closed.
