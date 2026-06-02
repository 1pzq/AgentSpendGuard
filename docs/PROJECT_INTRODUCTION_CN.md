# Agent SpendGuard 项目介绍

最后更新：2026-06-02

## 一句话介绍

Agent SpendGuard 是一个面向 AI agent 的链上支出控制层：用户通过
MetaMask Advanced Permissions 给 agent 一个有限额、有时间窗口、有使用
范围的支付权限；agent 在调用 x402 保护的付费 API 前，必须先做支出决策，
再经过 SpendGuard 的策略校验，最后用 ERC-7710 delegation payment payload
完成可证明的链上支付。

项目核心叙事：

```text
AI decides when to spend.
SpendGuard decides whether it may spend.
x402 + ERC-7710 proves how it spent.
```

## 项目要解决的问题

AI agent 正在从“只生成内容”走向“可以执行任务”。一旦 agent 需要调用付费
API、购买数据、执行链上服务，用户就会遇到一个安全问题：怎样让 agent 能花钱，
但不能乱花钱？

常见做法都有明显风险：

- 把主钱包私钥或 session key 交给 agent，风险过大。
- 给 agent 无限 ERC-20 allowance，事后才发现支出失控。
- 由中心化后端代付，用户难以审计每次支出的真实边界。
- 只在前端显示预算，但付款路径本身没有协议级证据。

Agent SpendGuard 的目标是证明另一种模式：AI agent 可以拥有受控支付能力，
但每次支付都必须满足用户授权、SpendGuard 策略、x402 requirement 和 ERC-7710
payload 约束，并且能在账本和链上交易中被追踪。

## 解决方案

Agent SpendGuard 把 agent 支付拆成三层边界：

1. 用户授权边界：用户通过 MetaMask Advanced Permissions 批准一个 scoped
   permission，例如 Base Sepolia USDC、1.00 USDC / 24h、指定用途和时间窗口。
2. SpendGuard 策略边界：服务端在付款前检查预算、endpoint、token、network、
   payTo、金额、payload context hash 和 agent 决策结果。
3. 协议支付边界：实际 paid request 通过 x402 触发 402 challenge，并使用
   ERC-7710 delegation payment payload 完成结算和证明。

这样，agent 获得的不是用户钱包的完整控制权，而是一个可限制、可观察、可撤销、
可审计的执行能力。

## 当前 Demo 链路

当前项目是一个本地 Next.js demo，运行在 Base Sepolia 测试网，主赛道聚焦：

```text
Best x402 + ERC-7710
```

核心演示流程：

1. 用户连接 MetaMask，并确认在 Base Sepolia。
2. 用户批准一个 MetaMask Advanced Permission，给 agent 一个有限 USDC 支出额度。
3. agent 先生成支出决策，说明是否值得为本次任务花费 0.01 USDC。
4. SpendGuard 在服务端重新执行策略校验，不信任模型自评。
5. 如果 `decision=spend` 且策略允许，前端进入 x402 paid flow。
6. SpendGuard seller endpoint 返回 x402 `402 Payment Required` challenge。
7. 客户端基于已保存的授权生成 ERC-7710 payment payload。
8. paid request 被提交，结算成功后产生 Base Sepolia tx hash。
9. SpendGuard 调用 DeepSeek 生成钱包风险简报。
10. Dashboard 展示 agent 决策、x402 requirement、ERC-7710 proof、交易和账本。
11. 如果请求超预算或不符合策略，系统会在 paid header / settlement 之前阻断。

## 关键角色

### 用户

用户拥有钱包和资金，只批准有限权限。用户不需要把主钱包私钥交给 agent，也不需要
给无限 token allowance。

### AI agent

agent 负责判断任务是否值得付费，并给出支出理由、预计成本、预算变化和置信度。
在 real mode 中，这个决策可由 DeepSeek 生成；如果 API 不可用，demo 会使用
mock fallback，保证演示不中断。

### SpendGuard

SpendGuard 是安全控制层。它不直接相信 agent 的判断，而是把 agent 的 spend intent
作为输入，再执行预算、范围、token、network、payTo 和 payload 校验。只有策略允许时，
它才允许 paid request 继续。

### x402 seller endpoint

项目实现了自己的 x402 seller endpoint：

```text
POST /api/x402/deepseek/risk-brief/erc7710-paid-poc
```

这个 endpoint 签发 x402 requirement，验证支付凭证，完成结算，并在结算成功后调用
DeepSeek。DeepSeek 是下游 AI provider，不是官方原生 x402 seller。

### MetaMask Advanced Permissions 与 ERC-7710

MetaMask Advanced Permissions 提供用户批准的父级授权。每次 paid call 会基于该授权
生成本次调用的 ERC-7710 child delegation / payment payload，用于证明本次支付没有超出
用户批准的范围。

### 1Shot relayer

1Shot 在项目中作为结算支撑基础设施。Dashboard 会把 relay fee 和 total wallet debit
与 x402 service price 分开展示，避免把 relayer 成本误认为 agent 服务预算。

## 已完成能力

- 真实 MetaMask EOA 连接与 Base Sepolia 网络约束。
- MetaMask Advanced Permission 授权路径。
- x402 protected paid risk-brief seller endpoint。
- ERC-7710 payment payload 构造、校验与结算路径。
- AI Spending Decision Layer：付款前生成并展示 agent 支出理由。
- SpendGuard policy guard：预算、金额、token、network、payTo、endpoint 校验。
- child delegation caveat inspector：展示并校验调用次数、目标、方法、时间和金额限制。
- paid route 防重放：拒绝重复 payload context hash。
- 同一 Advanced Permission 下多次 paid call 账本记录。
- 超预算请求在 paid header 和 settlement 前阻断。
- Dashboard 展示 x402 evidence、ERC-7710 proof、relay timeline、ledger accounting。
- smoke / verification 脚本覆盖关键失败路径和 P8 决策层行为。

## 当前验证结果

项目已经完成真实 Base Sepolia paid call 验证，并记录过同一 MetaMask Advanced
Permission grant 下的三次独立付费调用。每次调用都有独立 transaction hash、
payload context hash 和账本记录。

近期提交前验证通过：

```text
npm run typecheck
npm run smoke:p8
npm run lint
git diff --check
```

P8 no-spend smoke 覆盖三类关键行为：

- `decision=skip`：不提交 paid header，不产生交易。
- `decision=spend` 但超预算：付款前阻断。
- `decision=spend` 且预算允许：进入正常 precheck / paid flow。

### ERC-7710 链上 redeem 证据

当前 ERC-7710 paid path 不是只在本地构造 typed data。结算交易会提交到
MetaMask Delegation Framework 的 DelegationManager，并调用：

```text
redeemDelegations(bytes[],bytes32[],bytes[])
```

链上可核验证据：

```text
DelegationManager: 0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3
function selector: 0xcef6d209
network: Base Sepolia
asset: Base Sepolia USDC, 0x036CbD53842c5426634e7929541eC2318f3dCF7e
```

已验证 paid calls：

| Call | Basescan | Payload context hash | Service payment | Relay fee |
|---|---|---|---:|---:|
| #1 | [0x62e550...aec0](https://sepolia.basescan.org/tx/0x62e550bd889a8eeb72b72633371bd4be8118cd6026ad330ffeb0957d18b0aec0) | `0xe35522e53e9cf3c72e0150fa298e9b9446c83b91343ad6ce79da1be957481d10` | 10000 atomic USDC | 12042 atomic USDC |
| #2 | [0x9398cc...bd4e](https://sepolia.basescan.org/tx/0x9398cc02b95761f07c890a9a6346318e78ef4649c1c971659b92f4e1f9d1bd4e) | `0xf4a42c3b50e45e9e74bb3afc7c6f6691f97f41018752da0a3115e6b02110dc5f` | 10000 atomic USDC | 10626 atomic USDC |
| #3 | [0xa065cf...65d3](https://sepolia.basescan.org/tx/0xa065cfa4d2e09048ae4015e2f4a779c26de05cccae4a14af65c8356d174f65d3) | `0xe3f22f2014585830d985097d945f4a4416f732aed2999f7764fdac63554a2d8a` | 10000 atomic USDC | 10626 atomic USDC |

可复现验证命令：

```bash
npm run verify:chain-evidence
```

该脚本会通过 Base Sepolia RPC 检查交易状态、`to` 地址、function selector、
USDC service payment transfer 和 1Shot relay fee transfer。

## 安全边界

Agent SpendGuard 的安全重点不是“让 agent 永远不花钱”，而是让 agent 的每次花钱都在
用户批准的能力边界内发生。

需要准确区分：项目的多层控制不是三个完全独立的信任根。MetaMask Advanced
Permission / ERC-7710 caveats 提供链上可执行的授权和调用约束；SpendGuard
policy guard 提供应用层业务策略；x402 提供 HTTP 付费发现和 paid request
封装。用户仍然需要信任 SpendGuard seller 正确执行业务策略，但链上 delegation
和 caveats 会限制它能从用户授权中实际 redeem 的支付能力。

当前安全边界包括：

- 无主钱包私钥托管。
- 无无限 ERC-20 allowance。
- 付款前策略检查，而不是付款后告警。
- paid route 要求存在允许的 agent decision。
- paid route 要求 payload 与保存的 Advanced Permission 和 x402 requirement 匹配。
- 超预算路径不提交 paid header，不触发 settlement。
- ledger 保存 success / blocked 记录和 agentDecision rationale。

Agent Spending Decision Layer 也不是安全 oracle。它的作用是让 agent 在付款前表达
“为什么要花钱”的 intent，并把这个 intent 写入 UI 和 ledger。真正的硬约束仍然是
SpendGuard policy guard、x402 requirement、ERC-7710 payload 和链上 caveats。
如果 agent 受到 prompt injection 影响而输出 `decision=spend`，SpendGuard 仍会按
金额、token、network、payTo、endpoint 和预算执行硬校验。

## 当前边界与未完成事项

当前版本仍是 hackathon MVP，不是生产级支付系统。已知边界：

- ledger 和 policy state 使用本地 demo persistence，不是生产数据库。
- revoke 能力依赖用户 MetaMask 版本；如果钱包不支持直接 revoke，需要用户在
  MetaMask 中手动撤销后同步状态。
- settlement failure 路径是 fail-closed 结构，但还没有专门构造一个“payload 有效、
  只在 settlement 阶段失败”的完整 fixture。
- 真实 paid run 仍保留浏览器确认步骤，避免 demo 环境下误触发链上支出。

## 项目价值

Agent SpendGuard 展示了一种 AI agent 经济活动的基础能力：agent 可以自主判断是否要
购买一个服务，但它的支付权限来自用户明确批准的 scoped permission；每一次花费都要在
付款前经过 SpendGuard 校验，并通过 x402 + ERC-7710 留下可验证证据。

这让 agent 支付从“不透明的自动扣款”变成了一个可以授权、限制、观察、审计和阻断的
协议化流程。
