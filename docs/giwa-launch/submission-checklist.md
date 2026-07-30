# GASOK submission links and evidence checklist

Checked at: 2026-07-30 KST

This checklist separates repository work from actions that require the
applicant, a user-controlled wallet, program coordination, or independent
testers. A checked repository item does not make an unchecked external item
true.

## Canonical links

| Item               | Link                                                                                                                                                                    | Current label                                                             |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Official program   | [GASOK](https://giwa.io/gasok)                                                                                                                                          | Primary source for deadline, criteria, tracks, and notices                |
| Application form   | [GASOK application — MVP Build Phase](https://ds.fdback.me/r/bLHPv694o6Au3)                                                                                             | Applicant completes; identity and legal declarations do not belong in Git |
| Source             | [Published candidate commit](https://github.com/eomyunsig-debug/forge-giwa-launch-mvp/commit/3cad0b47530269ce9cc48c61c0dc2552956693a1)                                  | Immutable source, evidence, screenshots, and submission documents         |
| Review PR          | [Draft PR #5](https://github.com/eomyunsig-debug/forge-giwa-launch-mvp/pull/5)                                                                                          | Candidate branch targeting `main`; not merged                             |
| Pitch deck         | [Forge GASOK pitch deck](https://github.com/eomyunsig-debug/forge-giwa-launch-mvp/blob/3cad0b47530269ce9cc48c61c0dc2552956693a1/docs/pitch/Forge-GASOK-Pitch-Deck.pptx) | Immutable reviewed PPTX                                                   |
| Product demo       | [Public read-only demo](https://forge-giwa-launch-eomyunsig.eomyunsig.chatgpt.site/)                                                                                    | Local Anvil recording; **not live GIWA**                                  |
| Evidence map       | [`application-readiness.md`](application-readiness.md)                                                                                                                  | Eight GASOK criteria                                                      |
| Korean answers     | [`application-answers.ko.md`](application-answers.ko.md)                                                                                                                | Form-ready draft; applicant identity remains a placeholder                |
| GIWA rationale     | [`why-giwa.md`](why-giwa.md)                                                                                                                                            | Honest application narrative                                              |
| Verification       | [`verification-report.md`](verification-report.md)                                                                                                                      | Last recorded local verification                                          |
| Threat model       | [`threat-model.md`](threat-model.md)                                                                                                                                    | Security powers and trust boundary                                        |
| GIWA network smoke | [`giwa-testnet-smoke.md`](giwa-testnet-smoke.md)                                                                                                                        | Read-only network evidence only                                           |
| AMM decision       | [`amm-decision.md`](amm-decision.md)                                                                                                                                    | Why remote execution remains fail closed                                  |
| Pilot invitation   | [`pilot-invite.ko.md`](pilot-invite.ko.md)                                                                                                                              | Korean consent and test instructions; do not send before deployment       |
| License            | [`LICENSE`](../../LICENSE)                                                                                                                                              | MIT                                                                       |

Submission visuals:

- [desktop first view](../../artifacts/screenshots/gasok/home-first-view-1440x900.png);
- [wallet-container home, 390×844](../../artifacts/screenshots/gasok/wallet-embed-home-390x844.png);
- [wallet-container token detail, 390×844](../../artifacts/screenshots/gasok/wallet-embed-token-390x844.png).

The wallet screenshots are layout evidence only. They are not evidence of a
GIWA Wallet SDK, bridge, session handoff, production deployment, or integration
acceptance.

## Repository evidence

- [x] Public baseline source repository.
- [x] Publish the GASOK candidate branch and confirm that its exact SHA,
      source, screenshots, and pitch deck are reachable signed out.
- [x] Product README with local/run/verify instructions and explicit read-only
      demo boundary.
- [x] Permissive license with a non-personal contributor copyright label.
- [x] Public read-only product demo.
- [x] Local contract, SDK, indexer, web, and end-to-end implementation.
- [x] Recorded automated verification and multi-viewport screenshots.
- [x] Threat model, AMM decision, and read-only GIWA network smoke record.
- [x] Submission pitch deck generated and visually reviewed.
- [x] Korean form-answer draft with applicant-owned identity placeholders.
- [x] Korean consent-based pilot invitation draft, clearly blocked from sending
      before a real deployment and operator preflight.
- [x] Public-demo `?embed=wallet` layout prototype with single-column content,
      redundant navigation and wallet UI removed, query preservation, and
      read-only mutation guards. This is not host integration.
- [x] Explicitly opted-in, chain-gated, test-only GIWA Sepolia self-hosted AMM
      deployment path. This is code readiness, not deployment evidence.
- [x] GIWA deployment signer boundary accepts only a public deployer address in
      configuration; the actual signer is loaded interactively from Foundry's
      local encrypted keystore with `--account`. No raw GIWA private key or
      keystore password belongs in chat, Git, or an env file.
- [x] `giwa-testnet.json` represents non-deployment with null addresses
      instead of invented contracts.
- [x] Candidate code commit
      `eb488698f3d64f616b98f3afa28892a1d7da273c` passed the complete verifier
      on 2026-07-30 KST. The subsequent submission-evidence update changes
      documentation only and must receive its own formatting/link checks.
- [x] Confirm the public source and repository screenshots are reachable in a
      signed-out request. Commit, PR, license, desktop screenshot, and deck
      returned 200 on 2026-07-30 KST.
- [x] Confirm the public demo, deep links, OG image, JavaScript, and CSS are
      reachable. Version 15 from published commit
      `3cad0b47530269ce9cc48c61c0dc2552956693a1` was live-checked on
      2026-07-30 KST; JavaScript and
      CSS source maps returned 404 as intended.
- [x] Download the public pitch-deck link without GitHub authentication and
      confirm its SHA-256 equals the visually reviewed file:
      `16e17cac7c198b907565fe3f6ba009491890389f7455a7ad6d398132f16c81cb`.
- [x] Open `/?embed=wallet` and the recorded token route with
      `?embed=wallet` in a signed-out 390px browser. Both were live-checked on
      2026-07-30 KST with query preservation, no horizontal overflow, no
      transaction controls, and no browser console error. This remains a
      top-level wallet-container layout prototype, not host integration.

## Track selection

- If the form allows one choice, select **Track 01 — DeFi/RWA**.
- If it allows multiple choices or a separate track application, add
  **Track 05 — Mass Adoption**.
- Do not select **Track 03 — GIWA-Native Ideas** until real GIWA deployment,
  explorer, and ecosystem-integration evidence exist.

## Evidence that must not be fabricated

- [ ] **GIWA deployment:** record the deployed manifest, chain ID `91342`,
      deployment transaction hashes, explorer URLs, source-verification URLs,
      contract addresses, deployed block, exact `adapterId`, and runtime
      bytecode hashes. The manifest schema rejects a deployed state without
      this evidence.
- [ ] **GIWA vertical smoke:** record a real testnet launch, quote, buy, sell,
      receipts, minimum-output/deadline behavior, and indexer reconciliation
      from a user-controlled browser wallet. The web and indexer must both use
      the explicit self-hosted test-only mode; their defaults remain disabled
      or V2.
- [ ] **GIWA Wallet integration:** distinguish a responsive or embed-layout
      prototype from an actual host/API integration and from GIWA acceptance.
- [ ] **Independent audit:** link the auditor, scope, commit SHA, report, and
      remediation status. Internal tests and AI review are not an independent
      audit.
- [ ] **External demand:** provide consenting tester and feedback evidence as
      described below. Local E2E accounts, deployer accounts, and
      builder-controlled wallets do not count.

Until the first two items exist, describe Forge as “a local MVP preparing for
GIWA Sepolia,” not “live on GIWA,” “deployed on GIWA,” or “GIWA-native
execution.”

## Applicant-owned form inputs

These are external actions. The repository must not guess them:

- [ ] Enter the applicant's real legal/contact information directly in the
      private form.
- [ ] State the current team accurately: solo builder unless real contributors
      have agreed to named roles. Do not count AI tools as people.
- [ ] Add relevant builder experience and weekly time commitment with
      verifiable links.
- [ ] State requested program support concretely: GIWA liquidity review,
      independent smart-contract audit, Wallet host integration, and a second
      engineering/review contributor.
- [ ] Review tax, information-disclosure, promotional-use, privacy, and other
      notices in the official form before consenting.
- [ ] Do not imply that GASOK selection affects Upbit listing; the official
      notice says it does not.

## External 5–10 wallet pilot

**Current status: not started and not countable until a real GIWA Sepolia flow
is deployed.** This cannot be completed by a code change. Use
[`pilot-invite.ko.md`](pilot-invite.ko.md) only after the deployment and
operator preflight gates pass.

Goal: recruit 5–10 independently controlled, consenting testnet wallets and
learn whether users can find the risk facts and complete one intended task.
This is discovery evidence, not statistically significant traction.

### Recruiting and consent

1. Recruit through genuine personal or relevant community outreach. Do not
   create extra wallets, buy accounts, ask one person to pose as several users,
   or relabel automated E2E accounts.
2. Tell testers that Forge is unaudited testnet software, not an official GIWA
   or Upbit service, and has no listing or return promise.
3. Use testnet assets only. Never request a seed phrase or private key.
4. If any incentive is offered, disclose the eligibility, value, and source in
   the application. Do not pay for wash volume, repeated transactions, or
   positive feedback.

### One-session protocol

- Ask each tester to inspect a token's risk facts and explain one fact in their
  own words.
- Ask them to complete one scoped testnet action only after the real deployment
  and safety preconditions exist.
- Record whether they completed it unaided, where they stopped, and one
  voluntary feedback note.
- Count each independently controlled wallet once. Exclude the deployer, team,
  automated fixtures, duplicate operators, and transactions used only to seed
  liquidity.

### Minimal, privacy-conscious evidence

With consent, keep:

- a tester code such as `T01`, not a real name;
- timestamp, task attempted, completion status, and feedback summary;
- recruiting channel and any disclosed incentive;
- the exact product commit/deployment manifest tested.

If a raw address or transaction hash is necessary to prove wallet uniqueness,
obtain separate consent and keep it restricted to the applicant. Publishing a
transaction hash also makes its wallet address traceable, so do not put either
value in the repository, pitch deck, public report, or public chat. Do not
collect or publish off-chain identity, contact details, IP addresses, seed
phrases, private keys, or unredacted chat logs. Report aggregate results in the
application; provide raw evidence privately only when both participant consent
and the form's privacy terms permit it.

### Pilot report gate

- [ ] 5–10 unique external wallet operators consented.
- [ ] Exclusions and incentive policy recorded.
- [ ] Private qualifying transaction evidence for each counted wallet, with
      separate consent and no public address or transaction-hash disclosure.
- [ ] Completion and failure counts reported, not only successes.
- [ ] Feedback themes summarized without invented quotes.
- [ ] Known limitations stated: testnet cohort, small sample, recruitment bias,
      and no retention proof.

## Final truth check

Before submitting, search the application and repository copy for `live`,
`deployed`, `GIWA-native`, `audited`, `users`, `holders`, `TVL`, `volume`, and
`verified`. Every occurrence should link to current evidence or be rewritten
as a plan, local result, or explicit unknown.
