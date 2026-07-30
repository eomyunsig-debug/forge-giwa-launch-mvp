# Forge verification report

- Baseline checked at: 2026-07-29 KST
- GASOK readiness delta checked at: 2026-07-30 KST
- Candidate code commit:
  `eb488698f3d64f616b98f3afa28892a1d7da273c`

This report records the local MVP evidence separately from the blocked GIWA
Sepolia state-changing smoke. It does not claim a testnet deployment.

## GASOK readiness delta

- The final candidate worktree passed the complete workspace verifier:
  151/151 Vitest tests across 22 files, 69/69 Foundry tests, strict typecheck,
  lint and formatting, contract-size and gas-snapshot checks, ABI export,
  deployment-manifest validation, production and public-demo builds, response
  protections, and a 207-file secret scan.
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
The GIWA AMM path is test-only code and fork-simulation evidence, not a
deployment or independent audit.

## Public release verification

Sites version 13 was deployed from the earlier readiness commit
`519f059c3b359f1b8cb843073b8539b4dd93d8dd` and checked on 2026-07-30 KST:

- `/`, `/?embed=wallet`, and the representative token deep link with
  `?embed=wallet` returned 200 and rendered the recorded local state;
- the wallet query remained on the detail link, the 390px view had no
  horizontal overflow, and the detail page exposed no connect, quote,
  approval, buy, or sell control;
- the application JavaScript and CSS, favicon, and 1200×630 OG image returned
  200; emitted JavaScript and CSS source-map URLs returned 404;
- CSP, Permissions Policy, Referrer Policy, `nosniff`, and clickjacking
  protections were present; browser console warnings and errors were zero.

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

No GIWA contracts were deployed. Forge now has an explicitly opted-in,
test-only self-hosted AMM path that can create new-token pools and expose
permanently lockable ERC-20 LP principal on chain `91342`. Its successful local
and public-RPC fork simulations are not broadcasts or an audit. A
state-changing run still requires a user-controlled funded browser wallet,
reviewed administrator and fee inputs, preflight, source verification, and
launch/buy/sell reconciliation. Every GIWA deployment address therefore remains
`null`; the external AMM path remains fail closed.
