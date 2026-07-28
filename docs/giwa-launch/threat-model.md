# Forge MVP Threat Model

Last reviewed: 2026-07-28

## Scope and assets

This model covers the local Anvil vertical flow and the GIWA Sepolia
configuration boundary. It does not claim mainnet readiness.

Assets to protect:

- users' testnet native currency and launched ERC-20 balances;
- creator allocations held by vesting vaults;
- LP principal held by permanent lockers;
- the integrity of quotes, transaction intent, receipts, and indexed state;
- metadata and any future social-ownership evidence;
- protocol creation-fee accounting;
- operator configuration integrity.

Trust boundaries:

1. A wallet signs only after explicit user action.
2. Contracts enforce fixed token behavior, allocation limits, vesting, fee
   accounting, and LP custody.
3. An approved AMM adapter is an external trust boundary. Local fixture behavior
   must never be represented as GIWA market behavior.
4. The indexer is a reconstructable view, not an authority over funds.
5. RPC, explorer, image host, and social providers are untrusted external
   services.

## Roles and powers

- Anyone may create a launch within the factory's enforced bounds.
- Token holders may transfer their own tokens. The template exposes no burn
  entry point.
- A creator may claim only the amount vested to the immutable creator address.
- The protocol operator may update only bounded creation-fee parameters, the
  fee recipient, and the AMM adapter allowlist. Each change is emitted.
- The operator cannot mint, pause, blacklist, tax, seize balances, change a
  creator, withdraw vesting principal, or withdraw locked LP principal.
- There is no proxy admin or upgrade path in the MVP.

The operator key remains a material risk because a compromised operator could
approve a malicious adapter for future launches or redirect future creation
fees. It cannot alter completed launch token/vault/locker rules.

## Threats, controls, and residual risk

| Threat                               | Enforced or implemented control                                                                                                                                                                                                                                                                    | Residual risk / UI treatment                                                                                                                                                                                                              |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Malicious creator                    | Fixed template removes mint, pause, blacklist, taxes and transfer controls. Allocation is capped and vested.                                                                                                                                                                                       | The creator can still sell vested or separately purchased tokens, publish misleading content, or abandon the project. Allocation and schedule remain prominent.                                                                           |
| Mass-creation spam                   | Exact creation fee, input bounds, API rate limits, pagination.                                                                                                                                                                                                                                     | Testnet fees have no economic value; stronger sybil resistance or moderation may be needed later.                                                                                                                                         |
| Front-running / sandwiching          | User-defined minimum output and deadline are enforced by the adapter. Quote intent binds chain/account/token/amount/deadline.                                                                                                                                                                      | Public mempools cannot guarantee execution price. The UI states price impact and slippage; no “bot-proof” claim.                                                                                                                          |
| Initial-liquidity manipulation       | Launch creates the pool and initial liquidity atomically. Minimum native liquidity is enforced.                                                                                                                                                                                                    | The creator chooses the starting price and can trade around it. It is disclosed, not scored as safe.                                                                                                                                      |
| Quote manipulation                   | Quotes are fetched from the configured on-chain pool, expire, and are invalidated on input/account/chain changes. Receipt is authoritative.                                                                                                                                                        | A malicious/compromised RPC can lie about reads or gas. Users can compare explorer evidence; RPC diversity is a later hardening item.                                                                                                     |
| Wrong RPC                            | Chain ID is checked at connection and immediately before signing. GIWA deployment is hard-limited to chain `91342`; local deployment is hard-limited to `31337`.                                                                                                                                   | A malicious RPC on the correct chain can still censor or return stale state. Indexer lag/source are visible.                                                                                                                              |
| Indexer lag/failure                  | Last-good state is retained; API meta exposes source, block and update time; each bounded poll compares its checkpoint with the canonical head; `/health` degrades for every non-synced checkpoint; missing data renders `—` or collection state. Hash-committed metadata is retried with backoff. | Fresh trades can be absent until reconciliation. Receipt success and indexer reconciliation are distinct states.                                                                                                                          |
| Reorg                                | Raw events are keyed by chain/block hash/tx/log index. Checkpoint hash mismatch triggers bounded rollback and replay. GIWA ingestion targets `safe`.                                                                                                                                               | Testnets may reset or reorganize beyond the retained window. The service then requires a documented resync.                                                                                                                               |
| Wallet account TOCTOU                | Account is snapshotted in transaction intent and checked again immediately before wallet request. Provider account-change invalidates quotes.                                                                                                                                                      | A wallet may change UI internally; the signed transaction and receipt address remain final evidence.                                                                                                                                      |
| Chain TOCTOU                         | Chain is snapshotted and re-read before approval/launch/swap. Chain change invalidates quote and approval plan.                                                                                                                                                                                    | User must explicitly retry after switching back.                                                                                                                                                                                          |
| Allowance misuse                     | Sell approval defaults to exact input amount and the spender is shown. No unlimited default. Approval and sell each recheck native gas when an estimate is available.                                                                                                                              | Tokens with nonstandard approvals are not accepted by the factory template; external wallets can still grant allowances independently.                                                                                                    |
| Metadata XSS                         | Server and client validate Zod schemas, MIME, extension, size, URL protocol, and description length. SVG/HTML are rejected. React renders text, not raw HTML.                                                                                                                                      | Remote image hosts may disappear or track viewers. Failed images use a local fallback.                                                                                                                                                    |
| Fake social links                    | A raw URL is never promoted to a verified state. The MVP verifier is disabled, and unverified links remain `검증할 수 없음`.                                                                                                                                                                       | Before enabling verification, the signed message must bind domain, chain, wallet, nonce, issue/expiry, and intended action, with provider evidence stored separately.                                                                     |
| Signature replay                     | The MVP does not expose a social-signature verification endpoint, so it cannot imply replay protection that has not been implemented.                                                                                                                                                              | Enabling it requires server-side single-use nonces, expiry, domain/action/chain/account checks, and provider-specific proof validation.                                                                                                   |
| Admin key theft                      | Powers are minimized, bounded, non-upgradeable and evented. Completed locks/vaults are unaffected.                                                                                                                                                                                                 | A stolen key can change future fees/recipient or approve a malicious future adapter. Multisig/timelock is P1 before public beta.                                                                                                          |
| Liquidity-locker bypass              | LP asset is transferred directly to the launch-specific locker and recorded. Locker exposes no withdrawal/emergency/delegatecall path. Tests assert principal cannot move.                                                                                                                         | The UI does not show `Liquidity Locked` from the launch event alone. It remains collection state until deployed locker bytecode and current principal are independently attested; AMM-level powers remain separate facts.                 |
| Vesting bypass                       | Immutable creator/token/allocation/cliff/end; linear calculation; claimed-before-transfer accounting; non-reentrancy and SafeERC20.                                                                                                                                                                | Timestamp is appropriate for vesting but validators can slightly influence block time. This does not bypass the long schedule.                                                                                                            |
| Integer rounding                     | Basis points and constant-product math use integers with explicit order and bounds. Tests fuzz allocations, claims, liquidity, and fees.                                                                                                                                                           | Dust may remain locked or vest at the final timestamp. UI does not convert source amounts to floating-point Number.                                                                                                                       |
| Fee accounting error                 | Exact `msg.value` equals fee plus liquidity; fee transfer and launch are atomic and evented. Unexpected native/token balances are rejected or accounted.                                                                                                                                           | Recipient failure reverts the launch. Future fee types require a new review.                                                                                                                                                              |
| API rate abuse                       | Bounded request body/upload size, in-memory request throttling, pagination, and no unbounded feed DOM. The default key is the Node server's TCP peer address, so clients cannot mint buckets with forwarding headers. Proxy-rewritten IP headers require an explicit trusted-proxy opt-in.         | In-memory throttling is per instance; shared edge limiting is a later production concern. A direct origin must not trust client-supplied forwarding headers, and an unavailable peer identity deliberately shares one fail-closed bucket. |
| Duplicate event ingestion            | Canonical composite uniqueness key and transactional upsert/ignore.                                                                                                                                                                                                                                | Provider inconsistencies are surfaced as errors; they do not zero last-good state.                                                                                                                                                        |
| False volume                         | Trades are derived only from standard V2 or local pool events and stored with tx/log identity. Distinct buyers use transaction senders, not caller-selected recipients.                                                                                                                            | Smart-account bundlers can aggregate several users under one transaction sender, so the metric may undercount and is not an identity measure.                                                                                             |
| Holder concentration error           | Balances derive from Transfer deltas; pool/locker/vault/burn/zero categories are excluded from both the ordinary-wallet top-ten numerator and its denominator and shown separately. Decimal strings are sorted without floating-point conversion.                                                  | Rebasing/reflection tokens would break this model, but the factory cannot create them.                                                                                                                                                    |
| Arbitrary external call/delegatecall | Factory calls only allowlisted adapters through a fixed interface. No arbitrary target or delegatecall exists.                                                                                                                                                                                     | Adapter allowlisting is therefore an operator-critical action and is disclosed.                                                                                                                                                           |
| Reentrancy                           | State-changing fund flows use checks-effects-interactions and explicit non-reentrant guards; SafeERC20 handles return values.                                                                                                                                                                      | External AMM/token code remains untrusted, which is why only the fixed token and reviewed adapters are admitted.                                                                                                                          |

## Solidity review checklist

- Custom errors cover input bounds, authorization, value accounting, deadlines,
  slippage and invalid integrations.
- Every address and fund-flow boundary rejects zero addresses where meaningful.
- `tx.origin`, arbitrary `delegatecall`, arbitrary target calls, and hidden
  owner controls are absent.
- Deployment scripts revert outside local Anvil `31337` and GIWA Sepolia
  `91342`; there is no mainnet script path.
- All supply is minted exactly once in the token constructor.
- Factory launch is atomic; a failed pool creation rolls back token, vault and
  locker deployment and fee transfer.
- Vault claims account state before transfer and cannot exceed allocation.
- Locker has no code path for principal withdrawal.
- Protocol config is not a proxy and all mutable settings emit events.

## Browser and server review checklist

- No private-key, seed phrase, API private key, or raw secret input exists.
- No signature or transaction request fires on page load.
- Wallet rejection is a cancellation state, not a protocol failure.
- A transaction is never called confirmed before its receipt succeeds.
- Once a wallet returns a transaction hash, a receipt RPC timeout remains a
  locked confirming state with a do-not-resubmit warning; it is never
  reclassified as a reverted transaction.
- Quote expiry and indexer reconciliation are distinct visible states.
- Explorer URLs come from the configured chain allowlist. Uploaded image and
  metadata URL protocols are validated, and external links open with
  `noopener noreferrer`.
- CSP and security headers restrict scripts, frames, objects and base URLs.
- API errors never overwrite a valid metric with a fabricated zero.

## Out-of-scope guarantees

Forge does not guarantee token value, creator honesty, absence of price
manipulation, AMM correctness, uninterrupted GIWA operation, social identity,
regulatory status, or returns. The testnet may reorganize or reset and test ETH
has no monetary value. Forge is not an official GIWA, Dunamu, or Upbit service.
