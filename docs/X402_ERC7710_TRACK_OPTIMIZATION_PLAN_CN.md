# Best x402 + ERC-7710 优化计划

最后更新：2026-06-01

## 当前边界

当前项目的主赛道聚焦为：

```text
Best x402 + ERC-7710
```

重心声明：

```text
docs/X402_ERC7710_OPTIMIZATION_FOCUS.md
```

英文计划：

```text
docs/X402_ERC7710_TRACK_OPTIMIZATION_PLAN.md
```

本阶段不再优先优化：

```text
1. Best Use of 1Shot Permissionless Relayer
2. Best use of Venice AI
3. Best A2A coordination
4. 社交媒体 / feedback 边缘奖项
5. 生产级一键 revoke
```

1Shot 仍然是当前 settlement 实现的一部分，但在叙事上只作为支撑基础设施。
主赛道故事应该是：

```text
MetaMask Advanced Permissions
-> ERC-7710 delegation payment payload
-> x402 protected API call
-> SpendGuard policy enforcement
-> observable paid result and ledger proof
```

本阶段默认原则：

```text
让 x402 + ERC-7710 的证据链清楚、可重复、不会被误认为是 mock payment。
```

## Step 1：赛道叙事与范围锁定

### 1. 本次任务目标

锁定项目叙事，避免评委注意力被 1Shot、Venice、A2A 或 revoke 分散。

最终一句话：

```text
Agent SpendGuard lets an AI agent pay x402-protected APIs with MetaMask
Advanced Permissions and ERC-7710, while enforcing a scoped onchain spending
budget before settlement.
```

中文解释：

```text
Agent SpendGuard 让 AI agent 使用 MetaMask Advanced Permissions 和 ERC-7710
支付受 x402 保护的 API，并在 settlement 前执行 scoped onchain spending budget。
```

### 2. 最终交付物结构

```text
README.md
docs/PROJECT_CHECKLIST.md
docs/CURRENT_PROGRESS.md
docs/X402_ERC7710_OPTIMIZATION_FOCUS.md
```

预期更新：

```text
- 主赛道：Best x402 + ERC-7710
- 支撑技术：1Shot settlement、DeepSeek AI output
- 明确本阶段 non-goals
- 面向评委的短 demo script
```

### 3. 参与 Agent 分工

- **Agent 1：Prize Narrative Reviewer**
  - 对照赛道要求检查项目叙事。
  - 删除或降级会稀释主赛道的 claim。

- **Main Controller**
  - 执行最终文案修改。
  - 保持项目边界严格。

最多同时开两个 agent。

### 4. 每个 Agent 的中间产物

Reviewer 输出：

```text
- 一句话 pitch
- 三个最强 judging claims
- 三个应该避免的 claims
- 必须准备的截图 / demo beats
```

### 5. 质量验收标准

```text
1. README 明确主赛道是 Best x402 + ERC-7710。
2. 第一段同时出现 MetaMask Advanced Permissions、ERC-7710、x402。
3. 1Shot 被描述为 settlement infrastructure，不是主奖项目标。
4. Venice / A2A 不作为当前 judging claims。
5. demo script 能在 60 秒内讲明白。
```

### 6. 预计执行顺序

```text
1. 检查当前 README 和 project checklist。
2. 重写项目 pitch 和 track-fit 段落。
3. 增加 judge-facing demo script。
4. 删除或降级偏离主赛道的 claims。
5. 复读顶层文档，确认口径一致。
```

## Step 2：干净自动端到端闭环

### 1. 本次任务目标

证明当前修复后的代码可以从空状态自动跑完整条链路，不依赖手动 ledger
reconciliation。

目标流程：

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

如果发现 blocker，可修改：

```text
src/client/x402/payErc7710DeepseekRiskBrief.ts
src/server/x402/erc7710OneShotSettlement.ts
src/app/api/x402/deepseek/risk-brief/erc7710-paid-poc/route.ts
```

### 3. 参与 Agent 分工

- **Agent 2：Clean Run QA**
  - 定义 acceptance checklist。
  - 检查 logs、ledger、tx proof。

- **Main Controller**
  - 跑一次真实 browser flow。
  - 只修 blocking bugs。

### 4. 每个 Agent 的中间产物

QA 输出：

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
1. 从 reset / empty ledger 开始。
2. 不使用手动 ledger edit。
3. unpaid request 返回 402。
4. paid request 返回成功响应。
5. ledger 对本次 run 只写一条 success entry。
6. ledger txHash 等于 settlement txHash。
7. 如有代码修改，npm run typecheck 通过。
```

### 6. 预计执行顺序

```text
1. 记录当前状态快照。
2. reset app state。
3. 通过 Dashboard 跑完整路径。
4. 保存 server logs 和 /api/ledger 输出。
5. 在 Base Sepolia explorer 验证 tx。
6. 写入结果文档。
```

## Step 3：x402 Evidence Rail

### 1. 本次任务目标

把 x402 从隐藏协议细节变成评委能直接看见的产品证据。

Dashboard 应该清楚显示：

```text
- protected resource
- 402 Payment Required challenge
- selected requirement
- scheme = exact
- network = eip155:84532
- asset = Base Sepolia USDC
- amount = 10000 atomic USDC
- payTo
- payment header 只在 paid request 中提交
```

### 2. 最终交付物结构

```text
src/components/PaymentRail.tsx
src/components/AgentControls.tsx
src/components/Dashboard.tsx
src/shared/types.ts
src/app/api/_lib/demoState.ts
```

可选 server 补充：

```text
src/app/api/x402/deepseek/risk-brief/erc7710-paid-poc/route.ts
```

### 3. 参与 Agent 分工

- **Agent 3：Protocol UI**
  - 负责 x402 evidence 展示。
  - 不改 settlement 行为。

### 4. 每个 Agent 的中间产物

Protocol UI 输出：

```text
- 可见的 x402 requirement summary
- paid / unpaid request 区分
- payment header 状态
- 不夸大、不误导的 UI copy
```

### 5. 质量验收标准

```text
1. 评委能在第一屏或一次滚动内识别 402 challenge。
2. selected requirement 显示 assetTransferMethod=erc7710。
3. dry-run 明确说明没有提交 payment header。
4. paid path 明确说明已提交 payment header。
5. 不暴露 secrets，也不展示超长 raw payload。
```

### 6. 预计执行顺序

```text
1. 确认 x402 evidence 所需的最小 state 字段。
2. 如果当前 state 不够，再加 server/client projection。
3. 在 payment rail 中渲染紧凑 evidence。
4. 测试 dry-run 和 paid 状态。
5. 桌面端 browser-check layout。
```

## Step 4：ERC-7710 Proof Rail

### 1. 本次任务目标

让评委清楚看到项目不是普通 EOA x402，而是 ERC-7710 delegation payment。

UI 和日志应该暴露紧凑 proof：

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

- **Agent 4：Delegation Proof**
  - 负责 ERC-7710 proof copy 和 validation projection。
  - raw permission context 只显示短 hash，不直接展开。

### 4. 每个 Agent 的中间产物

Delegation Proof 输出：

```text
- ERC-7710 proof fields
- 地址 / hash 缩写展示规则
- 面向用户的 validation checklist
- no-secret / no-private-key review
```

### 5. 质量验收标准

```text
1. UI 能区分 delegator 和 session account。
2. UI 显示 permission context hash，而不是大段 raw blob。
3. payload validation failure 必须 fail closed。
4. 生成的 payload 必须匹配 stored grant。
5. typecheck 通过。
```

### 6. 预计执行顺序

```text
1. 检查当前 grant 和 payload state。
2. 决定哪些 proof fields 放进 Dashboard。
3. 增加紧凑 proof rail。
4. 验证地址与已成功 paid run 一致。
5. 确认没有展示 raw secrets。
```

## Step 5：一次授权，多次 Agent 支付

### 1. 本次任务目标

突出 Advanced Permissions 的核心价值：用户授权一次，agent 可以在预算内进行多次
x402 paid calls，不需要每次重新弹钱包。

目标 demo：

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

可选：

```text
src/app/api/x402/deepseek/risk-brief/erc7710-paid-poc/route.ts
```

### 3. 参与 Agent 分工

- **Agent 5：Multi-Run Flow**
  - 负责重复 in-budget run 的 UX 和 server state 正确性。

### 4. 每个 Agent 的中间产物

Multi-Run Flow 输出：

```text
- 第二次 in-budget run 的按钮 / 状态设计
- 两次 run 后的 ledger 预期
- remaining budget 计算
- over-budget acceptance case
```

### 5. 质量验收标准

```text
1. 第二次 in-budget paid run 不重新请求 Advanced Permission。
2. 每次 paid run 使用新的 child delegation / payment payload。
3. ledger 对每次成功 x402 service payment 只记录一次。
4. remaining budget 正确减少。
5. over-budget 在 paid request submission 前被阻断。
```

### 6. 预计执行顺序

```text
1. 确认当前 policy 允许多次 0.01 USDC call。
2. 调整 UI copy/buttons，让 repeat run 自然可见。
3. 验证第二次 run 使用同一个 grant。
4. 验证人工构造的大额请求会被 over-budget block。
5. 记录 multi-run 结果。
```

## Step 6：预算核算口径清晰化

### 1. 本次任务目标

避免评委质疑 SpendGuard 记录的 `0.01 USDC` 和钱包实际扣款不一致。

App 应该区分：

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

- **Agent 6：Accounting Clarity**
  - 负责 budget 和 fee 语言。
  - 除非发现 policy bug，否则不改 settlement mechanics。

### 4. 每个 Agent 的中间产物

Accounting Clarity 输出：

```text
- service price display
- relay fee display
- total wallet debit display
- 哪些金额计入 policy 的说明
- production policy note 建议
```

### 5. 质量验收标准

```text
1. UI 不能暗示 relay fee 为 0。
2. ledger service cost 保持真实。
3. 已知 relay fee 必须可见。
4. policy card 说明 fee 是否计入 spend cap。
5. docs 解释 demo accounting boundary。
```

### 6. 预计执行顺序

```text
1. 检查 settlement extra fields 中是否已有 fee data。
2. 如需要，补 shared type fields。
3. 渲染 fee 和 total debit。
4. 更新 docs 中的 accounting boundary。
5. 对照已成功 tx 验证。
```

## Step 7：失败语义与测试

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

如果不引入 test runner：

```text
docs/X402_ERC7710_E2E_RESULTS.md
  - manual/command acceptance matrix
```

### 3. 参与 Agent 分工

- **Agent 7：Failure Audit**
  - 检查 fail-closed 行为。
  - 只在能降低真实风险时添加 tests 或 smoke scripts。

### 4. 每个 Agent 的中间产物

Failure Audit 输出：

```text
- failure matrix
- test / smoke command list
- highest-risk untested behavior
- blocking fixes
```

### 5. 质量验收标准

```text
1. invalid / missing payment payload 不会运行 AI。
2. dry-run 拒绝 payment headers。
3. over-budget 在 settlement 前阻断。
4. settlement failure 不写 success ledger。
5. 1Shot status=200 且 receipt.transactionHash 时解析为 confirmed。
6. duplicate settlement / refresh 不能重复写 ledger。
```

### 6. 预计执行顺序

```text
1. 建 failure matrix。
2. 添加 focused tests 或 smoke scripts。
3. 跑 typecheck/build。
4. 跑一次 browser smoke。
5. 记录 residual risk。
```

## Step 8：最终评审包

### 1. 本次任务目标

产出最终评审材料，让评委无需读代码也能理解并验证主赛道价值。

### 2. 最终交付物结构

```text
README.md
docs/CURRENT_PROGRESS.md
docs/X402_ERC7710_E2E_RESULTS.md
docs/PROJECT_CHECKLIST.md
```

视频 / script 可以引用：

```text
http://localhost:3000
Base Sepolia explorer tx link
/api/ledger proof
```

### 3. 参与 Agent 分工

- **Agent 8：Final Reviewer**
  - 检查 demo clarity、no false claims、track fit。

### 4. 每个 Agent 的中间产物

Final Reviewer 输出：

```text
- final demo script
- required screenshot list
- judging claim checklist
- residual risk statement
```

### 5. 质量验收标准

```text
1. demo video 展示 MetaMask Advanced Permission 主流程。
2. demo video 展示 x402 402 -> paid request。
3. demo video 展示 ERC-7710 proof。
4. demo video 展示 confirmed tx / ledger proof。
5. README 清楚说明 demo boundaries。
6. submission 不包含 secrets、本地 key、private state files。
```

### 6. 预计执行顺序

```text
1. 跑最终 clean demo。
2. 捕获 screenshots 和 tx links。
3. 更新 README / project checklist。
4. 录制 demo video。
5. 做 no-secrets repo audit。
6. 以 Best x402 + ERC-7710 提交。
```

## 当前最短执行建议

如果只按最有胜率的路径推进，优先级如下：

```text
P0:
1. clean reset-to-success rerun
2. x402 evidence rail
3. ERC-7710 proof rail

P1:
4. one approval, two paid calls, third blocked
5. accounting clarity
6. failure matrix / idempotency check

P2:
7. final README / screenshots / demo script
8. no-secrets audit
```

不要在 P0/P1 完成前继续扩展 Venice、A2A、1Shot 专项叙事或生产级 revoke。
