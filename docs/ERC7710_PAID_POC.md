# ERC-7710 x402 Paid PoC

Status: implemented and feature-flagged. The paid ERC-7710 path can now settle
locally with the configured funded facilitator signer, return an onchain tx
hash, and write the ledger only after receipt success.

This phase is no longer a no-spend dry run. When enabled and triggered from the
Dashboard, it submits a real ERC-7710 x402 paid request and may spend
`0.01 USDC` testnet USDC on Base Sepolia.

## Scope

The paid PoC verifies:

```text
stored MetaMask Advanced Permission grant
-> ERC-7710 x402 delegation payload
-> paid x402 request
-> facilitator settlement
-> onchain tx hash
-> ledger payer / payTo / amount / txHash
```

It is now the default Dashboard `Run Agent` payment rail when the local
ERC-7710 flag is enabled. The old EOA x402 client remains in the repo as a
legacy fallback module, but the main button no longer calls it.

## Feature Flag

Default behavior is disabled.

```text
ERC7710_PAID_POC_ENABLED=false
ERC7710_PAID_POC_PRICE_ATOMIC=10000
SPENDGUARD_PRICE_PER_CALL_ATOMIC=10000
```

To run the live PoC locally:

```text
ERC7710_PAID_POC_ENABLED=true
ERC7710_PAID_POC_PRICE_ATOMIC=10000
X402_FACILITATOR_URL=https://tx-sentinel-base-sepolia.api.cx.metamask.io/platform/v2/x402
X402_ERC7710_FACILITATOR_ADDRESSES=
X402_PROXY_URL=http://127.0.0.1:7890
AI_PROVIDER=deepseek
```

To run the self-settled paid PoC locally, keep the same paid PoC flags and add:

```text
ERC7710_SELF_SETTLE_ENABLED=true
FACILITATOR_ADDRESS=0x...
FACILITATOR_PRIVATE_KEY=0x...
ERC7710_SELF_SETTLE_RECEIPT_POLL_MS=2000
ERC7710_SELF_SETTLE_RECEIPT_TIMEOUT_MS=120000
```

`FACILITATOR_PRIVATE_KEY` must be server-only and funded with Base Sepolia ETH.
When self-settle is enabled, the paid PoC requirement advertises
`FACILITATOR_ADDRESS` as the ERC-7710 redeemer constraint.

Restart the Next.js server after changing the flag.

## Files

```text
.env.example
docs/ERC7710_PAID_POC.md
src/app/api/x402/deepseek/risk-brief/erc7710-paid-poc/route.ts
src/app/page.tsx
src/client/x402/payErc7710DeepseekRiskBrief.ts
src/components/AgentControls.tsx
src/components/Dashboard.tsx
src/server/config/spendguard.ts
src/server/x402/erc7710PaidPocResourceServer.ts
src/server/x402/erc7710SelfSettlement.ts
```

## Server Path

```text
POST /api/x402/deepseek/risk-brief/erc7710-paid-poc
```

The route returns `404 ERC7710_PAID_POC_DISABLED` unless
`ERC7710_PAID_POC_ENABLED=true`.

When enabled, it registers `x402ExactEvmErc7710ServerScheme` and requires:

```text
scheme = exact
network = configured x402 network
asset = Base Sepolia USDC
amount = 10000
extra.assetTransferMethod = erc7710
```

On settlement success, the ledger is written only after facilitator settlement
succeeds. Settlement failure does not write a success ledger entry.

## Payer Rule

For ERC-7710, payer is recorded from:

```text
paymentPayload.payload.delegator
```

Do not use the old EOA `TransferWithAuthorization` payer extraction rule for
this path. `grant.to` is the local session/redeemer account, not the payer.

## Client Path

The client uses the stored grant and local session account:

```text
grant.context -> parentPermissionContext
grant.to -> redeemer/session account
grant.from -> delegator/payer
```

Safeguards:

- Does not call `wallet_requestExecutionPermissions`.
- Does not call `eth_sendTransaction`.
- Filters the x402 requirement to exact amount `10000`.
- Filters network, USDC asset, `payTo`, and `extra.assetTransferMethod`.
- Verifies generated `delegator` and `delegationManager` against the stored grant.
- Adds `LimitedCallsEnforcer(limit=1)` to the generated child delegation so the
  same child delegation cannot be redeemed repeatedly after a timeout/retry.
- When the paid PoC requirement includes `extra.facilitatorAddresses`, verifies
  that the generated permission context contains the RedeemerEnforcer and those
  facilitator/redeemer addresses before submitting the paid request. This
  validation decodes the ERC-7710 permission context into delegations/caveats and
  inspects RedeemerEnforcer terms directly.
- Before submitting the paid request, runs a no-spend local preflight that
  simulates `DelegationManager.redeemDelegations(...)` from the advertised
  facilitator signer addresses. If all simulations revert, the paid request is
  blocked locally before reaching facilitator settlement.
- After preflight passes, the Dashboard asks for a second confirmation before
  submitting the real settlement request, so a diagnostic click can stop after
  the no-spend simulation.

## Revoke Boundary

The paid path depends on an active stored MetaMask Advanced Permission grant.
The Dashboard Revoke button now attempts `wallet_revokeExecutionPermission`
against the stored ERC-7715 `permissionContext`, then re-checks
`wallet_getGrantedExecutionPermissions`.

Local policy is closed only when the grant is missing from wallet truth or the
stored grant has expired. If the wallet does not support direct revoke, or if
the user rejects the prompt, the policy remains active and the app tells the
user to revoke in MetaMask first, then sync.

## Manual Acceptance Checklist

With the feature flag on:

- Dashboard shows the paid 7710 PoC control.
- Clicking it confirms the `0.01 USDC` spend.
- First request receives an ERC-7710 `402 Payment Required`.
- Client submits the second paid request with the ERC-7710 payment header.
- Facilitator settlement succeeds.
- Response includes a tx hash.
- Base Sepolia explorer shows the tx.
- `/api/ledger` shows a success entry with payer, payTo, amount `10000`, and txHash.
- Revoke either directly removes the MetaMask Advanced Permission and then
  closes local policy after sync, or clearly reports that direct revoke is not
  supported and waits for manual MetaMask revoke plus sync.

With the feature flag off:

- Dashboard does not show the paid 7710 PoC control.
- API returns `404 ERC7710_PAID_POC_DISABLED`.

## Validation

Passed:

```bash
npm run typecheck
npm run build
```

Safe smoke checks:

- Flag off API returned `404 ERC7710_PAID_POC_DISABLED`.
- Flag on unpaid request returned `402` with amount `10000` and
  `extra.assetTransferMethod = "erc7710"`.
- Flag on Dashboard rendered `Pay 0.01 USDC 7710`.
- Earlier real browser clicks reached the paid PoC path, but paid retries
  returned `402`; `/api/ledger` remained empty.
- A no-spend fake payment-header probe confirmed the error is surfaced as
  `X402_PAYMENT_VERIFICATION_FAILED` instead of a frontend TypeError.
- After configuring MetaMask's Base Sepolia facilitator URL, the local backend
  could not reach `/supported`; the API now returns
  `502 X402_FACILITATOR_UNAVAILABLE` for that network condition.
- After setting `X402_PROXY_URL=http://127.0.0.1:7890`, the local backend and a
  direct proxy probe reached the MetaMask facilitator `/supported` endpoint.
- `/supported` returned `200` and included `eip155:84532` with
  `assetTransferMethods` including `erc7710`.
- The paid PoC unpaid endpoint returns `402` with amount `10000` and
  `extra.assetTransferMethod = "erc7710"`.
- After converting `0xE56937908B36022578ab8D66B0002f246722EE8e` to a MetaMask
  smart account / EIP-7702 account, `eth_getCode` on Base Sepolia returns code
  starting with `0xef0100`.
- The stored grant has
  `from = 0xE56937908B36022578ab8D66B0002f246722EE8e`,
  `to/sessionAccount = 0x5Dc9c6785b84c88732312772776535c56C66996a`, and
  `dependencies = []`.
- The latest real `Pay 0.01 USDC 7710` click failed with
  `Facilitator settle failed (504)` and an HTML body. `/api/ledger` stayed
  empty, `spent` stayed `0`, no tx hash was returned, and recent Base Sepolia
  USDC `Transfer` logs did not show a `10000` atomic transfer from the
  delegator to `X402_PAY_TO`.
- A follow-up fix now injects MetaMask Base Sepolia facilitator signer addresses
  into the paid PoC requirement as `extra.facilitatorAddresses`, because
  MetaMask `/supported` exposes them under top-level `signers` rather than
  `supportedKind.extra.facilitatorAddresses`.
- The paid client now refuses to submit the paid request if the generated
  ERC-7710 permission context does not contain the RedeemerEnforcer and the
  configured facilitator/redeemer addresses.
- `npm run typecheck` passed after this fix.
- No-spend checks after this fix:
  - paid PoC unpaid request returns `402`, amount `10000`,
    `assetTransferMethod = "erc7710"`, and the three facilitator addresses;
  - dry-run unpaid request returns `402` with no-spend flags;
  - dry-run with a payment header returns `400 DRY_RUN_PAYMENT_REJECTED`;
  - existing EOA paid route still returns unpaid `402`;
  - `/api/ledger` remains empty with `spent = 0` and no tx hash.
- A later browser click showed the pre-submit guard reporting all three
  facilitator addresses as missing before settlement. This was a local false
  positive caused by raw hex matching; RedeemerEnforcer terms encode addresses
  as 20-byte chunks.
- The guard and server-side settlement diagnostics now decode the ERC-7710
  permission context into delegations/caveats and inspect RedeemerEnforcer terms
  directly.
- `npm run typecheck` passed after the decoded-caveat guard fix.
- Safe no-spend checks after the decoded-caveat guard fix:
  - paid PoC unpaid request returns `402`, amount `10000`,
    `assetTransferMethod = "erc7710"`, and the three facilitator addresses;
  - dry-run unpaid request returns `402` with no-spend flags;
  - dry-run with `x-payment` returns `400 DRY_RUN_PAYMENT_REJECTED`;
  - existing EOA paid route still returns unpaid `402`;
  - `/api/ledger` remains empty with `spent = 0` and no tx hash.
- A real retry after the decoded-caveat guard fix passed local validation and
  reached paid request submission, then failed at facilitator settlement with
  HTTP `504` and an HTML body. The browser console's `402 Payment Required` is
  expected for the first x402 challenge request; the actionable failure is the
  later settlement `504`.
- Facilitator HTML failures are now sanitized before being shown in the
  dashboard: the UI reports the `504`, that no tx hash was produced, and that no
  SpendGuard ledger entry was recorded.
- `npm run typecheck` passed after the error-display fix; `/api/ledger` remained
  empty with `spent = 0` and no tx hash; dry-run payment-header rejection still
  returned `400 DRY_RUN_PAYMENT_REJECTED`.
- The paid client now adds `LimitedCallsEnforcer(limit=1)` to the generated
  child delegation and performs a local `eth_call` settlement preflight before
  submitting the paid request to the facilitator.
- The Dashboard now asks for a second confirmation after preflight passes and
  before the real paid request is submitted.
- `npm run typecheck` passed after the limited-calls/preflight changes. Safe
  checks passed: paid PoC unpaid `402` still returns amount `10000` with
  `assetTransferMethod = "erc7710"` and three facilitator addresses; dry-run
  payment-header rejection still returns `400 DRY_RUN_PAYMENT_REJECTED`;
  `/api/ledger` remains empty with `spent = 0` and no tx hash.
- User-tested preflight on 2026-05-31: the Dashboard reached the second
  confirmation prompt, reporting that local ERC-7710 settlement preflight passed
  with 3 facilitator signers. The user canceled the second prompt, so no paid
  request was submitted. `/api/ledger` remained empty with `spent = 0` and no tx
  hash. Current UI behavior marks that canceled diagnostic run as
  `payment = failed` and `agentAction = failed`, even though no spend is
  submitted.

Known blocker:

- The original default `@x402/core` facilitator path verifies ERC-7710 payloads
  through the old exact EOA shape and reports an `authorization.from`-style
  error.
- The MetaMask facilitator is reachable through the local proxy and advertises
  ERC-7710 support for Base Sepolia, so the current blocker is no longer basic
  connectivity or the old EOA-only facilitator.
- The latest actual settlement blocker is facilitator settlement returning
  `504` after the delegator account became executable. Local settlement
  preflight now passes with 3 facilitator signers, so the generated
  `redeemDelegations` payload is simulatable before submission.
- Before any retry, verify `/api/ledger`, recent USDC `Transfer` logs,
  `eth_getCode(grant.from)`, and the paid PoC `402` requirement again so
  repeated clicks do not mask a delayed settlement or a missing redeemer
  constraint.

Self-settlement update:

- `ERC7710_SELF_SETTLE_ENABLED=true` wraps the x402 facilitator client so
  verification still uses the existing x402 path, but settlement uses a local
  funded signer to call `DelegationManager.redeemDelegations(...)`.
- The self-settle path runs a local `eth_call` preflight, submits the transaction,
  waits for a receipt, returns the tx hash in the x402 settlement response, and
  records ledger success only after receipt status is `success`.
- The settlement response and server logs include phase-level diagnostics:
  `validate`, `preflight`, `submit`, `receipt`, and `confirmed`.
