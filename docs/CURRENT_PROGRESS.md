# Agent SpendGuard Current Progress

Last updated: 2026-05-31

## Current Snapshot

The project is currently a local Next.js demo for bounded AI-agent spending on
Base Sepolia.

Working now:

- Real MetaMask EOA connection and Base Sepolia enforcement.
- Real MetaMask Advanced Permissions request path for an
  `erc20-token-periodic` Base Sepolia USDC grant.
- Server-side policy guard that requires the stored Advanced Permission grant
  before allowing the agent run path.
- Main `Run Agent` payment flow uses the stored MetaMask Advanced Permission
  grant to build and settle an ERC-7710 x402 payment.
- The older paid x402 EOA typed-data client remains as legacy code but is no
  longer the Dashboard default path.
- Real DeepSeek adapter path after x402 payment succeeds.
- Local demo ledger / permission persistence.
- Dry-run ERC-7710 x402 PoC that builds a delegation payment preview from the
  stored MetaMask grant without submitting payment.
- Dry-run route safety guard that rejects payment headers before any
  verification, settlement, ledger write, or paid AI handler can run.
- Feature-flagged paid ERC-7710 x402 endpoint and Dashboard control for a real
  Base Sepolia testnet spend.
- Revoke button now attempts the ERC-7715 direct wallet revoke RPC
  `wallet_revokeExecutionPermission` when available, then verifies wallet truth
  with `wallet_getGrantedExecutionPermissions` before closing local policy.

Still not done:

- 1Shot relayer integration is not implemented in the payment path.
- Direct revoke support still depends on the user's MetaMask build. If the
  wallet does not support `wallet_revokeExecutionPermission`, the app falls
  back to explicit manual MetaMask revoke plus wallet-truth sync.
- Ledger and policy state are local demo persistence, not production storage.
- Any real ERC-7710 run includes a post-preflight browser confirmation before
  the paid request is submitted.

## Current Objective

Agent SpendGuard is being built as a hackathon MVP for bounded, observable, and
revocable AI-agent spending onchain.

The current implementation goal is to keep the existing paid EOA x402 path and
the no-spend ERC-7710 dry run working while validating the feature-flagged real
ERC-7710 x402 paid PoC.

Current status: the no-spend ERC-7710 dry-run PoC is implemented and locally
verified. The paid PoC is implemented behind `ERC7710_PAID_POC_ENABLED`, but
the latest real payment attempt did not settle. After the account was converted
to a MetaMask smart account / EIP-7702 account, `grant.from` has executable code
on Base Sepolia. The local RedeemerEnforcer guard now decodes the generated
permission context into delegations/caveats instead of searching raw hex, so the
next real paid retry should no longer fail on the false missing-facilitator
message shown in the browser.

## Completed So Far

### Product and Planning

- Defined the core demo loop:
  1. Connect wallet.
  2. Approve a bounded agent budget policy.
  3. Run one paid DeepSeek risk-brief action.
  4. Show x402 payment state and 1Shot relay timeline.
  5. Update spend ledger.
  6. Block a second over-budget action.
  7. Revoke permission.
- Confirmed MVP boundary:
  - One user.
  - One agent.
  - One service: DeepSeek risk brief.
  - One token: Base Sepolia USDC.
  - One budget: 1.00 USDC / 24 hours.
  - One fixed price: 0.75 USDC per call.

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

## Current Local Runtime Status

The app currently supports real MetaMask EOA connection on Base Sepolia, a real
MetaMask Advanced Permission request path, a real x402 seller route, and a real
DeepSeek-backed paid result path.

The existing paid x402 path is still the EOA typed-data
`TransferWithAuthorization` path. ERC-7710 now has both a no-spend dry-run path
and a separate feature-flagged paid PoC path. The paid PoC can submit payment,
but has not yet produced a successful facilitator settlement.

It still does not use:

- Real 1Shot quote/submit/status.
- Production-grade wallet revoke or persistent storage.

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
  The paid PoC may spend `0.01 USDC` on Base Sepolia and must only be retried
  after explicit user confirmation.
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

## Documentation Update Rule

After each implementation phase, update this document with:

- Files changed.
- New config variables.
- Commands run.
- Verification result.
- Known blockers.
- Next recommended phase.
