# Why GIWA

Checked at: 2026-07-30 KST

## The honest reason

Forge is intended for people who want to inspect a community-token launch
without interpreting contract bytecode, liquidity positions, or indexer
health. Its primary interface and risk education are Korean-first. GIWA's
documented direction—an Ethereum-compatible, builder-oriented L2 with Korean
documentation and a consumer-facing wallet—aligns with that audience and
distribution problem.

This is a product-and-distribution fit, not a claim that Forge depends on an
exclusive GIWA primitive. The Solidity contracts and event-sourced design can
run on another EVM chain. GIWA is the deliberate first target because:

1. **Audience fit:** Forge's Korean-first explanations are designed for users
   who should see creator allocation, vesting, liquidity custody,
   administrator powers, holder concentration, source status, and data
   freshness before acting.
2. **Wallet fit:** GIWA describes a wallet intended to reduce seed-phrase and
   chain-complexity barriers. A compact Forge risk-and-action surface could
   place those facts close to a user's decision. A layout prototype is not the
   same as an approved GIWA Wallet integration.
3. **Execution fit:** Ethereum compatibility lets Forge retain its tested
   fixed-template Solidity and typed transaction boundaries. GIWA's L2 design
   is directionally compatible with repeated quote, receipt, and indexed-fact
   checks, although Forge has not yet published a GIWA gas or latency
   benchmark.
4. **Ecosystem fit:** GASOK specifically offers GIWA engineering support,
   security-audit resources, and a possible Wallet in-app path. Those are the
   exact unresolved gates for a small solo-builder prototype: a reviewed
   liquidity integration, independent contract review, host-wallet
   integration, and real testnet-user validation.

References:

- [GIWA introduction](https://docs.giwa.io/giwa-chain/en)
- [GIWA user and wallet direction](https://docs.giwa.io/giwa-chain/en/introduction/try-giwa)
- [GASOK program and criteria](https://giwa.io/gasok)

## What Forge is not claiming

- No Forge contract is currently deployed to GIWA Sepolia.
- The public URL is a read-only recording of local Anvil evidence, not a live
  chain application.
- Forge is not an official GIWA, Dunamu, or Upbit service.
- Program selection or benefits are unrelated to Upbit digital-asset listing,
  as the GASOK notice itself states.
- The current `?embed=wallet` layout prototype does not prove SDK integration,
  account/session handoff, security review, deployed embed availability, or
  in-app acceptance.
- Forge has not proven lower fees, faster conversion, market demand, or user
  retention on GIWA.
- The self-hosted GIWA Sepolia constant-product path is explicitly test-only,
  unaudited, opt-in, and unbroadcast. Its presence is not mainnet readiness.
- No official or sufficiently reviewed external GIWA AMM has been approved for
  Forge's permissionless pool plus permanent LP-custody requirements.

## Application-ready short answer

> Forge chooses GIWA because its first users and interface are Korean-first,
> while GIWA combines EVM compatibility with Korean builder documentation and
> a consumer-wallet distribution path. Forge's contribution is not another
> safety badge: it exposes creator allocation, vesting, liquidity custody,
> administrator powers, holder concentration, source verification, and
> freshness as separate facts at the moment of decision. The local vertical
> product and an explicitly test-only GIWA deployment path are implemented;
> actual GIWA deployment, Wallet host integration, and external testnet-user
> validation remain explicit program milestones. We would use GASOK support for
> the GIWA liquidity review, independent smart-contract audit, Wallet
> integration, and a small consenting-user pilot—not to imply an Upbit listing
> relationship.

Keep this answer aligned with the actual deployment manifest and submitted
evidence. If a milestone remains incomplete, use future tense.
