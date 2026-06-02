# Best x402 + ERC-7710 Optimization Plan

Last updated: 2026-06-01

## Current Boundary

The current prize strategy is to focus on the main track:

```text
Best x402 + ERC-7710
```

Focus statement:

```text
docs/X402_ERC7710_OPTIMIZATION_FOCUS.md
```

Chinese version:

```text
docs/X402_ERC7710_TRACK_OPTIMIZATION_PLAN_CN.md
```

This phase intentionally does not optimize for:

```text
1. Best Use of 1Shot Permissionless Relayer
2. Best use of Venice AI
3. Best A2A coordination
4. Social media / feedback side prizes
5. Production-grade one-click revoke
```

1Shot remains part of the settlement implementation, but it should be framed as
supporting infrastructure. The main judging story is:

```text
MetaMask Advanced Permissions
-> ERC-7710 delegation payment payload
-> x402 protected API call
-> SpendGuard policy enforcement
-> observable paid result and ledger proof
```

Default rule for this phase:

```text
Make the x402 + ERC-7710 proof chain obvious, repeatable, and impossible to
confuse with a mocked payment.
```

## Step 1: Track Narrative And Scope Lock

### 1. 本次任务目标

锁定项目叙事，避免把评委注意力分散到 1Shot、Venice、A2A 或 revoke。

最终一句话：

```text
Agent SpendGuard lets an AI agent pay x402-protected APIs with MetaMask
Advanced Permissions and ERC-7710, while enforcing a scoped onchain spending
budget before settlement.
```

### 2. 最终交付物结构

```text
README.md
docs/PROJECT_CHECKLIST.md
docs/CURRENT_PROGRESS.md
docs/X402_ERC7710_OPTIMIZATION_FOCUS.md
```

Expected updates:

```text
- primary prize track: Best x402 + ERC-7710
- secondary technologies: 1Shot settlement, DeepSeek AI output
- explicit non-goals for this phase
- short demo script for judges
```

### 3. 参与 Agent 分工

- **Agent 1: Reviewer, prize narrative**
  - Reviews the submission story against the track requirements.
  - Removes claims that dilute the main track.

- **Main controller**
  - Applies final copy edits.
  - Keeps the project boundary strict.

At most two agents should run in parallel.

### 4. 每个 Agent 的中间产物

Reviewer outputs:

```text
- one-sentence project pitch
- three strongest judging claims
- three claims to avoid
- required screenshots / demo beats
```

### 5. 质量验收标准

```text
1. README identifies Best x402 + ERC-7710 as the primary track.
2. The first paragraph mentions MetaMask Advanced Permissions, ERC-7710, and x402.
3. 1Shot is described as settlement infrastructure, not the primary prize target.
4. Venice/A2A are not presented as current judging claims.
5. The demo script can be understood in under 60 seconds.
```

### 6. 预计执行顺序

```text
1. Review current README/project checklist.
2. Rewrite the project pitch and track-fit section.
3. Add a judge-facing demo script.
4. Remove or demote off-track claims.
5. Re-read the top-level docs for consistency.
```

## Step 2: Clean Automatic End-To-End Run

### 1. 本次任务目标

证明当前修复后的代码可以从空状态自动完成整条链路，不依赖手动 ledger
reconciliation。

Target flow:

```text
Reset
-> Connect MetaMask
-> Approve Advanced Permission
-> request protected endpoint
-> receive x402 402 challenge
-> generate ERC-7710 payment payload
-> submit paid x402 request
-> settlement confirms
-> ledger auto-writes payer / amount / txHash
```

### 2. 最终交付物结构

```text
docs/CURRENT_PROGRESS.md
docs/X402_ERC7710_E2E_RESULTS.md
```

Optional if bugs are found:

```text
src/client/x402/payErc7710DeepseekRiskBrief.ts
src/server/x402/erc7710OneShotSettlement.ts
src/app/api/x402/deepseek/risk-brief/erc7710-paid-poc/route.ts
```

### 3. 参与 Agent 分工

- **Agent 2: QA, clean run acceptance**
  - Defines the acceptance checklist.
  - Reviews logs and ledger proof.

- **Main controller**
  - Runs the browser flow once.
  - Applies only blocking fixes.

### 4. 每个 Agent 的中间产物

QA outputs:

```text
- reset state proof
- pre-payment 402 proof
- paid request proof
- settlement proof
- ledger proof
- tx explorer link
- residual risk list
```

### 5. 质量验收标准

```text
1. The run starts from reset / empty ledger.
2. No manual ledger edit is used.
3. The unpaid request returns 402.
4. The paid request returns a successful response.
5. The ledger contains exactly one success entry for the run.
6. The ledger txHash matches the settlement txHash.
7. npm run typecheck passes after any fix.
```

### 6. 预计执行顺序

```text
1. Snapshot current state.
2. Reset app state.
3. Run the full Dashboard path.
4. Capture server logs and /api/ledger output.
5. Verify tx on Base Sepolia.
6. Document the result.
```

## Step 3: x402 Evidence Rail

### 1. 本次任务目标

把 x402 从隐藏协议细节变成评委能直接看见的产品证据。

The Dashboard should clearly show:

```text
- protected resource
- 402 Payment Required challenge
- selected requirement
- scheme = exact
- network = eip155:84532
- asset = Base Sepolia USDC
- amount = 10000 atomic USDC
- payTo
- payment header submitted only on the paid request
```

### 2. 最终交付物结构

```text
src/components/PaymentRail.tsx
src/components/AgentControls.tsx
src/components/Dashboard.tsx
src/shared/types.ts
src/app/api/_lib/demoState.ts
```

Optional server additions:

```text
src/app/api/x402/deepseek/risk-brief/erc7710-paid-poc/route.ts
```

### 3. 参与 Agent 分工

- **Agent 3: Protocol UI**
  - Owns x402 evidence display.
  - Does not change settlement behavior.

### 4. 每个 Agent 的中间产物

Protocol UI outputs:

```text
- visible x402 requirement summary
- paid/unpaid request distinction
- payment header status
- copy that avoids overclaiming
```

### 5. 质量验收标准

```text
1. A judge can identify the 402 challenge from the first screen or one scroll.
2. The selected requirement shows assetTransferMethod=erc7710.
3. Dry-run clearly says no payment header was submitted.
4. Paid path clearly says a payment header was submitted.
5. The display does not expose secrets or full oversized payloads.
```

### 6. 预计执行顺序

```text
1. Identify the smallest state fields needed for x402 evidence.
2. Add server/client projection only if current state is insufficient.
3. Render compact evidence in the payment rail.
4. Test dry-run and paid states.
5. Browser-check layout on desktop.
```

## Step 4: ERC-7710 Proof Rail

### 1. 本次任务目标

让评委清楚看到项目不是普通 EOA x402，而是 ERC-7710 delegation payment.

The UI and logs should expose a compact proof:

```text
- MetaMask Advanced Permission grant type
- delegator / payer
- session account / redeemer
- delegation manager
- permission context hash
- child delegation target
- ERC-7710 payload passed local validation
```

### 2. 最终交付物结构

```text
src/components/PermissionPreview.tsx
src/components/AgentControls.tsx
src/client/x402/payErc7710DeepseekRiskBrief.ts
src/server/x402/erc7710PaidPocResourceServer.ts
src/shared/x402/erc7710DelegationInspector.ts
```

### 3. 参与 Agent 分工

- **Agent 4: Delegation proof**
  - Owns ERC-7710 proof copy and validation projection.
  - Keeps raw permission context hidden behind shortened hashes.

### 4. 每个 Agent 的中间产物

Delegation proof outputs:

```text
- ERC-7710 proof fields
- shortened address/hash display rules
- validation checklist shown to user
- no-secret/no-private-key review
```

### 5. 质量验收标准

```text
1. UI distinguishes delegator from session account.
2. UI shows permission context hash, not a huge raw blob.
3. Payload validation failure remains fail-closed.
4. Generated payload must match the stored grant.
5. Typecheck passes.
```

### 6. 预计执行顺序

```text
1. Review current grant and payload state.
2. Decide which proof fields belong in the Dashboard.
3. Add compact proof rail.
4. Verify addresses match the successful paid run.
5. Confirm no raw secrets are displayed.
```

## Step 5: One Permission, Multiple Agent Payments

### 1. 本次任务目标

突出 Advanced Permissions 的核心价值：用户授权一次，agent 可以在预算内进行多次
x402 paid calls，不需要每次重新弹钱包。

Target demo:

```text
Approve one 1.00 USDC / 24h Advanced Permission
-> paid x402 call #1 succeeds
-> paid x402 call #2 succeeds without new permission approval
-> oversized call is blocked before settlement
```

### 2. 最终交付物结构

```text
src/components/AgentControls.tsx
src/components/Dashboard.tsx
src/server/agent-runner/policyGuard.ts
src/server/permissions/store.ts
src/server/ledger/store.ts
```

Optional:

```text
src/app/api/x402/deepseek/risk-brief/erc7710-paid-poc/route.ts
```

### 3. 参与 Agent 分工

- **Agent 5: Multi-run flow**
  - Owns repeated in-budget run UX and server state correctness.

### 4. 每个 Agent 的中间产物

Multi-run flow outputs:

```text
- button/state design for second in-budget run
- expected ledger after two runs
- budget remaining math
- over-budget acceptance case
```

### 5. 质量验收标准

```text
1. A second in-budget paid run does not request a new Advanced Permission.
2. Each paid run uses a fresh child delegation / payment payload.
3. Ledger records each successful x402 service payment exactly once.
4. Remaining budget decreases correctly.
5. Over-budget is blocked before paid request submission.
```

### 6. 预计执行顺序

```text
1. Confirm current policy allows more than one 0.01 USDC call.
2. Adjust UI copy/buttons so repeat run is natural.
3. Verify second run from the same grant.
4. Verify over-budget block after artificially large request.
5. Document the multi-run result.
```

## Step 6: Budget Accounting Clarity

### 1. 本次任务目标

避免评委质疑 SpendGuard 记录的 `0.01 USDC` 和钱包实际扣款不一致。

The app should distinguish:

```text
x402 service price
relay / settlement fee
total wallet debit
agent budget consumed
remaining budget
```

### 2. 最终交付物结构

```text
src/components/PolicyCard.tsx
src/components/RelayerTimeline.tsx
src/components/SpendLedger.tsx
src/shared/types.ts
src/app/api/_lib/demoState.ts
src/app/api/x402/deepseek/risk-brief/erc7710-paid-poc/route.ts
```

### 3. 参与 Agent 分工

- **Agent 6: Accounting clarity**
  - Owns budget and fee language.
  - Does not change settlement mechanics unless a policy bug is found.

### 4. 每个 Agent 的中间产物

Accounting clarity outputs:

```text
- service price display
- relay fee display
- total wallet debit display
- statement of what counts against the policy
- recommended production policy note
```

### 5. 质量验收标准

```text
1. UI never implies relay fee is zero when it is not.
2. Ledger service cost remains truthful.
3. Relay fee is visible when known.
4. The policy card states whether fees are included in the spend cap.
5. Documentation explains the demo accounting choice.
```

### 6. 预计执行顺序

```text
1. Inspect settlement extra fields for fee data.
2. Add shared type fields if needed.
3. Render fee and total debit.
4. Update docs with accounting boundary.
5. Verify against the known successful tx.
```

## Step 7: Failure Semantics And Tests

### 1. 本次任务目标

让项目的安全承诺经得住评委追问：失败必须 fail closed，成功必须有证据。

### 2. 最终交付物结构

```text
src/server/adapters/oneShotAdapter.ts
src/client/x402/payErc7710DeepseekRiskBrief.ts
src/server/x402/erc7710OneShotSettlement.ts
src/server/x402/erc7710PaidPocResourceServer.ts
tests or scripts if the repo adds a test runner
```

If no test runner is introduced:

```text
docs/X402_ERC7710_E2E_RESULTS.md
  - manual/command acceptance matrix
```

### 3. 参与 Agent 分工

- **Agent 7: Failure audit**
  - Reviews fail-closed behavior.
  - Adds tests or smoke scripts only where they reduce real risk.

### 4. 每个 Agent 的中间产物

Failure audit outputs:

```text
- failure matrix
- test/smoke command list
- highest-risk untested behavior
- blocking fixes
```

### 5. 质量验收标准

```text
1. Invalid/missing payment payload does not run AI.
2. Dry-run rejects payment headers.
3. Over-budget blocks before settlement.
4. Settlement failure does not write success ledger.
5. 1Shot status=200 with receipt.transactionHash is parsed as confirmed.
6. Duplicate settlement/refresh cannot duplicate ledger entries.
```

### 6. 预计执行顺序

```text
1. Build the failure matrix.
2. Add focused tests or smoke scripts.
3. Run typecheck/build.
4. Run one browser smoke.
5. Document residual risk.
```

## Step 8: Final Judge Demo Package

### 1. 本次任务目标

产出最终评审材料，让评委无需读代码也能理解并验证主赛道价值。

### 2. 最终交付物结构

```text
README.md
docs/CURRENT_PROGRESS.md
docs/X402_ERC7710_E2E_RESULTS.md
docs/PROJECT_CHECKLIST.md
```

Video/script assets can reference:

```text
http://localhost:3000
Base Sepolia explorer tx link
/api/ledger proof
```

### 3. 参与 Agent 分工

- **Agent 8: Final reviewer**
  - Reviews demo clarity, no false claims, and track fit.

### 4. 每个 Agent 的中间产物

Final reviewer outputs:

```text
- final demo script
- required screenshot list
- judging claim checklist
- residual risk statement
```

### 5. 质量验收标准

```text
1. Demo video shows MetaMask Advanced Permission in the main flow.
2. Demo video shows x402 402 -> paid request.
3. Demo video shows ERC-7710 proof.
4. Demo video shows confirmed tx / ledger proof.
5. README clearly states known demo boundaries.
6. No secrets, local keys, or private state files are included in submission.
```

### 6. 预计执行顺序

```text
1. Run final clean demo.
2. Capture screenshots and tx links.
3. Update README/project checklist.
4. Record the demo video.
5. Do a no-secrets repository audit.
6. Submit under Best x402 + ERC-7710.
```
