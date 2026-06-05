# Agent SpendGuard Hackathon Submission

Target track: Best x402 + ERC-7710
Event context: MetaMask Smart Accounts Kit x 1Shot API x Venice AI Dev Cook-Off

## 1. Project One-Line Pitch

Agent SpendGuard gives AI agents a bounded onchain spending account: they can buy x402-protected APIs through MetaMask Advanced Permissions and ERC-7710, but every payment is policy-checked before settlement and fully traceable after settlement.

```text
AI decides when to spend.
SpendGuard decides whether it may spend.
x402 + ERC-7710 proves how it spent.
```

## 2. Core Problem

AI agents are starting to do paid work: call premium models, buy risk reports, fetch proprietary data, and pay for execution services. The unsafe default is to give the agent too much payment power.

Current approaches are not good enough for autonomous agents:

- Private-key custody gives the agent or backend direct wallet control.
- Unlimited ERC-20 approvals let an agent overspend before the user notices.
- Centralized backend billing hides which exact request caused each debit.
- Frontend-only budgets are not payment constraints. They can look safe while the payment rail remains unbounded.
- Post-payment monitoring catches damage after settlement. Agent payment safety needs pre-payment blocking.
- x402 makes HTTP APIs payable, but an agent still needs a delegated, scoped, revocable way to pay without touching the user's main wallet authority.

SpendGuard addresses the missing layer between agent intent and x402 settlement: the user grants a narrow spending capability, the agent proposes a spend, and SpendGuard verifies budget, endpoint, token, network, payTo, payload, and caveats before a paid x402 request is submitted.

## 3. Solution Overview

Agent SpendGuard is an onchain spending-control layer for AI agents. A user connects MetaMask and approves a scoped MetaMask Advanced Permission, for example `1.00 USDC / 24h` on Base Sepolia for a wallet risk-brief agent. When the agent wants to call a paid API, it first produces a spending decision with a reason and estimated cost. SpendGuard then enforces the hard policy. If the request is allowed, the client requests an x402 challenge from the SpendGuard seller endpoint, constructs an ERC-7710 delegation payment payload from the stored MetaMask permission, and submits the paid request. Settlement is executed through the ERC-7710 path, with 1Shot used as the relayer/facilitator path when real relay mode is enabled. After settlement, the downstream AI provider returns the risk brief and the dashboard records the x402 requirement, ERC-7710 payload hash, transaction hash, relay fee, service price, and remaining budget.

The result is not "an agent with a wallet." It is an agent with a measurable, revocable, pre-checked payment capability.

## 4. Technical Architecture

### Protocol Flow

```text
[User + MetaMask]
  -> approves scoped ERC-20 periodic Advanced Permission
     through MetaMask Smart Accounts Kit

[AI Agent]
  -> generates spend intent:
     decision, reason, estimatedCostAtomic, confidence

[SpendGuard Policy Guard]
  -> checks budget, endpoint, method, token, chain, payTo,
     permission status, prior ledger spend, and agent decision
  -> denies unsafe requests before any x402 PAYMENT header exists

[SpendGuard x402 Seller Endpoint]
  -> returns HTTP 402 Payment Required
  -> requires scheme=exact, network=eip155:84532,
     asset=Base Sepolia USDC, assetTransferMethod=erc7710

[Client x402 + ERC-7710 Builder]
  -> uses @metamask/x402 and MetaMask Smart Accounts Kit
  -> builds a fresh ERC-7710 child delegation payment payload
  -> adds caveats for target, method, amount, timestamp, and call count

[Server Verification + Preflight]
  -> verifies requirement, grant, delegator, delegation manager,
     payload context hash, caveats, and replay safety

[1Shot / ERC-7710 Settlement Path]
  -> estimates relay requirements
  -> submits/polls ERC-7710 execution when real 1Shot mode is enabled
  -> produces a Base Sepolia transaction hash

[AI Provider]
  -> runs the paid risk-brief task after settlement succeeds

[Dashboard + Ledger]
  -> shows x402 requirement, ERC-7710 proof, tx hash,
     1Shot fee, service price, total wallet debit, and budget remaining
```

### Component Roles

| Component | Role in Agent SpendGuard | Concrete implementation |
|---|---|---|
| MetaMask Smart Accounts Kit | Permission acquisition and delegation environment. The user approves a scoped ERC-20 periodic Advanced Permission instead of giving the agent a private key or unlimited allowance. | `src/client/permissions/metamaskAdvancedPermissions.ts` uses `@metamask/smart-accounts-kit`, `erc7715ProviderActions`, `ERC20PeriodTransferEnforcer`, `decodeDelegations`, and `hashDelegation`. |
| MetaMask Advanced Permissions | The parent authority boundary. The stored grant records delegator, session account/redeemer, token, period amount, expiry, delegation manager, and permission context. | The policy guard requires `source="metamask-erc7715"` and `permissionType="erc20-token-periodic"` before paid execution. |
| x402 | HTTP payment discovery and paid request wrapper. The seller endpoint issues a `402 Payment Required` challenge and only serves the AI result after payment verification and settlement. | `src/server/x402/erc7710PaidPocResourceServer.ts` registers `x402ExactEvmErc7710ServerScheme`; the protected route is `POST /api/x402/deepseek/risk-brief/erc7710-paid-poc`. |
| ERC-7710 | Delegated payment execution inside the x402 payment payload. Each paid call creates a fresh child delegation with payment caveats. | `src/client/x402/payErc7710DeepseekRiskBrief.ts` uses `x402Erc7710Client`, `createDelegation`, `signDelegation`, and encoded delegation payloads. |
| SpendGuard Policy Guard | Application-layer payment firewall. It rechecks the AI spend decision and all payment requirements before allowing paid execution. | `src/server/agent-runner/policyGuard.ts` and the paid PoC route block invalid amount, endpoint, token, network, payTo, expired permission, stale payload, or denied agent decision. |
| 1Shot API | ERC-7710 settlement infrastructure and relayer accounting. In real mode, SpendGuard requests fee data, estimates a `7710` transaction, submits it, and polls task status. | `src/server/x402/erc7710OneShotSettlement.ts` and `src/server/adapters/oneShotAdapter.ts` implement `getFeeData`, `estimate7710`, `send7710`, and `getStatus`. |
| Venice AI provider slot | Downstream paid AI task after settlement. The payment layer is provider-agnostic, so the risk-brief task can be routed to the configured model provider without changing x402/ERC-7710 security semantics. | The repo includes provider configuration for `AI_PROVIDER=venice`, Venice env fields, and the mock Venice-compatible result adapter. The currently live-validated real AI path uses DeepSeek; Venice mode is a swappable demo/provider slot. |
| Chain Evidence Verifier | Judge-facing proof that settlement reached the ERC-7710 onchain execution path. | `src/server/chain-evidence/verifyChainEvidence.ts` verifies Base Sepolia receipts, DelegationManager target, `redeemDelegations` selector, USDC service transfer, and 1Shot relay fee transfer. |

### Key Onchain and Payment Parameters

| Parameter | Value |
|---|---|
| Network | Base Sepolia, `eip155:84532` |
| Payment asset | Base Sepolia USDC, `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| Demo service price | `10000` atomic USDC, equal to `0.01 USDC` |
| Demo budget | `1.00 USDC / 24h` |
| x402 scheme | `exact` |
| x402 transfer method | `erc7710` |
| ERC-7710 execution target | MetaMask DelegationManager `0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3` |
| Onchain function proof | `redeemDelegations(bytes[],bytes32[],bytes[])`, selector `0xcef6d209` |
| 1Shot Base Sepolia target | `0xf1ef956eff4181Ce913b664713515996858B9Ca9` |
| 1Shot fee collector | `0xE936e8FAf4A5655469182A49a505055B71C17604` |

## 5. Core Demo Flow

1. Open the Agent SpendGuard dashboard and explain the goal: the agent can pay for an API, but only inside a user-approved budget.
2. Connect MetaMask and switch or verify Base Sepolia.
3. Approve a scoped MetaMask Advanced Permission: Base Sepolia USDC, `1.00 USDC / 24h`, risk-brief endpoint scope, session account/redeemer, expiry, and no unlimited allowance.
4. Start the agent. The agent generates a spend decision: `decision=spend`, reason, estimated cost, budget before, projected budget after, and confidence.
5. SpendGuard runs the policy guard. It checks permission status, budget, endpoint, method, network, token, payTo, and the agent decision before any paid x402 header is submitted.
6. The client makes the unpaid request to the SpendGuard x402 seller. The seller returns `402 Payment Required` with `scheme=exact` and `assetTransferMethod=erc7710`.
7. The client builds a fresh ERC-7710 payment payload from the stored MetaMask Advanced Permission. The dashboard shows the generated payload proof, child delegation target, payload context hash, and required caveats.
8. SpendGuard runs local/server preflight checks, then the user confirms the real testnet spend. The paid x402 request is submitted and the ERC-7710 settlement path produces a Base Sepolia transaction hash.
9. After settlement, the AI risk brief is returned. The dashboard records the service price, 1Shot relay fee, total wallet debit, tx hash, remaining budget, and ledger row.
10. Run a second or third call to show one permission backing multiple independent paid calls, then run an oversized request. The oversized request is blocked before the paid header and before settlement, with `txHash=null` and no wallet debit.

## 6. Technical Highlights and Innovation

### 6.1 Agent Intent Is Separated From Payment Authority

The agent can recommend a spend, but it cannot settle by itself. SpendGuard only proceeds when `decision=spend` and the policy check is `allowed`. If the model is manipulated into requesting an unsafe spend, the hard policy still blocks by amount, endpoint, token, chain, payTo, permission status, and budget.

### 6.2 x402 Is Used as a Real Seller Boundary

The x402 seller is the SpendGuard paid risk-brief API, not a vague "AI API payment" placeholder. The protected route issues a concrete x402 requirement and records payment only after x402 verification and settlement succeed. The UI explicitly distinguishes:

- x402 seller: Agent SpendGuard paid risk-brief API
- downstream AI provider: the model that runs after settlement
- payment asset: Base Sepolia USDC
- transfer method: ERC-7710

### 6.3 ERC-7710 Child Delegations Are Hardened Per Call

Each paid call uses a fresh child delegation and payload context hash. The child delegation includes payment-specific caveats, including:

- `limitedCalls`
- `valueLte`
- `allowedTargets`
- `allowedMethods`
- `timestamp`
- `erc20TransferAmount`

The server decodes and validates these caveats before settlement. A missing or mismatched caveat fails closed.

### 6.4 One Permission Can Support Multiple Bounded Calls

The demo proves a real agent pattern: the user does not need to approve every API call manually, but the agent still cannot spend indefinitely. The same MetaMask Advanced Permission grant backed three independent paid calls, each with its own ERC-7710 payload context hash and Base Sepolia transaction hash.

Verified paid calls:

| Call | Base Sepolia transaction | Payload context hash | Service payment | Relay fee |
|---|---|---|---:|---:|
| #1 | `0x62e550bd889a8eeb72b72633371bd4be8118cd6026ad330ffeb0957d18b0aec0` | `0xe35522e53e9cf3c72e0150fa298e9b9446c83b91343ad6ce79da1be957481d10` | `10000` atomic USDC | `12042` atomic USDC |
| #2 | `0x9398cc02b95761f07c890a9a6346318e78ef4649c1c971659b92f4e1f9d1bd4e` | `0xf4a42c3b50e45e9e74bb3afc7c6f6691f97f41018752da0a3115e6b02110dc5f` | `10000` atomic USDC | `10626` atomic USDC |
| #3 | `0xa065cfa4d2e09048ae4015e2f4a779c26de05cccae4a14af65c8356d174f65d3` | `0xe3f22f2014585830d985097d945f4a4416f732aed2999f7764fdac63554a2d8a` | `10000` atomic USDC | `10626` atomic USDC |

These can be verified with:

```bash
npm run verify:chain-evidence
```

### 6.5 1Shot Relay Fees Are Accounted Separately

SpendGuard does not hide relay cost inside the agent budget. The ledger separates:

- x402 service price: counted against the agent budget
- 1Shot relay fee: shown as settlement infrastructure cost
- total wallet debit: service price plus relay fee
- remaining budget: decremented by the policy-defined service price

This matters for judging because it shows the project understands the difference between API monetization, relayer compensation, and user accounting.

### 6.6 Fail-Closed Payment Semantics

Unsafe paths do not produce successful ledger entries. Oversized requests are blocked before payment header construction. Duplicate payload context hashes are rejected. Missing ERC-7710 payloads return unpaid x402 responses. Dry-run routes reject payment headers. Settlement success is recorded only after the settlement callback succeeds.

### 6.7 Judge-Visible Evidence Rails

The dashboard is not a black box. It exposes:

- x402 protected resource and selected requirement
- `scheme=exact`
- `assetTransferMethod=erc7710`
- token, amount, network, and payTo
- MetaMask Advanced Permission summary
- child delegation target and caveats
- ERC-7710 payload context hash
- 1Shot task and fee data
- Base Sepolia tx hash
- ledger accounting and remaining budget
- blocked-row evidence showing no paid header and no tx

## 7. Track Qualification Self-Check

✅ Requirement: Use MetaMask Smart Accounts or Advanced Permissions to execute ERC-7710 based x402 calls.

Agent SpendGuard uses MetaMask Smart Accounts Kit Advanced Permissions as the parent authorization layer and builds ERC-7710 x402 payment payloads for paid calls. The paid path uses `@metamask/smart-accounts-kit`, `@metamask/x402`, and `@x402/core`.

✅ Requirement: Demo must show a real MetaMask Smart Accounts Kit implementation.

The demo requests and stores a real MetaMask Advanced Permission grant, validates the grant against the policy, decodes delegation context, and uses the grant to build the ERC-7710 x402 payload. The relevant implementation is in `src/client/permissions/metamaskAdvancedPermissions.ts` and `src/client/x402/payErc7710DeepseekRiskBrief.ts`.

✅ Requirement: Execute x402 calls using ERC-7710.

The x402 seller endpoint requires `extra.assetTransferMethod="erc7710"` and registers `x402ExactEvmErc7710ServerScheme`. The client filters for the ERC-7710 requirement, builds a delegation payment payload, and submits the paid request through the x402 HTTP client.

✅ Requirement: Show protocol evidence, not only UI state.

The project includes confirmed Base Sepolia transactions that call MetaMask DelegationManager `redeemDelegations(...)`, plus a chain evidence verifier that checks receipt status, function selector, USDC service transfer, and relay fee transfer.

✅ Requirement: Clearly explain 1Shot API usage if used.

1Shot is used as the ERC-7710 settlement/relayer path. In real mode, SpendGuard calls 1Shot for fee data, 7710 transaction estimation, transaction submission, and task status polling. The dashboard surfaces the 1Shot fee, task state, tx hash, and total wallet debit.

✅ Requirement: Keep AI provider role clear.

The AI provider runs after settlement and is not treated as the x402 seller. The repo includes a Venice-compatible provider slot and mock adapter; the currently validated real model path is DeepSeek. This keeps the scoring-critical x402/ERC-7710 path independent from provider availability while preserving the AI-agent use case.

✅ Requirement: Demonstrate safety behavior.

The demo includes an oversized request path that blocks before any paid x402 header or settlement request. The ledger records it as blocked with no tx hash and no wallet debit.

## 8. Current Implementation Status

### Real and Live-Validated

| Area | Status |
|---|---|
| MetaMask wallet connection | Implemented with real MetaMask detection, account read, and Base Sepolia network enforcement. |
| MetaMask Advanced Permission request | Implemented with Smart Accounts Kit and ERC-20 periodic permission semantics. |
| x402 seller endpoint | Implemented at `POST /api/x402/deepseek/risk-brief/erc7710-paid-poc`. |
| ERC-7710 x402 client path | Implemented with `x402Erc7710Client`, generated child delegations, and paid x402 submission. |
| Server-side ERC-7710 verification | Implemented: requirement match, grant match, delegator match, delegation manager match, caveat validation, payload freshness. |
| Base Sepolia settlement evidence | Implemented and recorded with multiple tx hashes. |
| 1Shot-supported settlement path | Wired through real-mode adapter and reflected in tx/fee evidence. Mock mode remains available by default for safe local demos. |
| AI spending decision layer | Implemented before paid request submission. |
| Over-budget blocking | Implemented and validated before paid header/settlement. |
| Ledger and dashboard evidence | Implemented with service price, relay fee, total wallet debit, tx hash, payload hash, and remaining budget. |
| Verification scripts | Implemented: `npm run p7:verify`, `npm run smoke:p3`, `npm run smoke:p8`, `npm run verify:chain-evidence`. |

### Demo or Feature-Flagged Boundaries

| Area | Boundary |
|---|---|
| Production persistence | Ledger and permission state use local demo persistence, not a production database. |
| Real 1Shot calls | Guarded by `ONESHOT_MODE=real`, `ONESHOT_REAL_CALLS_ENABLED=true`, and server-side 1Shot configuration. Mock mode is the safe default. |
| Venice AI | The architecture has a provider slot and Venice mock/result path. A real Venice adapter is not the currently live-validated AI path; DeepSeek is the real adapter used after settlement in the current paid route. |
| Revoke | The app attempts `wallet_revokeExecutionPermission` and then syncs wallet truth. Direct revoke support depends on the user's MetaMask build; manual MetaMask revoke plus sync is the fallback. |
| Settlement failure fixture | The route is fail-closed by structure, but the project does not yet include a live fixture that creates a valid ERC-7710 payload and intentionally fails only at settlement. |
| Real spend UX | Real paid runs include a post-preflight browser confirmation so the demo cannot accidentally spend testnet USDC from a diagnostic click. |

## 9. Future Expansion

Agent SpendGuard can become a general-purpose spending control plane for autonomous agents:

- Add a real Venice AI adapter as a first-class post-settlement provider for privacy-preserving agent analysis.
- Support an agent marketplace where every tool exposes x402 prices and SpendGuard policies define which tools an agent may buy.
- Move policy and ledger state from local persistence to production storage with signed policy snapshots.
- Add onchain policy registries so budgets, scopes, and revocations can be independently audited.
- Support multi-agent budgets where a manager agent delegates sub-budgets to worker agents.
- Add dynamic risk scoring that lowers limits when the agent, endpoint, or wallet behavior becomes suspicious.
- Extend from USDC risk-brief payments to data APIs, model inference, simulation services, relayer services, and autonomous SaaS subscriptions.
- Add recurring spending windows, per-endpoint caps, and emergency global pause controls.
- Build developer tooling around x402 + ERC-7710 so paid-agent applications can reuse SpendGuard as a policy middleware rather than writing custom budget logic.

The long-term thesis is simple: if AI agents are going to participate in crypto-economic activity, payment authority must be delegated, scoped, observable, and revocable by default. Agent SpendGuard demonstrates that pattern with MetaMask Advanced Permissions, x402, ERC-7710, and a relay-aware settlement ledger.
