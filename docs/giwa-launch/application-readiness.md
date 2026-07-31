# GASOK application readiness

Checked at: 2026-07-30 KST

This is an evidence map, not a claim that Forge is deployed on GIWA. The
official [GASOK program page](https://giwa.io/gasok) says that Phase 1 and
Phase 2 criteria are evaluated together and lists the eight criteria below.
The same page shows an application deadline of 2026-07-31. Recheck the page
and the application form immediately before submitting.

## Executive status

Forge has strong local implementation and verification evidence. It also has a
public, read-only recording of a completed local Anvil run with a canonical
content hash.

Forge is now deployed on GIWA Sepolia `91342`. `ProtocolConfig`,
`LaunchFactory`, and the self-hosted test-only constant-product adapter are
live and source verified on the official explorer, and a launch, buy,
exact-amount approval, and sell were executed end to end against that
deployment. The resulting token, pool, LP locker, and creator vesting vault are
source verified too, and the safety claims were re-read from chain state. See
[`giwa-sepolia-deployment.md`](giwa-sepolia-deployment.md).

Forge still does not have GIWA Wallet integration acceptance or independently
recruited user evidence, and the deployed AMM is Forge's own unaudited
test-only adapter rather than an approved external GIWA DEX.

The public demo currently replays the local Anvil recording, not the GIWA
Sepolia deployment. Until it is re-recorded against GIWA, submit the explorer
links as the deployment evidence and the demo only as product-design evidence.

The candidate submission deck is
[`Forge-GASOK-Pitch-Deck.pptx`](https://github.com/eomyunsig-debug/forge-giwa-launch-mvp/blob/0c6778ba5d75d8fdffc2977f2ee372a56270bc47/docs/pitch/Forge-GASOK-Pitch-Deck.pptx).
The candidate source is published at immutable commit
[`0c6778ba5d75d8fdffc2977f2ee372a56270bc47`](https://github.com/eomyunsig-debug/forge-giwa-launch-mvp/commit/0c6778ba5d75d8fdffc2977f2ee372a56270bc47)
and [PR #5](https://github.com/eomyunsig-debug/forge-giwa-launch-mvp/pull/5), now merged.
Signed-out HTTP checks returned 200 for the commit, PR, license, submission
screenshots, and deck. The downloaded deck SHA-256 is
`16e17cac7c198b907565fe3f6ba009491890389f7455a7ad6d398132f16c81cb`.
PR #5 is merged. Submit the immutable commit links above rather than
default-branch file URLs, so the reviewed state cannot drift.

Submission visuals:

- [desktop first view](../../artifacts/screenshots/gasok/home-first-view-1440x900.png);
- [wallet-container home](../../artifacts/screenshots/gasok/wallet-embed-home-390x844.png);
- [wallet-container token detail](../../artifacts/screenshots/gasok/wallet-embed-token-390x844.png).

The two wallet images show a layout prototype, not a completed GIWA Wallet host
integration. The Korean external-test invitation is
[`pilot-invite.ko.md`](pilot-invite.ko.md); do not send it before a real
deployment and operator preflight.

Korean form-ready copy is kept in
[`application-answers.ko.md`](application-answers.ko.md). Applicant identity,
background, time commitment, and contact fields remain explicit placeholders
for the applicant rather than being inferred from Git history.

## Eight-criterion evidence map

| Official criterion                | Honest status                                        | Evidence available now                                                                                                                                                                                                                                                                                                                                                                                                                                          | Missing evidence / next gate                                                                                                                                                                                                                                                                                                               |
| --------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. GIWA chain fit                 | Deployed on GIWA Sepolia; rationale documented       | GIWA Sepolia chain configuration, read-only RPC/finality smoke, exact-chain deployment guards, a fail-closed external-AMM boundary, an explicitly opted-in self-hosted test-only AMM deployment path, and the rationale in [`why-giwa.md`](why-giwa.md)                                                                                                                                                                                                         | The deployed AMM is Forge's own test-only adapter, not an approved external GIWA DEX, and no GIWA Wallet host integration exists yet. Submit the explorer links as completed testnet adoption and the audit/wallet work as the next gate.                                                                                                  |
| 2. Originality                    | Evidence available                                   | Forge reports creator allocation, vesting, liquidity custody, administrator powers, holder concentration, contract-source status, and data freshness as separate facts instead of compressing them into a safety score. See the [public read-only demo](https://forge-giwa-launch-eomyunsig.eomyunsig.chatgpt.site/), [`README.md`](../../README.md), and [`threat-model.md`](threat-model.md).                                                                 | Validate that target users understand the separate-facts model better than a score or badge. No user research result is claimed yet.                                                                                                                                                                                                       |
| 3. Feasibility                    | Strong local evidence; remote gate open              | A small modular monorepo, fixed-template contracts, event-sourced indexer, typed transaction-intent boundary, local vertical runner, automated browser verification, and a chain-gated GIWA Sepolia self-hosted test-AMM path are implemented. Candidate code commit `0c6778ba5d75d8fdffc2977f2ee372a56270bc47` passed the complete local suite. See [`implementation-plan.md`](implementation-plan.md) and [`verification-report.md`](verification-report.md). | Broadcast and remote smoke are done. Any mainnet or external-AMM route still requires independent review and an audit.                                                                                                                                                                                                                     |
| 4. Marketability                  | Unproven                                             | The Korean-first risk-disclosure thesis, a usable read-only product demo, and a consent-based Korean pilot invitation are prepared.                                                                                                                                                                                                                                                                                                                             | There is no externally recruited wallet cohort, retention, TVL, transaction-volume, conversion, or willingness-to-use evidence. Follow [`submission-checklist.md`](submission-checklist.md) and use [`pilot-invite.ko.md`](pilot-invite.ko.md) only after deployment; do not count automated or builder-controlled accounts.               |
| 5. Team capability                | Partial, with execution evidence                     | Repository history and the recorded verification suites show that the prototype can be designed, implemented, reviewed, and iterated. The current working model is a solo builder using AI-assisted development and review tools.                                                                                                                                                                                                                               | The applicant must provide their real name, role, time commitment, and relevant background in the private application form. AI tools are not team members, and repository tests are not an independent security audit. State the intended use of program support: independent audit and an additional engineering/review contributor.      |
| 6. GIWA Wallet in-app suitability | Verified layout prototype; host integration unproven | `?embed=wallet` provides a single-column wallet-container layout, removes duplicate site navigation and wallet-connect UI, preserves the query across supported routes, and keeps the public recording read-only. Web Vitest passed 75/75, web typecheck and public build passed, and Playwright motion smoke passed 2/2 with 390px, query-preservation, and reduced-motion coverage.                                                                           | This is a public read-only embed-layout prototype, not completed GIWA Wallet host integration. The GIWA Wallet SDK or bridge, account/session handoff, security review, deployed embed URL, and GIWA integration acceptance remain unverified.                                                                                             |
| 7. Actual implementation level    | Deployed and verified on GIWA Sepolia                | Contracts, indexer, SDK, wallet UI, public read-only build, local create/buy/sell/reconcile flow, and a GIWA Sepolia deployment exist. Seven contracts are source verified on the official explorer and a launch, buy, exact-amount approval, and sell were executed on GIWA Sepolia; see [`giwa-sepolia-deployment.md`](giwa-sepolia-deployment.md). The public recording still contains one launch and 13 indexed local trades from automated test accounts.  | Phase 2 testnet deployment is satisfied and `giwa-testnet.json` carries the deployed addresses, block, transaction hashes, runtime bytecode hashes, and verified-source URLs. Remaining: re-record the public demo against GIWA Sepolia, and recruit real external wallets — the 12 local E2E buyer accounts are test fixtures, not users. |
| 8. Technical completeness         | Strong automated evidence; independent audit absent  | [`verification-report.md`](verification-report.md) records the full verifier at candidate code commit `0c6778ba5d75d8fdffc2977f2ee372a56270bc47`: Vitest 151/151, Foundry 69/69, the same GIWA flow 7/7 on a public-RPC read-only fork, full Playwright 3/3, typecheck/build, lint, manifests, ABI export, secret scan, dependency audit, security headers, and multi-viewport QA.                                                                              | Publish the exact candidate source and attach its final immutable SHA to the application. Slither and `git-secrets` were unavailable in the recorded environment, and no independent smart-contract audit has occurred. Add GIWA transaction, receipt, explorer-source, and indexer-reconciliation evidence only after they exist.         |

## Submission framing

The strongest truthful application is:

> Forge is a Korean-first launch market prototype that replaces a single
> “safe” badge with verifiable, separately sourced risk facts. The complete
> launch, liquidity, vesting, trading, indexing, and reconciliation flow is
> automated on local Anvil, and a read-only public recording exposes the
> resulting data without pretending to be live. GIWA Sepolia connectivity and
> an explicitly test-only self-hosted liquidity path are prepared fail closed,
> but the repository does not yet claim a GIWA deployment. GASOK support would
> be used to independently review the GIWA liquidity path, validate the GIWA
> Wallet host integration, and recruit a small consenting testnet cohort.

Do not change “does not yet claim” to “deployed,” “live,” or “GIWA-native”
until the evidence gates in [`submission-checklist.md`](submission-checklist.md)
are complete.

## Track fit

- **Track 01 — DeFi/RWA:** defensible now as the primary product category.
- **Track 05 — Mass Adoption:** defensible as a product thesis, while current
  demand remains unproven.
- **Track 03 — GIWA-Native Ideas:** use only with the explicit caveat that
  Forge is preparing to build on GIWA, or after real GIWA deployment and
  ecosystem-integration evidence exists. Do not imply completed GIWA-native
  execution.

The program allows multiple tracks. If the application surface permits one
choice only, choose Track 01. If it permits multiple choices or a separate
track application, add Track 05. Do not select Track 03 until a real GIWA
deployment and ecosystem-integration evidence exist. Track selection does not
replace evidence.
