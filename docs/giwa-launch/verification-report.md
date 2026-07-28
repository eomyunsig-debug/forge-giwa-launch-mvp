# Forge verification report

Checked at: 2026-07-29 KST

This report records the local MVP evidence separately from the blocked GIWA
Sepolia state-changing smoke. It does not claim a testnet deployment.

## Automated verification

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
```

`pnpm contracts:snapshot:check` was run twice after generation to prove the
fixed-seed snapshot is reproducible.

## GIWA boundary

Read-only GIWA Sepolia RPC, chain ID, safe/finalized tags, balance method,
explorer API, bridge, and faucet reachability were checked as recorded in
`giwa-testnet-smoke.md`.

No GIWA contracts were deployed. A state-changing run requires both a
user-controlled funded browser wallet and an approved GIWA AMM that can create
new-token pools and expose a permanently lockable LP principal. Neither
prerequisite was available, so every GIWA deployment address remains `null` and
the remote adapter fails closed.
