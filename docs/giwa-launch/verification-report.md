# Forge verification report

Checked at: 2026-07-28 KST

This report records the local MVP evidence separately from the blocked GIWA
Sepolia state-changing smoke. It does not claim a testnet deployment.

## Automated verification

| Check                        | Result                                                           |
| ---------------------------- | ---------------------------------------------------------------- |
| Prettier formatting          | passed                                                           |
| ESLint                       | passed                                                           |
| TypeScript strict typecheck  | passed across 7 workspace projects and tools                     |
| Vitest                       | 118 passed, 0 failed across 19 files; web 50, SDK 21, indexer 35 |
| Foundry                      | 54 passed, 0 failed across 13 suites                             |
| Foundry fuzz                 | 11 properties, 256 cases per property                            |
| Foundry invariants           | 6 invariants, 128 runs × 32 calls, 0 reverts                     |
| Gas snapshot                 | regenerated with fixed seed; two consecutive checks passed       |
| Contract sizes               | passed; largest runtime was `LaunchFactory` at 16,402 bytes      |
| ABI export                   | 8 contract ABIs and one manifest generated                       |
| Deployment manifests         | 2 validated; incomplete, zero, wrong-chain probes rejected       |
| Production build             | passed; source maps disabled                                     |
| Secret scan                  | passed across 166 files                                          |
| Dependency audit             | no known vulnerabilities                                         |
| Public-demo production build | passed                                                           |
| Public response protections  | CSP, nosniff, frame, referrer, and permissions via worker proxy  |
| Playwright                   | 1 end-to-end scenario passed in 27.9 seconds                     |

Slither and `git-secrets` were not installed in the execution environment.
Their absence did not replace the Foundry suites or repository secret scanner.

## Browser flow

Playwright started a disposable Anvil chain, deployed the local contracts,
connected an EIP-6963 test wallet, uploaded content-addressed metadata, created
the token/pool/vault/locker atomically, waited for the indexer, and opened the
token detail view. It then executed a buy, approved exactly the sell amount,
executed a sell, reconciled receipts and indexed state, refreshed the page, and
confirmed that state was restored from the indexer.

The browser flow also queried the launch-specific locker directly over Anvil
RPC and required `principalIntact() == true`. The UI intentionally withheld the
`Liquidity Locked` and template-verification badges because the indexer has not
yet attested deployed runtime bytecode; those facts remained `데이터 수집 중`.

The final E2E rerun occurred after the deployment-chain guards, standard V2
event decoder, transaction-sender buyer attribution, metadata hydration,
persisted non-starving metadata backoff, initial AMM event-order recovery,
zero-claim filtering, sell-gas checks, receipt-unknown persistence/recovery, and
fail-closed contract-fact projection were added.

The in-app browser was also checked manually at 375×812 and 1440×900. It had no
horizontal overflow or console errors, exposed one main landmark and one H1,
kept image alternatives, and showed the local-test disclaimer.

Screenshots:

- `artifacts/screenshots/forge-token-375x812.png`
- `artifacts/screenshots/forge-token-430x932.png`
- `artifacts/screenshots/forge-home-1440x900.png`

## Commands

```sh
pnpm verify
pnpm contracts:snapshot
pnpm contracts:snapshot:check
pnpm audit --audit-level high
pnpm verify:public-demo
pnpm test:e2e
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
