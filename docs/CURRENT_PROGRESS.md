# Agent SpendGuard Current Progress

Last updated: 2026-06-02

## Current Snapshot

The project is currently a local Next.js demo for bounded AI-agent spending on
Base Sepolia. The active prize strategy is now focused on the main track:

```text
Best x402 + ERC-7710
```

Optimization plan:

```text
docs/X402_ERC7710_TRACK_OPTIMIZATION_PLAN.md
docs/X402_ERC7710_TRACK_OPTIMIZATION_PLAN_CN.md
```

Optimization focus:

```text
docs/X402_ERC7710_OPTIMIZATION_FOCUS.md
```

Working now:

- Real MetaMask EOA connection and Base Sepolia enforcement.
- Real MetaMask Advanced Permissions request path for an
  `erc20-token-periodic` Base Sepolia USDC grant.
- Server-side policy guard that requires the stored Advanced Permission grant
  before allowing the agent run path.
- Main `Run Agent` payment flow uses the stored MetaMask Advanced Permission
  grant to build and settle an ERC-7710 x402 payment.
- Feature-flagged paid ERC-7710 x402 endpoint and Dashboard control for a real
  Base Sepolia testnet spend.
- Real 1Shot relay settlement is wired as supporting infrastructure for the
  ERC-7710 paid x402 path.
- A real Base Sepolia paid run has confirmed through 1Shot and produced tx:

  ```text
  0xf669edc46cd69491719937a6b8f416a88fc0a0d0f70f99f216c05c8b82bc2577
  ```

- A later user-run clean E2E pass also confirmed through 1Shot with tx:

  ```text
  0xd864924d7f92e498f51d5a0065c4d1a29ae6629087f5e9602177f0c8590c3a4d
  ```

- P5 is live-validated: the user ran three paid ERC-7710 x402 calls from the
  same MetaMask Advanced Permission grant on `http://127.0.0.1:3012`, producing
  three independent Base Sepolia txs:

  ```text
  call #1: 0x62e550bd889a8eeb72b72633371bd4be8118cd6026ad330ffeb0957d18b0aec0
  call #2: 0x9398cc02b95761f07c890a9a6346318e78ef4649c1c971659b92f4e1f9d1bd4e
  call #3: 0xa065cfa4d2e09048ae4015e2f4a779c26de05cccae4a14af65c8356d174f65d3
  ```

- The 1Shot status parser now treats numeric `status: 200` with
  `receipt.transactionHash` as confirmed.
- `/api/ledger` currently reports 4 rows: 3 successful paid calls, 1 blocked
  over-budget precheck row, `spent=0.03`, and `remainingBudget=0.97 USDC`.
- Dashboard x402 evidence rail now shows the protected resource, selected
  requirement, `scheme=exact`, `assetTransferMethod=erc7710`, amount, network,
  asset, payTo, paid-header state, and tx hash/block-before-payment state.
- P6 seller transparency is implemented in the UI: the payment rail labels
  `Agent SpendGuard paid risk-brief API` as the x402 seller, shows the actual
  `/api/x402/deepseek/risk-brief/erc7710-paid-poc` seller route, keeps the
  x402 resource path visible, and states that DeepSeek is the downstream AI
  provider after settlement rather than the x402 seller.
- Dashboard ERC-7710 proof rail now shows the MetaMask Advanced Permission
  grant type, delegator / payer, session account / redeemer, delegation
  manager, parent permission context hash, generated payload context hash,
  child delegation target, and local/server validation status without exposing
  raw permission context.
- P1 caveat hardening is implemented and live-validated for the paid path: each 1Shot-scoped
  child delegation now includes an `erc20TransferAmount` caveat with
  `maxAmount = x402 service price + 1Shot relay fee budget`. The local payload
  proof decodes the child caveat and asserts its token and max amount before
  submitting the paid request.
- Dashboard Step 5 multi-run flow now keeps the stored Advanced Permission
  grant reusable after a paid call, shows `Approvals=1`, paid call count, next
  call number, and remaining budget, and labels repeat runs as `Run Call #N`.
- Spend ledger rows now preserve per-call proof: call number, amount, remaining
  budget after the row, ERC-7710 payload context hash, child delegation target,
  and tx hash. Oversized blocked rows explicitly show `No paid header`.
- Dashboard Step 6 accounting now separates the x402 service price, known
  1Shot relay fee, total wallet debit, agent budget consumed, and remaining
  budget. The policy card states that the demo spend cap counts x402 service
  price only while relay fee is shown separately as wallet debit.
- The paid ERC-7710 route now rejects a reused payload context hash before
  continuing, so each successful repeat paid call must be backed by a fresh
  child delegation / payment payload.
- Ledger writes now dedupe settled success records by tx hash, requirement id,
  or ERC-7710 payload context hash to avoid accidental duplicate rows for the
  same settled payment.
- Real DeepSeek adapter path runs after x402 payment succeeds.
- Local demo ledger / permission persistence.
- Dry-run ERC-7710 x402 PoC that builds a delegation payment preview from the
  stored MetaMask grant without submitting payment.
- Dry-run route safety guard that rejects payment headers before any
  verification, settlement, ledger write, or paid AI handler can run.
- Step 7 failure smoke script now covers missing ERC-7710 payment payload,
  dry-run payment-header rejection, oversized precheck blocking, 1Shot
  `status=200` normalization, and settled-payment duplicate identity matching.
- Revoke button now attempts the ERC-7715 direct wallet revoke RPC
  `wallet_revokeExecutionPermission` when available, then verifies wallet truth
  with `wallet_getGrantedExecutionPermissions` before closing local policy.
- The older paid x402 EOA typed-data client remains as legacy code but is no
  longer the Dashboard default path.

Still not done:

- Settlement failure is fail-closed by route structure, but this pass did not
  build a valid ERC-7710 payload fixture that intentionally fails only during
  settlement.
- Direct revoke support still depends on the user's MetaMask build. If the
  wallet does not support `wallet_revokeExecutionPermission`, the app falls
  back to explicit manual MetaMask revoke plus wallet-truth sync.
- Ledger and policy state are local demo persistence, not production storage.
- Any real ERC-7710 run includes a post-preflight browser confirmation before
  the paid request is submitted.

## Current Objective

Agent SpendGuard is being built as a hackathon MVP for bounded, observable, and
revocable AI-agent spending onchain.

The current implementation goal is no longer to expand side integrations. The
goal is to make the `Best x402 + ERC-7710` track evidence exceptionally clear
and repeatable:

```text
MetaMask Advanced Permissions
-> ERC-7710 delegation payment payload
-> x402 402 challenge
-> paid x402 request
-> policy-guarded settlement
-> confirmed tx and ledger proof
```

Current status: the no-spend ERC-7710 dry-run PoC, the real paid ERC-7710 x402
path, x402 evidence rail, ERC-7710 proof rail, Step 5 multi-run Advanced
Permission reuse UX, Step 6 budget accounting clarity, Step 7 fail-closed smoke
coverage, P1 child delegation amount caveat hardening, P2 Caveat Inspector UI,
P3 server caveat assertion, P4 onchain available-amount display, P5
multi-transaction evidence, P6 x402 seller transparency, and P7 repeatable
validation command stabilization are implemented.
Real Base Sepolia transactions have confirmed through the current
1Shot-supported settlement path, including three independent P5 paid calls from
the same Advanced Permission grant. Next work should proceed to P8 final
submission packaging.

Out of scope for the current optimization phase:

```text
- optimizing for the 1Shot specialty prize
- Venice as a main judging claim
- A2A coordination
- production-grade one-click revoke
```

## Step 5 Validation

Implemented in this pass:

- Repeat paid run UI remains available after the first paid call as long as the
  stored Advanced Permission grant is still active and budget remains.
- Dashboard runbook shows one approval, paid call count, next paid call number,
  and remaining budget.
- Ledger rows show `Call #1`, `Call #2`, distinct ERC-7710 payload hashes, tx
  hashes, and remaining budget after each row.
- Oversized requests are represented as `blocked` with `No paid header`, while
  policy remains `active` if budget remains.
- Server rejects a reused ERC-7710 payload context hash before continuing the
  paid route.

Validation completed:

```text
tsc --noEmit: passed
next build: passed
git diff --check: passed
Browser fixture check: passed at 1280x900 and 390x844 with 0 detected text overflows
```

Notes:

- Build/start can still report the existing `ox/tempo` dynamic dependency
  warning from the viem chain import path, and Node may print its SQLite
  experimental warning while `next start` serves API routes.
- The browser fixture used local synthetic persisted state only; it did not
  trigger MetaMask, DeepSeek, 1Shot, or a real settlement.
- A later P5 user run replaced the fixture-only risk: call #1, #2, and #3
  settled on Base Sepolia from the same stored Advanced Permission grant, with
  distinct tx hashes and payload context hashes.

## Step 6 Validation

Implemented in this pass:

- Added Dashboard-level accounting projection for:
  - x402 service price
  - 1Shot relay fee when known
  - total wallet debit when known
  - agent budget consumed
  - remaining budget
- Extended `paymentReceipt.oneShot` with structured `feeAtomic`,
  `feeCollector`, and `totalWalletDebitAtomic` fields derived from 1Shot
  settlement estimate metadata.
- Policy card now states the demo boundary: the SpendGuard cap counts x402
  service price, while relay fee is shown separately as wallet debit.
- Relayer timeline displays the relay fee and total wallet debit alongside the
  1Shot task state.
- Ledger rows now show per-call accounting:
  - service amount
  - relay fee
  - total wallet debit
  - budget consumed
- Blocked oversized rows continue to show no paid header and no wallet debit.

Known successful tx accounting:

```text
service price: 10000 atomic USDC = 0.01 USDC
1Shot relay fee: 10944 atomic USDC = 0.010944 USDC
total wallet debit: 20944 atomic USDC = 0.020944 USDC
agent budget consumed: 10000 atomic USDC = 0.01 USDC
```

Validation completed:

```text
./node_modules/.bin/tsc --noEmit: passed
/Users/puzhiqiu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ./node_modules/.bin/next build: passed
git diff --check: passed
Browser fixture check: passed at http://127.0.0.1:3013 with 0 unexpected text overflows
```

Notes:

- Build still reports the existing `ox/tempo` dynamic dependency warning from
  the viem chain import path.
- The first `./node_modules/.bin/next build` attempt failed only because Codex
  App's embedded Node process could not load the local Next SWC native binary
  under macOS code-signing rules. Re-running with the workspace bundled Node
  succeeded.
- The Step 6 browser check used a local synthetic fixture to display two paid
  calls plus one oversized blocked row. The fixture was reset afterward and did
  not trigger MetaMask, DeepSeek, 1Shot, or a real settlement.

## Step 7 Validation

Implemented in this pass:

- Extracted 1Shot status normalization into a focused helper:
  `src/server/adapters/oneShotStatus.ts`.
- Extracted settled-payment identity matching into a focused helper:
  `src/server/ledger/settledPaymentIdentity.ts`.
- Added `scripts/step7-failure-smoke.mjs`.
- Added `scripts/p7-verify.mjs`.
- Added `p7:verify`, `smoke:p3`, and `smoke:step7` to `package.json`.
- The P7 verify script uses `process.execPath` for TypeScript and Next CLI
  commands, so the entire run stays on the same Node runtime.
- The P7 verify script starts an isolated local `next start` server, an isolated
  `SPENDGUARD_DATA_DIR`, and a local x402 `/supported` facilitator stub for
  the unpaid 402 challenge path.

Smoke coverage:

```text
missing ERC-7710 payment payload -> HTTP 402 -> no success ledger
dry-run endpoint with payment-signature header -> HTTP 400 -> no ledger spend
oversized precheck -> blocked dashboard state -> no paid header / no relayer tx
1Shot status=200 + receipt.transactionHash -> normalized as confirmed
duplicate settled identity -> matches tx hash, requirement id, or payload hash
```

Command result:

```text
/Users/puzhiqiu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/p7-verify.mjs

P7 verification passed
```

Validation completed:

```text
/Users/puzhiqiu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ./node_modules/typescript/bin/tsc --noEmit: passed
/Users/puzhiqiu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ./node_modules/next/dist/bin/next build: passed
/Users/puzhiqiu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/p3-caveat-assertion-smoke.mjs: passed
git diff --check: passed
isolated SSR page smoke: passed
/Users/puzhiqiu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/step7-failure-smoke.mjs <isolated-localhost>: passed
```

Notes:

- Build still reports the existing `ox/tempo` dynamic dependency warning from
  the viem chain import path.
- The isolated smoke runs against the built app through `next start`, not the
  development server.
- The smoke script resets only the temporary `SPENDGUARD_DATA_DIR` created by
  `scripts/p7-verify.mjs`.
- No real MetaMask, DeepSeek, 1Shot, or settlement call is triggered by the
  P7 verify script.
- Highest residual risk: settlement failure without success ledger is verified
  by code structure (`onSettled` records only after successful settlement), but
  not by a live malformed ERC-7710 payload fixture in this pass.

## P1 Child Caveat Hardening Validation

Implemented in this pass:

- Added `erc20TransferAmount` to the paid-path child delegation generated in
  `src/client/x402/payErc7710DeepseekRiskBrief.ts`.
- The cap is computed from the 1Shot-scoped requirement:
  `x402 service price + 1Shot relay fee budget`.
- The relay fee budget now includes bounded 2x headroom over
  `max(relayer_getFeeData.minFee, x402 service price)`, because 1Shot can return
  a slightly higher `requiredPaymentAmount` during estimate. This keeps the
  child delegation capped while avoiding false `ERC20TransferAmountEnforcer`
  `allowance-exceeded` failures.
- The child caveat is scoped to Base Sepolia USDC and sits alongside the
  existing `limitedCalls`, `valueLte`, `allowedTargets`, `allowedMethods`, and
  `timestamp` caveats.
- Extended the ERC-7710 delegation inspector and payload proof to decode the
  child `erc20TransferAmount` enforcer, token address, and max amount.
- Added a client-side assertion before paid request submission: the generated
  payload must include the child amount caveat, and its token / max amount must
  match the scoped x402 payment.
- The proof rail now exposes the decoded child amount cap as `子金额上限`.

Validation completed:

```text
/Users/puzhiqiu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ./node_modules/typescript/bin/tsc --noEmit: passed
/Users/puzhiqiu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ./node_modules/next/dist/bin/next build: passed
git diff --check: passed
Browser smoke at http://localhost:3013/: passed
/Users/puzhiqiu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/step7-failure-smoke.mjs http://127.0.0.1:3013: passed
```

Notes:

- Build still reports the existing `ox/tempo` dynamic dependency warning from
  the viem chain import path.
- The first Step 7 smoke attempt hit a transient Next dev-server cache / hot
  reload 500 on `/api/ledger`; the endpoint immediately recovered, and the
  rerun passed all 5 checks.
- User-tested live paid call on 2026-06-01 confirmed that the new child amount
  caveat remains compatible with 1Shot settlement:
  - tx hash:
    `0x69de2c1f16ac9e837d80669e0830e99d7811dc11052835b8ab270bf00e8eb587`
  - payload context hash:
    `0x9834278a5e92467ea2a41995eebac7e685961c02b4edc782c9b05b2b4a66b0c4`
  - child `erc20TransferAmount.maxAmountAtomic`: `30000`
  - 1Shot fee: `12042` atomic USDC
  - total wallet debit: `22042` atomic USDC

## P2 Caveat Inspector UI Validation

Implemented in this pass:

- Extended the ERC-7710 delegation inspector to decode the full paid-path child
  caveat set into structured proof data:
  `limitedCalls`, `valueLte`, `allowedTargets`, `allowedMethods`, `timestamp`,
  and `erc20TransferAmount`.
- Added an ordered raw caveat summary for the proof rail, while still keeping
  the raw permission context hidden and represented by hash / byte count.
- Extended `PermissionPreview` with a Caveat Inspector that shows:
  - parent permission: token, period amount, period duration, start time,
    expiry, delegator, redeemer, delegation manager
  - child delegation: call limit, native value cap, allowed target, allowed
    method selector, timestamp window, ERC-20 transfer amount cap
- Preserved backward compatibility for the existing P1 paid proof in local
  ledger state: it still shows `子金额上限`, while the missing full child caveat
  set is labeled as historical proof. Newly generated paid payload proofs will
  carry the complete `childCaveats` object.

Validation completed:

```text
/Users/puzhiqiu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ./node_modules/typescript/bin/tsc --noEmit: passed
git diff --check: passed
Browser smoke at http://localhost:3013/: passed
```

Browser smoke evidence:

```text
DOM contains: ERC-7710 证明, 父级授权限制, 本次 child delegation 限制, 周期额度, erc20TransferAmount
Screenshot: .spendguard/screenshots/p2-caveat-inspector-panel.png
```

## P5 Multi-Transaction Evidence Validation

Validated by user-run browser flow on `http://127.0.0.1:3012`.

Successful paid calls:

```text
call #1:
  txHash: 0x62e550bd889a8eeb72b72633371bd4be8118cd6026ad330ffeb0957d18b0aec0
  payloadContextHash: 0xe35522e53e9cf3c72e0150fa298e9b9446c83b91343ad6ce79da1be957481d10
  service price: 10000 atomic USDC
  1Shot fee: 12042 atomic USDC
  total wallet debit: 22042 atomic USDC
  remaining after: 0.99 USDC

call #2:
  txHash: 0x9398cc02b95761f07c890a9a6346318e78ef4649c1c971659b92f4e1f9d1bd4e
  payloadContextHash: 0xf4a42c3b50e45e9e74bb3afc7c6f6691f97f41018752da0a3115e6b02110dc5f
  service price: 10000 atomic USDC
  1Shot fee: 10626 atomic USDC
  total wallet debit: 20626 atomic USDC
  remaining after: 0.98 USDC

call #3:
  txHash: 0xa065cfa4d2e09048ae4015e2f4a779c26de05cccae4a14af65c8356d174f65d3
  payloadContextHash: 0xe3f22f2014585830d985097d945f4a4416f732aed2999f7764fdac63554a2d8a
  service price: 10000 atomic USDC
  1Shot fee: 10626 atomic USDC
  total wallet debit: 20626 atomic USDC
  remaining after: 0.97 USDC
```

Read-only Base Sepolia receipt check:

```text
call #1: status=0x1, block=0x2852bdd, to=0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3
call #2: status=0x1, block=0x2852c22, to=0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3
call #3: status=0x1, block=0x2852c44, to=0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3
```

Over-budget proof:

```text
POST /api/agent/precheck
body: {"amountAtomic":"1010000","recordBlockedOnly":true}

latest ledger row: blocked
reason: 支付金额超过单次价格上限
txHash: null
payloadContextHash: null
budgetConsumed: 0.00 USDC
totalWalletDebit: 无钱包扣款
```

Validation result:

```text
P5 PASS
```

## P6 x402 Seller Transparency

Implemented in this pass:

- Payment rail now includes a `Seller Boundary` evidence block.
- The seller is named as `Agent SpendGuard paid risk-brief API`.
- The actual seller route is visible as:

  ```text
  POST /api/x402/deepseek/risk-brief/erc7710-paid-poc
  ```

- The x402 resource path remains visible separately:

  ```text
  /x402/deepseek/risk-brief/erc7710-paid-poc
  ```

- The UI states that the seller endpoint signs the x402 boundary: it issues the
  402 challenge, verifies the ERC-7710 payload, and releases the business
  response after settlement.
- The AI result panel now states that DeepSeek is the downstream provider after
  settlement, not the x402 seller.
- The judge report now includes an `x402 Seller boundary` section explaining
  that the project does not claim DeepSeek-native x402 support and does not
  treat a local mock as paid settlement.

Validation completed:

```text
/Users/puzhiqiu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ./node_modules/typescript/bin/tsc --noEmit: passed
git diff --check: passed
Browser smoke at http://127.0.0.1:3012/: passed
```

## Completed So Far

### Product and Planning

- Defined the core demo loop:
  1. Connect wallet.
  2. Approve a bounded agent budget policy.
  3. Run paid DeepSeek risk-brief action #1.
  4. Run paid DeepSeek risk-brief action #2 from the same stored grant.
  5. Show x402 payment state and 1Shot relay timeline.
  6. Update spend ledger.
  7. Block an oversized request before paid-header submission.
  8. Revoke permission.
- Confirmed MVP boundary:
  - One user.
  - One agent.
  - One service: DeepSeek risk brief.
  - One token: Base Sepolia USDC.
  - One budget: 1.00 USDC / 24 hours.
  - Current ERC-7710 paid PoC price: 0.01 USDC per call.
  - Older EOA x402 notes below may still mention the historical 0.75 USDC
    flow; those are no longer the Dashboard default path.

### Static Prototype

Static prototype exists in:

```text
prototype/index.html
prototype/styles.css
prototype/app.js
```

It shows the full mocked product story and does not require a dev server.

### Real App Skeleton

Next.js + TypeScript app skeleton has been created.

Key files:

```text
package.json
tsconfig.json
next.config.mjs
src/app/layout.tsx
src/app/page.tsx
src/app/globals.css
```

### React Dashboard

The static prototype has been migrated into a real React dashboard.

Key files:

```text
src/components/Dashboard.tsx
src/components/WalletPanel.tsx
src/components/PolicyCard.tsx
src/components/PermissionPreview.tsx
src/components/AgentControls.tsx
src/components/PaymentRail.tsx
src/components/RelayerTimeline.tsx
src/components/VeniceResult.tsx
src/components/SpendLedger.tsx
src/components/SafetyPanel.tsx
src/components/StateContract.tsx
```

### Server State and Types

Shared types and in-memory demo stores exist.

Key files:

```text
src/shared/types.ts
src/server/config/spendguard.ts
src/server/permissions/store.ts
src/server/ledger/store.ts
```

Important safety fix:

- Default permission state is `not_requested`.
- The app no longer starts with an active permission.
- Direct `/api/agent/run` calls before approval are blocked.

### Agent Runner and Policy Guard

The server-side runner and policy guard are implemented.

Key files:

```text
src/server/agent-runner/errors.ts
src/server/agent-runner/policyGuard.ts
src/server/agent-runner/runAgentWithPermission.ts
```

Guard rules include:

- Action must be `ai-risk-brief`.
- Permission must exist and match policy.
- Permission must be `active` or `fallback_local`.
- Revoked or expired permission is blocked.
- Chain, token, service, endpoint, method, and payTo must match config.
- Payment amount must be greater than zero.
- Payment amount must not exceed per-call max.
- Total spend must not exceed 1.00 USDC.
- Blocked paths append ledger entries and do not call payment adapters.

### Mock Adapters

Mock adapters exist for local demo stability.

Key files:

```text
src/server/adapters/mockX402Adapter.ts
src/server/adapters/mockPaymentAdapter.ts
src/server/adapters/mockOneShotAdapter.ts
src/server/adapters/mockVeniceAdapter.ts
src/server/adapters/mockAdapters.ts
```

Current mock behavior:

- x402 requirement: 0.75 USDC.
- Payment receipt: paid.
- 1Shot timeline: quote, task, confirmed, mock tx hash.
- AI result: structured risk brief.

### API Routes

Dashboard buttons now call real Next API routes.

Key routes:

```text
POST /api/demo/reset
POST /api/wallet/connect
POST /api/permissions/request
POST /api/agent/run
POST /api/permissions/revoke
GET  /api/ledger
```

The backend store and runner are now the source of truth for spend, remaining budget, ledger, and block state.

## Verified Commands

These commands passed:

```bash
npm install
npm run typecheck
npm run build
```

Local dev server was verified at:

```text
http://127.0.0.1:3000
```

API smoke test passed:

- Reset: `draft` / `not_requested`.
- Connect: `ready_to_sign` / `requested`.
- Approve: `active` / `approved`.
- First run: `paid`, ledger `success`, spent 0.75 USDC, remaining 0.25 USDC.
- Second run: `BUDGET_EXCEEDED`, ledger `blocked`, no additional spend.
- Revoke: policy and permission become `revoked`.

Negative test passed:

- Direct run without approval is blocked with `PERMISSION_STATUS_NOT_ALLOWED`.

Note: after the Dashboard Integration phase, `POST /api/wallet/connect` requires
a valid Base Sepolia wallet payload from the browser MetaMask helper instead of
the earlier no-body mock connect call.

Latest ERC-7710 dry-run verification on 2026-05-31:

- `npm run typecheck` passed.
- `npm run build` passed.
- Unpaid `POST /api/x402/deepseek/risk-brief/dry-run` returned `402`.
- The response included a `PAYMENT-REQUIRED` header.
- The selected x402 requirement included
  `extra.assetTransferMethod = "erc7710"`.
- The dry-run body reported `callsSettlement=false`,
  `recordsLedgerSpend=false`, and `runsPaidHandler=false`.
- A request with `PAYMENT-SIGNATURE` returned `400` with
  `DRY_RUN_PAYMENT_REJECTED`.
- Code audit found no dry-run calls to `encodePaymentSignatureHeader`,
  `processPaymentResult`, `eth_sendTransaction`, or the paid
  `/api/x402/deepseek/risk-brief` endpoint.

Latest ERC-7710 paid PoC verification on 2026-05-31:

- Local config has `ERC7710_PAID_POC_ENABLED=true`,
  `ERC7710_PAID_POC_PRICE_ATOMIC=10000`,
  `X402_FACILITATOR_URL=https://tx-sentinel-base-sepolia.api.cx.metamask.io/platform/v2/x402`,
  and `X402_PROXY_URL=http://127.0.0.1:7890`.
- MetaMask facilitator `/supported` was reachable through the local proxy and
  returned `200`, including `eip155:84532` with `erc7710`.
- Unpaid
  `POST /api/x402/deepseek/risk-brief/erc7710-paid-poc` returned `402` with
  amount `10000` and `extra.assetTransferMethod = "erc7710"`.
- Stored grant remains active with
  `grant.from = 0xE56937908B36022578ab8D66B0002f246722EE8e`,
  `grant.to/sessionAccount = 0x5Dc9c6785b84c88732312772776535c56C66996a`,
  and `dependencies = []`.
- Base Sepolia `eth_getCode(grant.from)` returned EIP-7702-style code starting
  with `0xef0100`; `eth_getCode(sessionAccount)` returned `0x`.
- A real `Pay 0.01 USDC 7710` browser attempt failed at settlement with
  `Facilitator settle failed (504)` and an HTML body from the facilitator edge.
- `/api/ledger` remained empty, `spent` remained `0`, and no `txHash` was
  recorded.
- Recent Base Sepolia USDC `Transfer` logs showed no `10000` atomic transfer
  from `0xE56937908B36022578ab8D66B0002f246722EE8e` to
  `0xe61109ccCbf5a9b15F805e58e9A0ec286a46d0Be`.
- Follow-up fix: the paid ERC-7710 PoC requirement now includes MetaMask Base
  Sepolia facilitator signer addresses as `extra.facilitatorAddresses`, and the
  client refuses to submit a paid request unless the generated permission
  context contains the RedeemerEnforcer and those facilitator/redeemer
  addresses.
- `npm run typecheck` passed after the facilitator-address fix.
- No-spend regression checks passed after the fix: dry-run still returns `402`,
  dry-run with payment headers returns `400 DRY_RUN_PAYMENT_REJECTED`, the
  existing EOA paid route still returns unpaid `402`, and `/api/ledger` remains
  empty.
- A subsequent browser click showed the pre-submit guard still reporting the
  three facilitator addresses as missing. This was a local false positive: the
  RedeemerEnforcer terms encode addresses as contiguous 20-byte chunks, not
  32-byte padded words in raw permission-context hex.
- Follow-up fix: the client guard and paid-PoC server diagnostics now decode
  the ERC-7710 permission context into delegations/caveats and inspect
  RedeemerEnforcer terms directly before deciding whether facilitator redeemers
  are present.
- `npm run typecheck` passed after the decoded-caveat guard fix.
- Safe no-spend checks passed after the decoded-caveat guard fix: paid PoC
  unpaid request returns `402`, amount `10000`,
  `assetTransferMethod = "erc7710"`, and the three facilitator addresses;
  dry-run unpaid request returns `402` with no-spend flags; dry-run with
  `x-payment` returns `400 DRY_RUN_PAYMENT_REJECTED`; the existing EOA paid
  route still returns unpaid `402`; `/api/ledger` remains empty with `spent=0`
  and no tx hash.
- A real retry after the decoded-caveat guard fix passed the local guard and
  reached the paid request submission phase, then failed at facilitator
  settlement with HTTP `504` and an HTML body. The browser console's `402`
  resource log is the expected first x402 challenge request; the actionable
  failure is the later settlement `504`.
- The paid PoC now sanitizes facilitator HTML failures into a short JSON/UI
  message: MetaMask ERC-7710 facilitator settlement returned HTTP `504` before
  producing a tx hash. No SpendGuard ledger entry was recorded.
- `npm run typecheck` passed after this error-display fix. `/api/ledger`
  remained empty with `spent=0` and no tx hash, and dry-run payment-header
  rejection still returned `400 DRY_RUN_PAYMENT_REJECTED`.
- Follow-up mitigation: paid ERC-7710 child delegations now add
  `LimitedCallsEnforcer(limit=1)` so a timeout/retry cannot repeatedly redeem
  the same generated child delegation.
- Follow-up diagnostic: the paid flow now runs a no-spend local settlement
  preflight before submitting to the facilitator. The preflight `eth_call`
  simulates `DelegationManager.redeemDelegations(...)` from the advertised
  facilitator signer addresses against the generated permission context and
  intended USDC transfer. If all simulations revert, the paid request is not
  submitted.
- After preflight passes, the Dashboard asks for a second confirmation before
  submitting the real paid settlement request. Canceling the second prompt leaves
  the run at a no-spend diagnostic boundary.
- `npm run typecheck` passed after the limited-calls/preflight changes. Safe
  checks passed: paid PoC unpaid `402` still returns amount `10000` with
  `assetTransferMethod = "erc7710"` and three facilitator addresses; dry-run
  payment-header rejection still returns `400 DRY_RUN_PAYMENT_REJECTED`;
  `/api/ledger` remains empty with `spent=0` and no tx hash.
- User-tested preflight on 2026-05-31: the Dashboard reached the second
  confirmation prompt, reporting that local ERC-7710 settlement preflight passed
  with 3 facilitator signers. The user canceled the second prompt, so no paid
  request was submitted. `/api/ledger` remained empty with `spent=0` and no tx
  hash. Current UI behavior marks that canceled diagnostic run as
  `payment=failed` and `agentAction=failed`, even though no spend is submitted.
- User-tested 1Shot relay on 2026-05-31: after targeting the child delegation to
  the 1Shot target wallet and normalizing 1Shot hex fields, estimate progressed
  to calldata validation and rejected the bundle because no payment to the
  relayer fee collector was present. The 1Shot settlement request now adds a
  second ERC-20 transfer execution to the relayer `feeCollector`, seeded from
  `relayer_getFeeData.minFee` and replaced with
  `relayer_estimate7710Transaction.requiredPaymentAmount` before send.

## Current Local Runtime Status

The app currently supports real MetaMask EOA connection on Base Sepolia, a real
MetaMask Advanced Permission request path, a real x402 seller route, and a real
DeepSeek-backed paid result path.

The active Dashboard paid path is now the ERC-7710 x402 path backed by the
stored MetaMask Advanced Permission grant. A real Base Sepolia run has confirmed
through the current 1Shot-supported settlement path:

```text
0xf669edc46cd69491719937a6b8f416a88fc0a0d0f70f99f216c05c8b82bc2577
```

The old EOA typed-data `TransferWithAuthorization` path remains in the repo as
legacy/reference code, but it is no longer the product path to optimize.

It still does not use:

- Production-grade wallet revoke or persistent storage.
- Final submission-grade screenshots/video/scripts.

## Resume Protocol After Context Compression

When continuing after a compressed or interrupted session, read this section
before changing code.

Requirement precedence:

- The latest explicit user request wins for the current task.
- This document records the current project baseline, not a permanent override
  of future instructions.
- If a new task conflicts with this baseline, pause and confirm the conflict
  before making code changes.
- After completing a task that changes the baseline, update this document so the
  next session starts from the new state.

Current baseline boundary:

- ERC-7710 has a no-spend dry-run path and a separate feature-flagged paid PoC.
  The paid PoC may spend `0.01 USDC` plus relay fee on Base Sepolia and must
  only be retried after explicit user confirmation.
- The current optimization target is Best x402 + ERC-7710. Treat 1Shot as
  supporting settlement infrastructure, not the primary prize track.
- Do not call `wallet_requestExecutionPermissions` unless the user explicitly
  asks to change the permission approval flow.
- Do not call `eth_sendTransaction`.
- Do not submit `PAYMENT-SIGNATURE`, `X-PAYMENT`, or `payment` headers to the
  dry-run route.
- Do not call x402 settlement from the dry-run route.
- Do not modify the existing EOA paid x402 flow unless the user asks for that
  explicitly.

First files to inspect after resuming:

```text
docs/CURRENT_PROGRESS.md
docs/ERC7710_DRY_RUN_POC.md
src/client/x402/dryRunErc7710Payment.ts
src/server/x402/erc7710DryRunResourceServer.ts
src/app/api/x402/deepseek/risk-brief/dry-run/route.ts
src/components/Dashboard.tsx
src/components/AgentControls.tsx
```

Expected verification commands:

```bash
npm run typecheck
npm run build
```

If the user asks to continue the next real paid PoC, confirm the spend boundary
first. That phase is no longer no-spend and may consume about `0.01 USDC` on
Base Sepolia.

The Dashboard Connect button now uses the browser-side MetaMask helper for real
EOA connection and Base Sepolia network enforcement.

Compatibility fallback is now in place for connect failures: missing MetaMask or
non-MetaMask providers move the UI to `unsupported`, rejected connection moves
the UI to `disconnected`, and rejected Base Sepolia switch/add keeps the UI
unsupported. These paths reset the dashboard display to a no-approval state and
do not bypass the real Connect requirement.

## Env / Config Phase Completed

Completed on 2026-05-30.

Scope completed:

- Server config now reads the Base Sepolia target chain and adapter mode variables from environment:
  - `TARGET_CHAIN_ID`
  - `TARGET_CHAIN_NAME`
  - `BASE_SEPOLIA_RPC_URL`
  - `BASE_SEPOLIA_WS_URL`
  - `USDC_ADDRESS`
  - `X402_PAY_TO`
  - `ONESHOT_MODE`
  - `VENICE_MODE`
- Added reusable public Base Sepolia wallet-chain metadata for the next browser MetaMask phase.
- Kept real Infura project IDs and other local secrets out of docs and source.
- Did not change `.env.local`; existing required keys are present locally.
- Did not implement MetaMask connect.
- Did not change dashboard UI.

Files changed:

```text
src/shared/chain.ts
src/shared/types.ts
src/server/config/spendguard.ts
docs/CURRENT_PROGRESS.md
```

Validation:

```bash
npm run typecheck
npm run build
```

Both commands passed.

Config handoff for Wallet Client Agent:

- Use `baseSepoliaWalletChain` from `src/shared/chain.ts` for public browser wallet metadata:
  - decimal chain id: `84532`
  - hex chain id: `0x14a34`
  - chain key: `base-sepolia`
  - display name: `Base Sepolia`
  - public fallback RPC: `https://sepolia.base.org`
  - explorer: `https://sepolia.basescan.org`
- Server-only runtime config remains in `src/server/config/spendguard.ts`.
- Do not expose `BASE_SEPOLIA_RPC_URL` or `BASE_SEPOLIA_WS_URL` to browser code unless they are intentionally converted to `NEXT_PUBLIC_*`.
- Keep x402, Venice, 1Shot, and permission behavior mocked in the wallet-connect phase.

## Wallet Client Phase Completed

Completed on 2026-05-30.

Scope completed:

- Added browser-side MetaMask provider detection with support for
  `window.ethereum.providers` multi-wallet injection.
- Added real `eth_requestAccounts` connection flow.
- Added current wallet state read using `eth_accounts` and `eth_chainId`; this
  path does not trigger a MetaMask popup.
- Added Base Sepolia enforcement:
  - `wallet_switchEthereumChain`
  - fallback to `wallet_addEthereumChain` when MetaMask returns `4902`
- Used only `baseSepoliaWalletChain` public wallet metadata for browser chain
  params, including the public fallback RPC URL.
- Kept Dashboard UI, API routes, permission, x402, Venice, and 1Shot flows
  unchanged.
- Did not install new dependencies.
- Did not use the real MetaMask GUI during this phase.

New browser helper:

```text
src/client/wallet/metamask.ts
```

Exported helper API:

```text
detectMetaMaskProvider()
connectMetaMask()
getCurrentWalletState()
ensureBaseSepolia()
connectBaseSepoliaWallet()
```

Wallet error codes:

```text
WALLET_NOT_FOUND
WALLET_NOT_METAMASK
USER_REJECTED
CHAIN_SWITCH_REJECTED
CHAIN_ADD_REJECTED
UNKNOWN_WALLET_ERROR
```

Files changed:

```text
src/client/wallet/metamask.ts
docs/CURRENT_PROGRESS.md
```

Validation:

```bash
npm run typecheck
npm run build
```

Both commands passed.

Handoff for Dashboard Integration Agent:

- Import `connectBaseSepoliaWallet` and `WalletConnectionError` from
  `src/client/wallet/metamask.ts` in client-side dashboard code.
- Call `connectBaseSepoliaWallet()` from the Connect button flow before calling
  or replacing the existing mock `/api/wallet/connect` behavior.
- Use the returned `eoa`, `chain`, `chainId`, `chainKey`, and `chainName` to show
  the real EOA and Base Sepolia network in dashboard state.
- Keep approval, agent run, x402, Venice, 1Shot, ledger, and revoke behavior on
  the existing mocked API routes for the next integration phase.

## Dashboard Integration Phase Completed

Completed on 2026-05-30.

Scope completed:

- Wired the Dashboard Connect button to `connectBaseSepoliaWallet()`.
- Browser connect now opens MetaMask, requests account access, and ensures Base
  Sepolia through the existing helper.
- After successful browser wallet connection, Dashboard still calls
  `POST /api/wallet/connect`, preserving the current mocked permission flow.
- `POST /api/wallet/connect` now reads wallet info from the request body,
  validates a Base Sepolia EOA payload, stores the real EOA in the permission
  record, sets `smartAccount` to `null`, and keeps status `requested`.
- Dashboard narrative now confirms the real connected EOA with a shortened
  address.
- Approval, agent run, over-budget block, x402, Venice, 1Shot, ledger, and
  revoke remain mocked through the existing API routes.
- Did not install dependencies.
- Did not implement Smart Account permission.
- Did not connect real x402, Venice, or 1Shot.
- Did not use the MetaMask GUI manually during this phase.

Files changed:

```text
src/components/Dashboard.tsx
src/app/api/wallet/connect/route.ts
docs/CURRENT_PROGRESS.md
```

Validation:

```bash
npm run typecheck
npm run build
```

Both commands passed.

## Compatibility / Fallback Phase Completed

Completed on 2026-05-30.

Scope completed:

- Added Dashboard-level mapping from `WalletConnectionError` codes to clear
  human-readable MetaMask connect messages.
- Missing MetaMask and non-MetaMask providers now show wallet `unsupported`.
- User-rejected account connection now returns the UI to `disconnected`.
- Rejected Base Sepolia switch/add now leaves the UI `unsupported`.
- Failed connect attempts reset the dashboard display to `draft` /
  `not_requested` with no payment, relayer, ledger, or approval state.
- Added lightweight fallback copy pointing to `prototype/index.html` and backend
  mock API validation, without unlocking approval or agent run.
- Wallet panel now presents the real MetaMask EOA and network more clearly,
  showing Base Sepolia after a successful connect.
- Kept Smart Account permission, x402, Venice, and 1Shot mocked.
- Did not install dependencies.
- Did not use the MetaMask GUI manually during this phase.

Files changed:

```text
src/components/Dashboard.tsx
src/components/AgentControls.tsx
src/components/WalletPanel.tsx
docs/CURRENT_PROGRESS.md
```

New config variables:

```text
None
```

Validation:

```bash
npm run typecheck
npm run build
```

Both commands passed.

## QA / Verification Phase Completed

Completed on 2026-05-30.

P0 result:

- Achieved for automated review scope.
- Real browser-side MetaMask EOA connection and Base Sepolia enforcement are
  wired into the Dashboard Connect flow.
- `POST /api/wallet/connect` requires a valid EOA and Base Sepolia chain id
  payload before moving the demo to permission-requested state.
- Approval, agent run, over-budget block, x402, Venice, 1Shot, ledger, and
  revoke remain on mocked API/server adapters.

Files reviewed:

```text
src/client/wallet/metamask.ts
src/shared/chain.ts
src/components/Dashboard.tsx
src/components/WalletPanel.tsx
src/components/AgentControls.tsx
src/app/api/wallet/connect/route.ts
src/server/config/spendguard.ts
docs/CURRENT_PROGRESS.md
docs/LOCAL_ENVIRONMENT.md
```

Validation run:

```bash
npm run typecheck
npm run build
curl --silent --show-error --max-time 3 --head http://127.0.0.1:3000/
curl --silent --show-error --max-time 3 http://127.0.0.1:3000/ | rg -o "Agent SpendGuard|Scoped onchain budget|MetaMask EOA"
```

Results:

- `npm run typecheck` passed.
- `npm run build` passed.
- Existing dev server at `http://127.0.0.1:3000/` returned `200 OK`.
- Homepage body contained the expected app markers: `Agent SpendGuard`,
  `Scoped onchain budget`, and `MetaMask EOA`.

Not automatically verified:

- Real MetaMask popup behavior.
- User approval/rejection of account connection.
- User approval/rejection of Base Sepolia switch or add-network request.

Manual verification steps:

1. Open the app in a browser with MetaMask installed.
2. Click `Connect`.
3. Approve the MetaMask account connection.
4. Approve or switch/add the Base Sepolia network when prompted.
5. Confirm the dashboard shows the connected EOA on Base Sepolia.
6. Click `Approve Permission`.
7. Click `Run Agent`.
8. Click `Try Over Budget` and confirm the second spend is blocked.
9. Click `Revoke` and confirm the policy/permission are revoked.

Risk review:

- No P0 bugs found in automated review.
- Resolved after QA: `ensureBaseSepolia()` now re-reads `eth_chainId` after
  switch/add flows and fails closed if MetaMask is not actually on Base Sepolia.
- Resolved after QA: Dashboard now subscribes to MetaMask `accountsChanged`,
  `chainChanged`, and `disconnect`, resets local/server demo state on wallet
  changes, and ignores stale async action responses from the previous wallet
  epoch.
- P3: `TARGET_CHAIN_NAME` is used as the server chain key env var. This is
  documented locally, but the name can be confused with a display name.

Post-QA fixes changed:

```text
src/client/wallet/metamask.ts
src/components/Dashboard.tsx
docs/CURRENT_PROGRESS.md
```

Post-QA validation:

```bash
npm run typecheck
npm run build
```

Both commands passed after the wallet freshness fixes.

Temporary dev-server smoke also passed on `http://127.0.0.1:3110`:

- Reset.
- Connect with valid Base Sepolia EOA payload.
- Approve permission.
- First agent run succeeds with paid mock receipt and Venice risk brief.
- Second run blocks with `BUDGET_EXCEEDED` before payment requirement/receipt.
- Revoke permission.
- Ledger includes success, block, and revoke entries.
- Final reset clears ledger.
- Dashboard route returns `200` and includes expected app copy.

## Base Sepolia Configuration Chosen

Target chain:

```text
Base Sepolia
chainId: 84532
network key: base-sepolia
explorer: https://sepolia.basescan.org
```

Base Sepolia USDC:

```text
USDC_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e
decimals=6
```

Demo x402 pay-to address:

```text
X402_PAY_TO=0xe61109ccCbf5a9b15F805e58e9A0ec286a46d0Be
```

RPC:

```text
BASE_SEPOLIA_RPC_URL=https://base-sepolia.infura.io/v3/YOUR_INFURA_PROJECT_ID
BASE_SEPOLIA_WS_URL=wss://base-sepolia.infura.io/ws/v3/YOUR_INFURA_PROJECT_ID
```

Do not commit real RPC project IDs, API keys, or private keys.

## DeepSeek Provider Phase Completed

Completed on 2026-05-30.

Scope completed:

- Replaced the user-facing AI provider from Venice AI to DeepSeek for the local
  demo.
- Added provider config:
  - `AI_PROVIDER=deepseek`
  - `AI_MODE=real`
  - `DEEPSEEK_MODE=real`
  - `DEEPSEEK_API_BASE=https://api.deepseek.com`
  - `DEEPSEEK_MODEL=deepseek-v4-pro`
- Added a real DeepSeek adapter that calls the chat completions endpoint after
  the local x402/payment mock succeeds.
- Kept x402 payment, 1Shot relay, Smart Account permission, and revoke mocked.
- Kept the legacy internal `veniceRiskBrief`/`VeniceResult` state names for
  compatibility, while the displayed provider and policy now read `DeepSeek`.
- Stored the local API key only in `.env.local`; docs and examples contain no
  secret value.

Files changed:

```text
.env.example
README.md
docs/CURRENT_PROGRESS.md
docs/LOCAL_ENVIRONMENT.md
src/app/api/agent/run/route.ts
src/components/AgentControls.tsx
src/components/Dashboard.tsx
src/components/PermissionPreview.tsx
src/components/PolicyCard.tsx
src/components/VeniceResult.tsx
src/server/adapters/aiAdapter.ts
src/server/adapters/deepseekAdapter.ts
src/server/adapters/mockAdapters.ts
src/server/adapters/mockDemo.ts
src/server/adapters/mockVeniceAdapter.ts
src/server/adapters/mockX402Adapter.ts
src/server/agent-runner/errors.ts
src/server/agent-runner/policyGuard.ts
src/server/agent-runner/runAgentWithPermission.ts
src/server/config/spendguard.ts
src/shared/types.ts
```

Validation:

```bash
npm run typecheck
npm run build
```

Both commands passed.

Real DeepSeek smoke passed on a temporary local dev server:

- Reset.
- Connect with a valid Base Sepolia EOA payload.
- Approve permission.
- Run agent.
- Mock payment receipt returned `paid`.
- Real DeepSeek returned a `deepseek-v4-pro` wallet risk brief.

## Current External-Service Constraints

DeepSeek:

- Real DeepSeek API calls are enabled locally through `.env.local`.
- Current model: `deepseek-v4-pro`.
- The local key must not be committed, printed, or copied into docs.

Venice:

- Venice is now a legacy swappable provider path.
- Keep `VENICE_MODE=mock` unless intentionally switching the AI provider back.

1Shot:

- Free tier appears limited to 100 reads / 100 writes.
- API key creation may currently be blocked.
- Keep `ONESHOT_MODE=mock` until a real key is available.
- If real key becomes available, use it only for final quote/submit smoke tests.

## Next Phase

Next recommended phase:

```text
Manual browser verification, then Smart Account permission integration
```

Scope:

- Keep x402, Venice, permission, and 1Shot mocked.
- Manually verify real MetaMask connect and Base Sepolia switch/add prompts.
- Manually verify fallback UI states for missing/rejected/unsupported wallet paths.
- Manually verify the existing mock approval/run/block/revoke demo after connect.
- After manual signoff, start the next implementation phase for real Smart
  Account permission.

## Next Phase Agent Plan

Run agents sequentially, not in parallel:

1. Env / Config Agent
   - Create local `.env.local`.
   - Update env examples and config reads.
   - Keep secrets out of docs and source.

2. Wallet Client Agent
   - Add browser-side MetaMask helpers.
   - Implement detect/connect/switch/add Base Sepolia.
   - Completed on 2026-05-30.

3. Dashboard Integration Agent
   - Wire Connect button to real MetaMask helper.
   - Keep approval/run/revoke mocked through existing API.
   - Completed on 2026-05-30.

4. Compatibility / Fallback Agent
   - Add user-readable errors for missing MetaMask, rejected connect, wrong chain, and switch failure.
   - Completed on 2026-05-30.

5. QA / Verification Agent
   - Run typecheck/build/dev.
   - Verify real MetaMask connect and the existing mock spend loop.
   - Completed on 2026-05-30 for automated scope; MetaMask popup and user
     chain-switch authorization remain manual verification items.

## Real x402 Integration Pass

Latest status supersedes older phase notes that still say x402 is mocked.

Completed and verified on 2026-05-30:

- Added a real x402 resource-server wrapper using `@x402/core` and
  `@x402/evm`, without `@x402/next`.
- Added a real seller-side protected endpoint:
  `POST /api/x402/deepseek/risk-brief`.
- Added `POST /api/agent/precheck` so the dashboard checks the local budget
  before asking the browser wallet to sign an x402 payment.
- Added the browser-side x402 payment helper:
  `src/client/x402/payDeepseekRiskBrief.ts`.
- Updated the dashboard run path to precheck, request a MetaMask x402
  typed-data signature, call the protected DeepSeek endpoint, and refresh the
  demo ledger after settlement.
- Updated the dashboard failure state so rejected/failed x402 payment attempts
  do not leave the UI stuck in running/paying.
- Added a MetaMask typed-data compatibility fix so x402 EIP-712 payloads include
  an explicit `EIP712Domain` type before calling `eth_signTypedData_v4`.

Build/type verification:

```bash
npm run build
npm run typecheck
```

Both pass when run cleanly. A parallel `typecheck` plus `build` run can race
because `next build` regenerates `.next/types`; this produced missing generated
type-file errors, not app type errors. Running `typecheck` again after `build`
passed.

Local API smoke against `http://127.0.0.1:3000` passed:

- `POST /api/demo/reset` returned `200`.
- `POST /api/wallet/connect` with a Base Sepolia EOA payload returned `200`.
- `POST /api/permissions/request` returned `200`.
- `POST /api/agent/precheck` returned `200`.
- Unpaid `POST /api/x402/deepseek/risk-brief` returned `402`.
- The `PAYMENT-REQUIRED` header was present.
- The x402 requirement decoded to:
  - scheme: `exact`
  - network: `eip155:84532`
  - asset: Base Sepolia USDC
    `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
  - amount: `750000` atomic USDC
  - payTo: `0xe61109ccCbf5a9b15F805e58e9A0ec286a46d0Be`

Browser paid-flow verification:

- A real MetaMask typed-data signing prompt appeared for x402
  `TransferWithAuthorization`.
- The prompt was on Base Sepolia and interacted with Base Sepolia USDC
  `0x036CbD53842c5426634e7929541eC2318f3dCF7e`.
- The signed amount was `750000` atomic USDC (`0.75 USDC`).
- The signed paid request reached `POST /api/x402/deepseek/risk-brief`.
- The paid x402 request returned `200`.
- Because this route only returns `200` after `processSettlement` succeeds, this
  verifies the x402 verify/settle path for the successful run.
- The demo ledger recorded one successful `0.75 USDC` spend.
- DeepSeek returned a paid wallet risk brief.
- A second run was blocked by the local budget guard.
- Observed backend sequence for the successful run:

```text
POST /api/agent/precheck 200
POST /api/x402/deepseek/risk-brief 402
MetaMask TransferWithAuthorization signature
POST /api/x402/deepseek/risk-brief 200
GET /api/ledger 200
```

Successful ledger state observed:

```json
{
  "payment": "paid",
  "ledger": "has_success",
  "spent": 0.75,
  "result": "Wallet Risk Brief for 0xe569...ee8e"
}
```

## Current Success / Not Success Summary

Already successful:

- Real MetaMask EOA connect on Base Sepolia.
- Real Base Sepolia chain enforcement in the browser helper.
- Real MetaMask Advanced Permission request code path and server-side grant
  validation.
- Real x402 `402 Payment Required` challenge.
- Real x402 payment requirement for `0.75 USDC`.
- Real MetaMask typed-data signing prompt for x402
  `TransferWithAuthorization`.
- Real signed x402 paid request returning `200`.
- Real settlement path for the successful paid request.
- Real DeepSeek response after successful x402 payment.
- Demo ledger update showing `0.75 USDC` spent and `0.25 USDC` remaining.
- Second paid action blocked by the local budget guard.
- ERC-7710 x402 dry-run route and client preview:
  - dry-run route returns `402` with `extra.assetTransferMethod = "erc7710"`;
  - dry-run route rejects payment headers with `400`;
  - client builds an ERC-7710 payload preview from the stored grant;
  - preview does not submit payment or expose raw permission context.

Not successful / not implemented yet:

- x402 payment execution is still the EOA `eth_signTypedData_v4`
  `TransferWithAuthorization` path, not ERC-7710 delegation redemption.
- The live MetaMask Advanced Permission popup and sync-revoke behavior still
  need one manual browser verification pass after the dry-run changes.
- Revoke is not a dapp-side wallet revoke API call. The implemented flow is:
  user revokes in MetaMask / Dapp connections, then the app syncs with
  `wallet_getGrantedExecutionPermissions` and closes local policy only after
  the grant is missing or expired.
- 1Shot is still not part of the payment execution path.
- Ledger/spend state now has local JSON persistence for demo durability, but is
  not production storage.
- Budget enforcement before payment is local app logic, not an onchain spending
  guard.
- DeepSeek empty-content fallback is implemented for the real adapter, but
  HTTP/API failures still fail closed instead of being treated as paid success.
- The Run Agent UX now has clearer precheck, x402 challenge, MetaMask signing,
  paid request, and settlement stages, but the real MetaMask popup path still
  needs manual wallet verification after code changes.

Real now:

- MetaMask EOA connect and Base Sepolia enforcement.
- Real DeepSeek adapter in local real mode.
- Real x402 seller-side protected endpoint, unpaid 402 challenge, MetaMask
  typed-data payment signing, paid request, settlement response, and ledger
  update.
- Real ERC-7710 x402 payload construction in dry-run mode only.

Still demo state:

- The local app still stores and enforces the permission record after MetaMask
  returns a grant; the x402 payment itself does not yet redeem the delegation.
- The ERC-7710 route/client are dry-run only and intentionally no-spend.
- Revoke depends on the user revoking in MetaMask first, then app-side sync.
- Ledger/spend storage is local JSON demo state, not production-grade storage.
- 1Shot remains mocked/not used.
- Budget enforcement before payment is local app logic.

Next recommended phase:

- Manually verify the live MetaMask Advanced Permission popup and sync-revoke
  behavior in the browser.
- If approved, build a separate real ERC-7710 paid PoC at about `0.01 USDC` on
  Base Sepolia. Until then, keep paid x402 on the current EOA typed-data path.

## x402 Stability / Demo Durability Pass

Completed on 2026-05-30.

Scope completed:

- Added local JSON persistence for the demo ledger.
- Added local JSON persistence for the permission record so persisted ledger
  spend and the local budget guard stay consistent after a server restart.
- Added `.spendguard/` to `.gitignore`; local persisted demo state is not meant
  to be committed.
- Added a server-side budget precheck inside the paid x402 DeepSeek endpoint,
  so a direct paid endpoint call cannot bypass the local budget guard.
- Added DeepSeek empty-content retry/fallback behavior:
  - HTTP/API errors still fail closed.
  - HTTP `200` with empty message content retries once.
  - If the second successful response is still empty, the adapter returns a
    local fallback risk brief so the paid flow can finish gracefully.
- Added Dashboard busy-state locking for Connect, Approve, Run, Over Budget,
  Revoke, and Reset.
- Added Run Agent stage copy for:
  - local precheck
  - x402 challenge request
  - MetaMask typed-data signature
  - signed paid request submission
  - settlement and ledger refresh
- Added a `failed` payment rail state so rejected signing, failed settlement, or
  refresh errors leave pending UI cleanly.
- Stopped a stale `next dev` server after `next build`, cleared `.next`, and
  restarted a clean dev server to avoid dev/build static asset mismatch.

Files changed:

```text
.gitignore
docs/CURRENT_PROGRESS.md
src/app/api/x402/deepseek/risk-brief/route.ts
src/client/x402/payDeepseekRiskBrief.ts
src/components/AgentControls.tsx
src/components/Dashboard.tsx
src/components/PaymentRail.tsx
src/server/adapters/deepseekAdapter.ts
src/server/ledger/store.ts
src/server/permissions/store.ts
src/server/storage/jsonFile.ts
```

New local runtime data:

```text
.spendguard/ledger.json
.spendguard/permission.json
```

These files are local demo state and are ignored by git.

Validation:

```bash
npm run typecheck
npm run build
```

Both commands passed.

HTTP smoke on clean `next dev` at `http://127.0.0.1:3000` passed:

- Homepage returned `200`.
- App shell contained expected `Agent SpendGuard` and `Demo runbook` markers.
- Observed Next dev static assets returned `200`.
- `POST /api/demo/reset` returned `200`.
- `GET /api/ledger` returned `200`.
- `POST /api/agent/precheck` without wallet returned `409`, as expected.
- Unpaid `POST /api/x402/deepseek/risk-brief` returned `402`.
- The `payment-required` header was present.

Not re-verified in this pass:

- Manual MetaMask signing popup.
- Full paid x402 settlement after the new durability/UX changes.

Next recommended phase:

- Manually re-run the paid MetaMask x402 flow once.
- Then start real MetaMask Smart Account / Advanced Permission integration.

## MetaMask Advanced Permission Integration Pass

Completed on 2026-05-30 for code and API-level validation.

Scope completed:

- Installed and retained the official dependencies:
  - `@metamask/smart-accounts-kit`
  - `viem`
- Added browser-side MetaMask Advanced Permission helper:
  `src/client/permissions/metamaskAdvancedPermissions.ts`.
- The Dashboard `Approve Permission` button now:
  1. Ensures MetaMask is connected on Base Sepolia.
  2. Creates or reuses a local demo session account.
  3. Calls `requestExecutionPermissions` through
     `erc7715ProviderActions()`.
  4. Requests `erc20-token-periodic` for Base Sepolia USDC.
  5. Uses a `1.00 USDC / 24h` period cap and `isAdjustmentAllowed=false`.
  6. Posts the returned grant to the server for persistence.
- The persisted permission record now stores the real grant fields needed for
  future delegation/redemption work:
  - `context`
  - `delegationManager`
  - `from`
  - `to`
  - `chainId`
  - `permissionType`
  - `dependencies`
  - `rules`
  - `sessionAccount`
  - `rawGrant`
- `POST /api/permissions/request` no longer performs local mock approval.
  It requires a matching MetaMask Advanced Permission grant before setting the
  policy active.
- `policyGuard` now requires a stored active MetaMask
  `erc20-token-periodic` grant before allowing agent spending, except for the
  legacy `fallback_local` status that is not used by the current Dashboard
  approval path.
- Dashboard permission and wallet panels now show the stored grant type,
  delegation manager, permission account, session account, and expiry.
- Revoke no longer performs a fake local revoke:
  - The app calls `getGrantedExecutionPermissions()` through MetaMask.
  - If MetaMask still reports the grant, the app keeps local policy active.
  - Only if the grant is missing or expired does
    `POST /api/permissions/revoke` mark the local permission closed.

Files changed:

```text
docs/CURRENT_PROGRESS.md
src/app/api/permissions/request/route.ts
src/app/api/permissions/revoke/route.ts
src/app/api/wallet/connect/route.ts
src/app/globals.css
src/client/permissions/metamaskAdvancedPermissions.ts
src/components/AgentControls.tsx
src/components/Dashboard.tsx
src/components/PermissionPreview.tsx
src/components/WalletPanel.tsx
src/server/agent-runner/policyGuard.ts
src/server/agent-runner/runAgentWithPermission.ts
src/server/permissions/store.ts
```

Validation:

```bash
npm run typecheck
npm run build
```

Both commands passed.

API smoke on `http://127.0.0.1:3111` passed:

- `POST /api/demo/reset` returned `200`.
- `POST /api/wallet/connect` with a valid Base Sepolia EOA payload returned
  `200`.
- `POST /api/agent/precheck` before grant returned `409` with
  `PERMISSION_STATUS_NOT_ALLOWED`.
- `POST /api/permissions/request` without a grant returned `422` with
  `ADVANCED_PERMISSION_GRANT_REQUIRED`.
- `POST /api/permissions/request` with a policy-matching simulated grant
  returned `200`.
- `POST /api/agent/precheck` after that grant returned `200`.
- `POST /api/permissions/revoke` without sync status returned `409` with
  `REVOKE_SYNC_REQUIRED`.
- `POST /api/permissions/revoke` with `syncStatus=missing` and the matching
  grant returned `200`.
- Final reset returned `200`.
- Unpaid `POST /api/x402/deepseek/risk-brief` still returned `402
  Payment Required`.

Current local dev server for manual browser testing:

```text
http://127.0.0.1:3111
```

Not yet manually verified in this pass:

- Real MetaMask Advanced Permission popup.
- User approval and rejection of the Advanced Permission request.
- MetaMask-side revoke in Dapp connections followed by app sync.
- Full paid x402 settlement after the Advanced Permission code path was added.

Important boundary:

- x402 is still paid by the current EOA typed-data
  `TransferWithAuthorization` path.
- The app does not yet redeem the MetaMask Advanced Permission through an
  ERC-7710/delegation payment path.
- 1Shot remains unimplemented and is not in the automatic payment path.

## ERC-7710 x402 Dry-Run PoC

Completed on 2026-05-31.

Scope completed:

- Installed `@metamask/x402`.
- Added a dry-run x402 route:
  `POST /api/x402/deepseek/risk-brief/dry-run`.
- Added a dry-run server helper that returns `402 Payment Required` with
  `extra.assetTransferMethod = "erc7710"`.
- Added strict server-side no-spend behavior:
  - rejects `PAYMENT-SIGNATURE`, `X-PAYMENT`, and `payment` headers with `400`;
  - does not verify payment;
  - does not call settlement;
  - does not write ledger spend;
  - does not run the paid DeepSeek handler.
- Added a browser-side ERC-7710 dry-run payload builder that:
  - validates the stored MetaMask Advanced Permission grant;
  - validates `grant.from` as the delegator / payer;
  - validates `grant.to` against the local session account;
  - uses `grant.context` as the parent permission context;
  - checks the generated payload delegation manager and delegator against the
    stored grant;
  - filters requirements by network, USDC asset, `payTo`, and max amount;
  - stops after payload creation and never sends a paid retry.
- Added a development-only Dashboard button, `Dry Run 7710`, and a preview panel
  that shows hashes/metadata only.
- Added documentation:
  `docs/ERC7710_DRY_RUN_POC.md`.

Files changed:

```text
docs/CURRENT_PROGRESS.md
docs/ERC7710_DRY_RUN_POC.md
package.json
package-lock.json
src/app/api/x402/deepseek/risk-brief/dry-run/route.ts
src/app/globals.css
src/client/permissions/metamaskAdvancedPermissions.ts
src/client/x402/dryRunErc7710Payment.ts
src/components/AgentControls.tsx
src/components/Dashboard.tsx
src/server/x402/erc7710DryRunResourceServer.ts
```

Important boundary:

- This is still a dry-run PoC.
- No paid ERC-7710 request is submitted.
- No settlement or chain transaction is attempted.
- Existing EOA x402 payment remains the real paid path.
- The next real ERC-7710 PoC must be explicitly approved and may spend about
  `0.01 USDC` on Base Sepolia.

Validation:

```bash
npm run typecheck
npm run build
```

Both commands passed.

Route smoke on a short-lived local dev server passed:

- Unpaid dry-run request returned `402`.
- `PAYMENT-REQUIRED` header was present.
- Requirement had `extra.assetTransferMethod = "erc7710"`.
- Payment-header attempt returned `400` with `DRY_RUN_PAYMENT_REJECTED`.

## ERC-7710 x402 Paid PoC

Implemented on 2026-05-31.

This phase is intentionally no longer no-spend. It is isolated behind a feature
flag and may spend `0.01 USDC` Base Sepolia testnet USDC when enabled and
clicked from the Dashboard.

New config:

```text
ERC7710_PAID_POC_ENABLED=false
ERC7710_PAID_POC_PRICE_ATOMIC=10000
X402_FACILITATOR_URL=https://tx-sentinel-base-sepolia.api.cx.metamask.io/platform/v2/x402
X402_PROXY_URL=
```

Scope completed:

- Added an independent paid ERC-7710 x402 route:
  `POST /api/x402/deepseek/risk-brief/erc7710-paid-poc`.
- Added a separate server resource helper using
  `x402ExactEvmErc7710ServerScheme`.
- Kept the existing EOA `TransferWithAuthorization` paid route unchanged.
- Kept the ERC-7710 dry-run route no-spend.
- Added exact `10000` atomic USDC requirement filtering.
- Added feature flag handling:
  - flag off hides the Dashboard paid control;
  - flag off makes the API return `404 ERC7710_PAID_POC_DISABLED`.
- Added client paid submitter that uses the stored Advanced Permission grant and
  local session account.
- Added safeguards:
  - no `wallet_requestExecutionPermissions`;
  - no `eth_sendTransaction`;
  - generated payload must match stored grant delegator and delegation manager.
- Added ledger recording after settlement success with payer / payTo / amount /
  txHash.
- Added documentation:
  `docs/ERC7710_PAID_POC.md`.

Files changed:

```text
.env.example
docs/CURRENT_PROGRESS.md
docs/ERC7710_PAID_POC.md
src/app/api/x402/deepseek/risk-brief/erc7710-paid-poc/route.ts
src/app/globals.css
src/app/page.tsx
src/client/x402/payErc7710DeepseekRiskBrief.ts
src/components/AgentControls.tsx
src/components/Dashboard.tsx
src/server/config/spendguard.ts
src/server/x402/erc7710PaidPocResourceServer.ts
```

Important boundary:

- The paid PoC is default-off.
- The paid PoC uses `paymentPayload.payload.delegator` as payer.
- The paid PoC must use MetaMask's Base Sepolia x402 facilitator; the default
  `@x402/core` facilitator does not verify ERC-7710 delegation payloads.
- The main `/api/x402/deepseek/risk-brief` route remains the existing EOA paid
  flow.
- The dry-run route still rejects payment headers and does not settle.

Validation so far:

```bash
npm run typecheck
npm run build
```

Both commands passed.

Feature-flag smoke checks passed:

- Flag off:
  `POST /api/x402/deepseek/risk-brief/erc7710-paid-poc` returned `404` with
  `ERC7710_PAID_POC_DISABLED`.
- Flag on without payment:
  unpaid request returned `402` with amount `10000`,
  `extra.assetTransferMethod = "erc7710"`, `payTo` matching `X402_PAY_TO`, and
  network `eip155:84532`.
- Browser UI on a feature-flag-on dev server showed the paid control:
  `Pay 0.01 USDC 7710`.
- A real user click reached the paid PoC path, but the paid retry returned `402`
  instead of settlement success. `/api/ledger` remained empty.
- Fixed the frontend/server error reporting path so paid-retry verification
  failures return `X402_PAYMENT_VERIFICATION_FAILED` rather than surfacing a
  client TypeError.
- A no-spend fake payment-header probe returned:
  `unexpected_error: Cannot read properties of undefined (reading 'from')`.
  This indicates the configured/default facilitator is still verifying the old
  EOA exact payload shape, not the ERC-7710 delegation payload.
- `.env.local` and docs were updated to use MetaMask's Base Sepolia x402
  facilitator:
  `https://tx-sentinel-base-sepolia.api.cx.metamask.io/platform/v2/x402`.
- From this machine, the MetaMask facilitator `/supported` call currently times
  out. The paid PoC API now returns `502 X402_FACILITATOR_UNAVAILABLE` instead
  of a raw server error when the facilitator cannot be reached.
- Added project-local server proxy support:
  - dependency: `undici`;
  - config: `X402_PROXY_URL`;
  - local value: `http://127.0.0.1:7890`;
  - implementation: server-side `configureProjectProxy()` sets an Undici
    `ProxyAgent` for the local Next.js process before x402 facilitator calls.
- The 4130 dev server briefly rendered as unstyled HTML after repeated dev
  restarts. Root cause was a corrupted/stale Next `.next` cache/client manifest:
  the HTML referenced `/_next/static/css/app/layout.css`, but the CSS route was
  returning `404`. Cleared generated `.next`, restarted only the 4130 server,
  and verified the CSS route now returns `200` with content.
- Also fixed dashboard state hydration after dev-server restarts: if the
  persisted permission record is active, `/api/ledger` now rebuilds the visible
  state as `wallet=connected`, `policy=active`, `permission=approved` instead
  of falling back to the in-memory `initial` phase.
- Operational note: do not run `npm run build` while a Next dev server is meant
  to stay usable on the same workspace, because both touch `.next`. If build is
  run, clear `.next` and restart the dev server before browser testing.

Still required for final live acceptance:

- Restart the 4130 dev server with `X402_PROXY_URL` loaded, then confirm the
  local backend can reach MetaMask's ERC-7710 facilitator.
- Re-run one browser PoC click with a stored MetaMask Advanced Permission grant
  after action-time confirmation.
- Confirm facilitator settlement, Base Sepolia tx hash, and ledger entry.

Latest proxy verification:

- Node/Undici can reach MetaMask's Base Sepolia facilitator through
  `X402_PROXY_URL=http://127.0.0.1:7890`; `/supported` returned `200`.
- The running `http://127.0.0.1:4130` dev server now returns a real unpaid
  ERC-7710 x402 `402 Payment Required` for
  `/api/x402/deepseek/risk-brief/erc7710-paid-poc`, with amount `10000`,
  network `eip155:84532`, and `extra.assetTransferMethod=erc7710`.
- This clears the previous backend connectivity blocker. The remaining open
  item is the spendful browser click and settlement acceptance evidence.
- Fixed dashboard hydration after reload: `src/components/Dashboard.tsx` now
  reads `/api/ledger` on mount and restores the persisted active MetaMask
  Advanced Permission grant into the visible UI. This made
  `Pay 0.01 USDC 7710` available again without requesting a new permission.
- Re-ran `npm run typecheck`; it passed.
- Browser verification on `http://localhost:4130` now shows
  `wallet=connected`, `policy=active`, `permission=approved`, and the real
  paid PoC button enabled.
- User clicked `Pay 0.01 USDC 7710`; this did not reach a successful
  settlement. There is still no ledger entry, no tx hash, and `spent=0`.
- Base Sepolia log check over the latest 20,000 blocks found no matching
  `10000` atomic USDC `Transfer` from the stored delegator to `X402_PAY_TO`;
  the only matching transfer in that window was the earlier `750000` atomic
  USDC EOA x402 mainline payment.
- Observed failure class:
  `invalid_exact_evm_erc7710_account_no...`. Onchain checks show the stored
  delegator `0xE56937908B36022578ab8D66B0002f246722EE8e` has no contract code
  on Base Sepolia, the session account also has no code, and the grant has no
  deployment dependencies. This means the facilitator cannot treat the current
  grant as an executable ERC-7710 smart-account payment source.
- Added clearer failure handling:
  - client-side ERC-7710 paid PoC errors now explain the no-code delegator
    condition instead of surfacing only the raw facilitator code;
  - server-side paid PoC handler now checks the delegator code before running
    DeepSeek, so this known invalid account shape is blocked before AI work or
    settlement retry;
  - command copy CSS now wraps long error tokens so status text does not
    overlap the control buttons.
- Re-ran `npm run typecheck`; it passed after the diagnostics patch.
- Re-ran unpaid smoke after the patch; the route still returns the expected
  ERC-7710 `402 Payment Required`.

## Direct Advanced Permission Revoke Attempt

Implemented a direct-first revoke flow for MetaMask Advanced Permissions:

- Added `revokeAdvancedSpendPermission()` in
  `src/client/permissions/metamaskAdvancedPermissions.ts`.
- The helper calls `wallet_revokeExecutionPermission` with the stored
  ERC-7715 `permissionContext`.
- It first uses the standard object params shape and retries with an
  array-wrapped params shape if the wallet reports invalid params.
- It classifies direct revoke outcomes as `submitted`, `not_supported`,
  `rejected`, `failed`, or `skipped_expired`.
- It always runs `getGrantedExecutionPermissions()` after the revoke attempt.
- The Dashboard only calls `POST /api/permissions/revoke` when wallet truth is
  `missing` or the local grant is `expired`.
- If the grant remains active, the Dashboard keeps local policy active and tells
  the user whether the direct revoke was unsupported, cancelled, failed, or
  still active after submission.
- The server revoke route still refuses local-only revoke; it records a revoked
  ledger entry only after `syncStatus=missing` or `syncStatus=expired`.

Files changed:

```text
docs/CURRENT_PROGRESS.md
docs/ERC7710_PAID_POC.md
docs/LOCAL_ENVIRONMENT.md
src/app/api/permissions/revoke/route.ts
src/client/permissions/metamaskAdvancedPermissions.ts
src/components/AgentControls.tsx
src/components/Dashboard.tsx
```

Known boundary:

- `@metamask/smart-accounts-kit@1.6.0` exposes request/getSupported/getGranted
  ERC-7715 helpers but no direct revoke wrapper, so the app calls the provider
  RPC directly.
- `wallet_revokePermissions` is still not treated as ERC-7715 grant revoke.
  It is for traditional provider permissions such as `eth_accounts`.
- Manual MetaMask revoke plus app sync remains the honest fallback when direct
  revoke is unsupported by the wallet.

Current acceptance decision:

- The current MetaMask build used in local testing did not support
  `wallet_revokeExecutionPermission`, so the app correctly kept the policy
  active and refused to record a fake revoke.
- The MVP revoke story is now manual wallet revoke in MetaMask Dapp
  connections followed by app-side wallet-truth sync.
- Dapp-triggered one-click wallet revoke is not being pursued further for this
  hackathon MVP unless MetaMask support changes.

## 1Shot Key Created

The 1Shot API key has been created successfully in the 1Shot dashboard.

Important boundary:

- Do not paste the API key or secret into docs, chat, screenshots, or
  browser-visible code.
- Keep `ONESHOT_MODE=mock` until the integration layer is implemented and the
  real-call guard is in place.
- The account currently has a 100-call budget, so real tests must be treated as
  scarce.
- Plan the 1Shot work as mock-first, one minimal real smoke call, then one final
  end-to-end demo pass.

New planning artifact:

```text
docs/ONESHOT_INTEGRATION_PLAN.md
```

## 1Shot Step 1 Complete

Completed Step 1 from `docs/ONESHOT_INTEGRATION_PLAN.md`.

Files changed:

```text
docs/CURRENT_PROGRESS.md
docs/ONESHOT_INTEGRATION_NOTES.md
```

Key findings:

- No 1Shot API key or secret was used.
- No live 1Shot endpoint was called, so no quota was consumed.
- 1Shot has two relevant product surfaces:
  - Public Relayer JSON-RPC, likely no API key required.
  - Dev Platform API, using dashboard API key + secret to obtain a bearer token.
- The hackathon relayer integration should prioritize Public Relayer, not the
  Dev Platform contract-method API, unless Public Relayer proves unsuitable.
- Base Sepolia `84532` appears in official examples and the testnet relayer host
  exists, but support remains unverified until one approved
  `relayer_getCapabilities(["84532"])` smoke call.
- Next implementation should stay mock-first and introduce a hard guard such as
  `ONESHOT_REAL_CALLS_ENABLED` before any real call path is wired.

New detailed notes:

```text
docs/ONESHOT_INTEGRATION_NOTES.md
```

Recommended next phase:

```text
1Shot Step 2: Mock Adapter And Type Contract
```

## 1Shot Step 2 Complete

Implemented Step 2 from `docs/ONESHOT_INTEGRATION_PLAN.md`.

Files changed:

```text
.env.example
docs/CURRENT_PROGRESS.md
docs/LOCAL_ENVIRONMENT.md
src/server/adapters/mockOneShotAdapter.ts
src/server/adapters/oneShotAdapter.ts
src/server/config/spendguard.ts
```

Key results:

- Added a server-side `OneShotAdapter` contract for quote, submit, and status.
- Kept the default adapter path in mock mode.
- Kept mock mode independent from `ONESHOT_API_KEY`.
- Added `ONESHOT_REAL_CALLS_ENABLED=false` as the second real-call guard.
- Added a real adapter skeleton that refuses before any real 1Shot network call
  unless `ONESHOT_MODE=real`, `ONESHOT_REAL_CALLS_ENABLED=true`,
  and `ONESHOT_BASE_URL` is set. `ONESHOT_API_KEY` remains server-side and
  optional because the Public Relayer path may not require it.
- Did not wire real 1Shot calls into the Dashboard or payment UI.

Verification:

```text
npm run typecheck passed.
git diff --check passed.
GET / returned 200 on localhost:3000.
GET /api/ledger returned 200 on localhost:3000 with relayerInfo.mode=mock.
```

## 1Shot Step 3 Dashboard Timeline Integration

Implemented the mock-first dashboard timeline integration from
`docs/ONESHOT_INTEGRATION_PLAN.md`.

Files changed:

```text
docs/CURRENT_PROGRESS.md
src/app/api/_lib/demoState.ts
src/components/Dashboard.tsx
src/components/RelayerTimeline.tsx
src/shared/types.ts
```

Key results:

- Dashboard relayer state now carries the configured 1Shot mode without exposing
  any API key or secret.
- The relayer timeline explicitly labels mock mode and says no real 1Shot API
  call is made.
- Timeline rendering now includes quote, fee, task, pending, and
  confirmed/failed states with concise IDs.
- Existing ERC-7710 Run Agent behavior was left intact.

Verification:

```text
npm run typecheck passed.
Restarted the localhost:3000 dev server after it hung compiling /api/ledger.
HTTP smoke passed:
- GET / returned 200.
- GET /api/ledger returned 200.
- /api/ledger state reports relayerInfo.mode=mock and relayer=not_used.
```

## 1Shot Step 4 Guarded Real Adapter

Implemented Step 4 from `docs/ONESHOT_INTEGRATION_PLAN.md`.

Files changed:

```text
.env.example
docs/CURRENT_PROGRESS.md
docs/LOCAL_ENVIRONMENT.md
docs/ONESHOT_INTEGRATION_PLAN.md
src/server/adapters/mockOneShotAdapter.ts
src/server/adapters/oneShotAdapter.ts
src/server/config/spendguard.ts
```

Local secret/config status:

```text
ONESHOT_MODE=mock
ONESHOT_REAL_CALLS_ENABLED=false
ONESHOT_BASE_URL=https://relayer.1shotapi.dev/relayers
ONESHOT_API_KEY=<configured in .env.local only>
ONESHOT_API_SECRET=<configured in .env.local only>
```

Key results:

- Added `ONESHOT_API_SECRET` as a server-side-only local config value for the
  Dev Platform path if it becomes necessary.
- Kept Public Relayer as the preferred integration path.
- Added guarded JSON-RPC support in `realOneShotAdapter` for:
  - `relayer_getCapabilities`;
  - `relayer_getFeeData`;
  - `relayer_estimate7710Transaction`;
  - `relayer_send7710Transaction`;
  - `relayer_getStatus`.
- Extended the mock adapter to satisfy the same low-level adapter contract.
- Kept real calls disabled by default. The adapter refuses unless
  `ONESHOT_MODE=real`, `ONESHOT_REAL_CALLS_ENABLED=true`, and
  `ONESHOT_BASE_URL` is set.
- Did not wire real 1Shot calls into Dashboard or the payment path.
- Did not call any real 1Shot endpoint and did not consume quota.

Verification:

```text
npm run typecheck passed.
npm run build passed with the existing ox/tempo dynamic dependency warning.
After build, .next was cleared and localhost:3000 dev server was restarted.
GET /api/ledger still returns 200 with the app in mock relayer mode.
```

## 1Shot Step 5 Quota-Safe Real Smoke

Completed Step 5 from `docs/ONESHOT_INTEGRATION_PLAN.md`.

Files changed:

```text
docs/CURRENT_PROGRESS.md
docs/ONESHOT_INTEGRATION_NOTES.md
docs/ONESHOT_SMOKE_RESULTS.md
```

Real call performed:

```text
POST https://relayer.1shotapi.dev/relayers
method: relayer_getCapabilities
params: ["84532"]
auth: none
```

Call discipline:

```text
expected calls: 1
actual observed calls: 1
retries: 0
polling: 0
API key/secret sent: no
```

Result:

```text
success
Base Sepolia 84532 is supported for 1Shot Public Relayer capabilities discovery.
feeCollector: 0xE936e8FAf4A5655469182A49a505055B71C17604
targetAddress: 0xf1ef956eff4181Ce913b664713515996858B9Ca9
USDC: 0x036CbD53842c5426634e7929541eC2318f3dCF7e, decimals 6
```

Quota note:

```text
If Public Relayer calls count against the dashboard budget, this phase used one
call. No further 1Shot probing should happen before the final controlled demo
or an explicitly approved integration test.
```

Recommended next phase:

```text
Step 6: Final End-To-End Demo Pass, or a small pre-Step-6 wiring patch that uses
the verified capabilities without making additional real calls.
```

## 1Shot Step 6 Wiring Patch

Completed the pre-Step-6 wiring patch that Turing identified as required before
an honest real 1Shot end-to-end demo.

Files changed:

```text
.env.example
src/app/api/x402/deepseek/risk-brief/erc7710-paid-poc/route.ts
src/components/RelayerTimeline.tsx
src/server/config/spendguard.ts
src/server/x402/erc7710OneShotSettlement.ts
src/server/x402/erc7710PaidPocResourceServer.ts
src/server/x402/erc7710SelfSettlement.ts
```

What changed:

```text
- Added an ERC-7710 1Shot settlement facilitator for the paid PoC path.
- In ONESHOT_MODE=real, the x402 resource server now uses 1Shot as the
  settlement path instead of local self-settlement.
- The 1Shot path builds a relayer request from the generated ERC-7710 x402
  payload: permissionContext[] plus the USDC transfer execution.
- The real path performs estimate -> send -> bounded status polling through the
  existing guarded oneShotAdapter.
- Successful settlement records paymentReceipt.oneShot so the Dashboard relayer
  timeline can show the real quote/task/tx.
- Base Sepolia 1Shot feeCollector and targetAddress are configured from the
  single approved Step 5 capabilities smoke, avoiding another capabilities call.
```

Real-call discipline:

```text
No live 1Shot calls were made during this wiring patch.
ONESHOT_MODE remains mock locally.
ONESHOT_REAL_CALLS_ENABLED remains false locally.
```

Verification:

```text
npm run typecheck passed.
```

Known limits:

```text
- A real 1Shot-supported paid run has confirmed on Base Sepolia.
- The next needed run is a final clean reset-to-success capture for judging
  materials, not another exploratory integration test.
- Any additional real run should be explicitly approved because it can call
  1Shot estimate, send, and up to ONESHOT_STATUS_MAX_POLLS status checks.
- Revoke remains manual MetaMask revoke plus app sync fallback in current
  MetaMask builds.
```

## 1Shot-Supported ERC-7710 Paid Run Confirmed

The real paid x402 + ERC-7710 path has produced a confirmed Base Sepolia
transaction through the 1Shot-supported settlement path:

```text
tx: 0xf669edc46cd69491719937a6b8f416a88fc0a0d0f70f99f216c05c8b82bc2577
BaseScan: https://sepolia.basescan.org/tx/0xf669edc46cd69491719937a6b8f416a88fc0a0d0f70f99f216c05c8b82bc2577
```

Observed USDC transfers:

```text
10000 atomic USDC = 0.01 USDC service payment to the x402 payTo address
10944 atomic USDC = 0.010944 USDC relay fee payment to the 1Shot fee collector
```

Local app state after parser/status fixes:

```text
Agent Runner: succeeded
x402 Payment: paid
1Shot Relayer: confirmed
ledger: success record present
```

This is now the proof foundation for the Best x402 + ERC-7710 submission. The
next work should package and repeat this path cleanly, not broaden the scope.

## Clean E2E User Run Passed

The user completed the Step 2 clean E2E validation on 2026-06-01.

Result document:

```text
docs/X402_ERC7710_E2E_RESULTS.md
```

Confirmed transaction:

```text
0xd864924d7f92e498f51d5a0065c4d1a29ae6629087f5e9602177f0c8590c3a4d
https://sepolia.basescan.org/tx/0xd864924d7f92e498f51d5a0065c4d1a29ae6629087f5e9602177f0c8590c3a4d
```

Acceptance checklist passed:

```text
Agent Runner: succeeded
x402 Payment: paid
1Shot Relayer: confirmed
ledger: has_success
spent: 0.01
txHash: present
```

BaseScan showed a successful `Redeem Delegations` transaction with two USDC
transfers:

```text
0.01 USDC service payment
0.010944 USDC 1Shot relay fee
```

The user then clicked `Try Over Budget`. The app blocked the oversized action
before payment/settlement and showed `Agent Runner: blocked`.

Residual UI note:

```text
The security behavior is correct, but the post-block badge "Policy: exhausted"
can be confusing when the budget card still shows "$0.99 left". Rename this
state in a later polish pass to "blocked", "policy violation", or similar.
```

## Best x402 + ERC-7710 Step 3 Complete

Completed Step 3 from:

```text
docs/X402_ERC7710_TRACK_OPTIMIZATION_PLAN_CN.md
```

Files changed:

```text
src/shared/types.ts
src/app/api/_lib/demoState.ts
src/app/api/x402/deepseek/risk-brief/erc7710-paid-poc/route.ts
src/components/Dashboard.tsx
src/components/PaymentRail.tsx
src/app/globals.css
```

What changed:

```text
- Added Dashboard-level x402Evidence state.
- Server state now projects x402 evidence from ledger paymentRequirement and
  paymentReceipt.
- Paid ERC-7710 route records x402 requirement fields needed by the Dashboard:
  scheme, network, asset, assetTransferMethod, and maxTimeoutSeconds.
- PaymentRail now shows protocol evidence:
  protected resource, selected requirement, amount, network, asset, payTo,
  paid-header state, and tx hash.
- During live runs, the UI distinguishes:
  402 received / no paid header submitted
  paid request submitted / x402 payment header submitted
  settled / header accepted
  over-budget blocked before 402 payment / no paid header submitted
```

Verification:

```text
npm run typecheck passed.
npm run build passed with the existing ox/tempo dynamic dependency warning.
Browser check passed at http://127.0.0.1:3010.
```

Browser check notes:

```text
- Initial state renders protocol evidence without layout overlap.
- Existing successful tx state renders scheme=exact and
  assetTransferMethod=erc7710.
- After Try Over Budget, PaymentRail shows "Blocked before 402 payment" and
  "No paid header submitted", while relayer/ledger still retain the previous
  successful tx proof.
```

Recommended next phase:

```text
Step 4: ERC-7710 Proof Rail
```

## Best x402 + ERC-7710 Focus Lock

Added the current optimization focus and plan docs:

```text
docs/X402_ERC7710_OPTIMIZATION_FOCUS.md
docs/X402_ERC7710_TRACK_OPTIMIZATION_PLAN.md
docs/X402_ERC7710_TRACK_OPTIMIZATION_PLAN_CN.md
docs/X402_ERC7710_E2E_RESULTS.md
```

Current priority is to polish the proof chain for the Best x402 + ERC-7710
track:

```text
Advanced Permission grant
-> ERC-7710 payment payload
-> x402 402 challenge
-> paid x402 request
-> SpendGuard budget guard
-> confirmed Base Sepolia settlement
-> truthful ledger proof
```

Do not expand the main scope toward Venice, A2A, 1Shot specialty positioning,
or production-grade revoke until this judging story is clean.

## P8.5 AI Spending Decision Layer Complete

Implemented the new pre-payment decision layer:

```text
DeepSeek decides whether spending is worthwhile
SpendGuard enforces whether spending is allowed
x402 + ERC-7710 executes only if both pass
```

Files changed:

```text
src/shared/types.ts
src/server/agent-runner/agentSpendDecision.ts
src/server/agent-runner/agentSpendDecisionStore.ts
src/server/adapters/agentSpendDecisionAdapter.ts
src/server/agent-runner/runAgentWithPermission.ts
src/app/api/agent/precheck/route.ts
src/app/api/agent/run/route.ts
src/app/api/x402/deepseek/risk-brief/route.ts
src/app/api/x402/deepseek/risk-brief/erc7710-paid-poc/route.ts
src/app/api/_lib/demoState.ts
src/app/api/demo/reset/route.ts
src/components/AgentDecisionPanel.tsx
src/components/Dashboard.tsx
src/components/AgentControls.tsx
src/components/SpendLedger.tsx
src/components/StatusBadge.tsx
src/app/globals.css
scripts/p8-agent-decision-smoke.mjs
package.json
README.md
```

What changed:

```text
- Added AgentSpendDecision shared type:
  decision, reason, estimatedCostAtomic, budgetBeforeAtomic,
  budgetAfterAtomic, confidence, policyCheck.
- Added DeepSeek spending decision adapter with mock fallback.
- Added current decision store so precheck can show intent before payment.
- /api/agent/precheck now generates AI spend intent before policy guard.
- policyCheck is written by SpendGuard as allowed/denied.
- paid x402 routes require an allowed decision before settlement and attach it
  to success ledger rows.
- blocked prechecks attach agentDecision to blocked ledger rows.
- Dashboard now shows an Agent Decision panel before PaymentRail.
- SpendLedger now displays AI rationale for blocked/success rows.
- Added P8 no-spend smoke covering skip, over-budget spend intent, and allowed
  precheck without MetaMask or settlement.
```

Verification:

```text
npm run typecheck
npm run smoke:p8
npm run lint
Browser check at http://127.0.0.1:3000
```

Browser check notes:

```text
- Agent Decision panel renders before x402 PaymentRail.
- Desktop viewport 1280x900 has no horizontal overflow.
- Decision, PaymentRail, and Relayer columns align in that order.
- Precheck can fill decision=spend / policyCheck=allowed without submitting a
  paid header or settlement.
```

Known note:

```text
Direct paid route calls without a prior allowed decision are blocked before
settlement. The normal UI path generates the decision before asking for the
x402 paid request.
```

## Documentation Update Rule

After each implementation phase, update this document with:

- Files changed.
- New config variables.
- Commands run.
- Verification result.
- Known blockers.
- Next recommended phase.
