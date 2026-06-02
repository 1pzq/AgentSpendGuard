# Agent SpendGuard 专业评审问题回应

最后更新：2026-06-02

## 总体判断

这份评审指出的问题很关键，但不是项目方向崩盘。当前主要风险是：

- ERC-7710 链上 redeem 证据没有在项目介绍中前置；
- x402 seller 边界需要更准确表达；
- Advanced Permission、SpendGuard policy 和 ERC-7710 caveats 的信任模型不能说成三个完全独立信任根；
- Agent Spending Decision Layer 需要被定义为 intent / audit layer，而不是安全 oracle；
- 本地 ledger 只能作为 demo 证据索引，不能被包装成防篡改审计系统。

修正策略：少说抽象安全叙事，多展示链上证据和精确信任边界。

## 1. ERC-7710 是否只是贴标签

### 判断

不是纯贴标签。当前 paid path 会构造并提交：

```text
DelegationManager.redeemDelegations(bytes[],bytes32[],bytes[])
```

链上证据：

```text
DelegationManager: 0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3
function selector: 0xcef6d209
network: Base Sepolia
```

示例 tx：

```text
0x62e550bd889a8eeb72b72633371bd4be8118cd6026ad330ffeb0957d18b0aec0
```

该 tx 的 `to` 为 DelegationManager，input selector 为 `0xcef6d209`，receipt
status 为成功。

### 已采取修正

- 在 `docs/PROJECT_INTRODUCTION_CN.md` 补充 ERC-7710 redeem 证据。
- 在 `docs/JUDGE_SUBMISSION_OVERVIEW_CN.md` 补充 DelegationManager、selector、验证命令。
- 新增 Dashboard `Chain Evidence` 面板，直接展示 DelegationManager、function selector、tx link、payload context hash。
- 新增 `npm run verify:chain-evidence`，通过 Base Sepolia RPC 验证 tx 和 USDC transfer。
- 新增 `GET /api/evidence/chain`，Dashboard 可以通过前端按钮触发同一套链上验证。

### 现场回答

> 我们的 ERC-7710 delegation 在 Base Sepolia 的 DelegationManager 上 redeem。示例交易 `0x62e550...aec0` 的 `to` 是 `0xdb9B...7dB3`，selector `0xcef6d209` 对应 `redeemDelegations(bytes[],bytes32[],bytes[])`。这不是只做本地验签；链上交易成功后才写入 paid ledger。

## 2. x402 是否只是自定义付费代理

### 判断

项目不应该宣称 DeepSeek 是 x402 seller。准确说法是：

```text
SpendGuard is the x402 seller.
DeepSeek is the downstream AI provider after settlement.
```

这仍然是合理 x402 使用方式：x402 保护的是 SpendGuard 自己提供的 paid risk-brief API；
该 API 在结算成功后调用 DeepSeek 生成业务结果。

### 修正动作

- 所有文档统一表达为 `Agent SpendGuard paid risk-brief API` 是 seller。
- Dashboard 保留 seller boundary：签发 402、验证 ERC-7710 payload、settlement 后放行业务响应。
- 后续可增加一个标准 x402 client smoke，证明 endpoint 能被 `@x402/core` client 按标准 402 / paid request 流程访问。

### 现场回答

> 我们没有说 DeepSeek 官方原生支持 x402。我们的 x402 seller 是 SpendGuard paid risk-brief API。x402 的作用是标准化这个 HTTP paid resource 的发现和支付提交；DeepSeek 是付款成功后由 seller 调用的 downstream provider。

## 3. Advanced Permission 是否有链上约束力

### 判断

需要更精确：MetaMask Advanced Permission / ERC-7710 caveats 是链上可 redeem 的授权材料，
但 SpendGuard 的业务预算和 ledger 是应用层控制。不能把所有安全性都说成完全链上强制。

当前更准确的信任模型：

```text
MetaMask Advanced Permission + ERC-7710 caveats: 限制可 redeem 的链上能力
SpendGuard policy guard: 执行业务策略和付款前守门
x402: 标准 HTTP 付费 challenge / paid request 封装
ledger: demo 证据索引，不是防篡改审计根
```

### 修正动作

- 文档已改为“链上 delegation/caveat 限制最大支付能力；SpendGuard 执行业务策略”。
- 不再把三层边界包装成三个完全独立信任根。
- UI 的 Chain Evidence 面板将链上证据与应用层 ledger 分开展示。

### 现场回答

> SpendGuard policy 是应用层安全边界，我们不把它包装成无需信任的链上合约。链上部分负责限制实际能通过 ERC-7710 redeem 的支付能力；应用层负责 agent intent、endpoint、预算和 ledger 展示。两者组合起来是 bounded payment demo，而不是完整 production trustless payment protocol。

## 4. Agent Decision Layer 是否会被 prompt injection 绕过

### 判断

Agent decision 不能作为安全 oracle。它的价值是付款前 intent 和事后审计，而不是判断“这个理由是否真实可靠”。

如果 prompt injection 让 agent 输出 `decision=spend`，SpendGuard 仍只能保证：

- amount 不超策略；
- token / network / payTo / endpoint 匹配；
- payload 与 Advanced Permission 匹配；
- 预算内才进入 x402 paid flow。

SpendGuard 不能保证 agent 的自然语言理由一定无恶意。

### 修正动作

- 文档已明确：Agent Decision 是 intent / audit layer，不是硬安全边界。
- hard enforcement 只来自 policy guard、x402 requirement、ERC-7710 payload 和 caveats。
- 后续增强可以加入 task allowlist、confidence gating、低置信度人工确认、prompt-injection classifier。

### 现场回答

> Agent decision 不被当作安全 oracle。它只是让 agent 在付款前表达 intent，并把理由写入 UI / ledger。真正阻断付款的是 SpendGuard policy 和 ERC-7710 caveats。prompt injection 可能诱导 agent 想花钱，但不能绕过金额、token、network、payTo、endpoint 和预算约束。

## 5. 本地 ledger 是否削弱可审计性

### 判断

本地 ledger 不能被包装成防篡改 audit trail。它只能是 demo UX 和证据索引。真正可验证证据应该是：

- Base Sepolia tx receipt；
- DelegationManager `redeemDelegations` call；
- payload context hash；
- USDC Transfer logs；
- x402 payment requirement。

### 修正动作

- 新增 `npm run verify:chain-evidence`，用 RPC 验证链上证据。
- 文档中明确 ledger 不是生产级持久化审计系统。
- 后续可把 ledger 升级为 SQLite 或 append-only hash-chain JSONL，并保留 chain evidence bundle。

### 现场回答

> 当前 ledger 是 demo 证据索引，不是防篡改审计系统。可验证事实来自链上 tx receipt 和 USDC Transfer logs。我们提供脚本从 Base Sepolia RPC 重放验证这些证据。

## 下一步优先级

1. 用新增 Chain Evidence 面板录一遍演示，确保评委第一眼看到 tx、DelegationManager 和 selector。
2. 在提交材料中同时写清楚前端按钮和 `npm run verify:chain-evidence` 两种验证方式。
3. 补一个标准 x402 client interoperability smoke，强化“不是私有 HTTP 协议”。
4. 把 ledger 升级为更持久的 SQLite 或 append-only JSONL，降低本地 demo persistence 的扣分风险。
