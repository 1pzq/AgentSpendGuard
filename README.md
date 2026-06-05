# Agent SpendGuard

Agent SpendGuard is a bounded onchain spending-control layer for AI agents.

```text
AI decides when to spend.
SpendGuard decides whether it may spend.
x402 + ERC-7710 proves how it spent.
```

Target track: Best x402 + ERC-7710
Event context: MetaMask Smart Accounts Kit x 1Shot API x Venice AI Dev Cook-Off

Standalone submission documents:

- Chinese: [docs/HACKATHON_SUBMISSION_CN.md](docs/HACKATHON_SUBMISSION_CN.md)
- English: [docs/HACKATHON_SUBMISSION_EN.md](docs/HACKATHON_SUBMISSION_EN.md)

---

# 中文版本

## Agent SpendGuard 黑客松参赛介绍

目标赛道：Best x402 + ERC-7710
赛事背景：MetaMask Smart Accounts Kit x 1Shot API x Venice AI Dev Cook-Off

### 1. 项目一句话 Pitch

Agent SpendGuard 为 AI Agent 提供一个受限的链上支出账户：Agent 可以通过 MetaMask Advanced Permissions 和 ERC-7710 购买 x402 保护的 API，但每一笔支付都会在结算前被策略校验，并在结算后留下可追踪证据。

```text
AI decides when to spend.
SpendGuard decides whether it may spend.
x402 + ERC-7710 proves how it spent.
```

### 2. 解决的核心问题

AI Agent 正在从“生成内容”进入“执行付费任务”：调用高级模型、购买风险报告、获取付费数据、支付执行服务。问题是，如果把过大的支付权限交给 Agent，用户会暴露在不可控支出风险里。

现有方案对 autonomous agent 不够安全：

- 托管私钥会让 Agent 或后端直接控制用户钱包。
- 无限 ERC-20 allowance 会让 Agent 先超支，用户只能事后发现。
- 中心化后端代付会隐藏每次扣款对应的真实请求。
- 只在前端显示预算不是支付约束，付款轨道本身仍可能不受限。
- 付款后监控只能事后报警，Agent 支付安全需要付款前阻断。
- x402 让 HTTP API 可以收费，但 Agent 仍然需要一种 delegated、scoped、revocable 的支付能力，而不是接触用户主钱包权限。

SpendGuard 补上的是 Agent intent 和 x402 settlement 中间缺失的安全层：用户授予一个窄范围支出能力，Agent 提出支出请求，SpendGuard 在 paid x402 request 提交前校验预算、endpoint、token、network、payTo、payload 和 caveats。

### 3. 解决方案概述

Agent SpendGuard 是一个面向 AI Agent 的链上支出控制层。用户连接 MetaMask 后批准一个 scoped MetaMask Advanced Permission，例如 Base Sepolia 上 `1.00 USDC / 24h` 的钱包风险简报预算。当 Agent 想调用付费 API 时，它先生成支出决策，说明为什么要花钱、预计成本是多少。SpendGuard 随后执行硬策略校验。只有请求被允许时，客户端才会向 SpendGuard x402 seller endpoint 请求 challenge，基于已保存的 MetaMask 授权构造 ERC-7710 delegation payment payload，并提交 paid request。结算通过 ERC-7710 路径执行；当真实 1Shot relay mode 开启时，1Shot 作为 relayer/facilitator 支撑结算。结算成功后，下游 AI provider 返回风险简报，Dashboard 记录 x402 requirement、ERC-7710 payload hash、transaction hash、relay fee、service price 和 remaining budget。

这不是“给 Agent 一个钱包”。这是给 Agent 一个可度量、可撤销、付款前可拦截的支付能力。

### 4. 技术架构

#### 协议流程

```text
[User + MetaMask]
  -> 通过 MetaMask Smart Accounts Kit
     批准 scoped ERC-20 periodic Advanced Permission

[AI Agent]
  -> 生成 spend intent:
     decision, reason, estimatedCostAtomic, confidence

[SpendGuard Policy Guard]
  -> 校验 budget, endpoint, method, token, chain, payTo,
     permission status, prior ledger spend, agent decision
  -> 在任何 x402 PAYMENT header 生成前阻断不安全请求

[SpendGuard x402 Seller Endpoint]
  -> 返回 HTTP 402 Payment Required
  -> 要求 scheme=exact, network=eip155:84532,
     asset=Base Sepolia USDC, assetTransferMethod=erc7710

[Client x402 + ERC-7710 Builder]
  -> 使用 @metamask/x402 和 MetaMask Smart Accounts Kit
  -> 为本次调用构造新的 ERC-7710 child delegation payment payload
  -> 添加 target, method, amount, timestamp, call count 等 caveats

[Server Verification + Preflight]
  -> 校验 requirement, grant, delegator, delegation manager,
     payload context hash, caveats, replay safety

[1Shot / ERC-7710 Settlement Path]
  -> 估算 relay requirement
  -> real 1Shot mode 下提交并轮询 ERC-7710 execution
  -> 产生 Base Sepolia transaction hash

[AI Provider]
  -> settlement 成功后执行 paid risk-brief task

[Dashboard + Ledger]
  -> 展示 x402 requirement, ERC-7710 proof, tx hash,
     1Shot fee, service price, total wallet debit, budget remaining
```

#### 组件角色

| 组件 | 在 SpendGuard 中的角色 | 具体实现 |
|---|---|---|
| MetaMask Smart Accounts Kit | 权限申请与 delegation 环境。用户批准 scoped ERC-20 periodic Advanced Permission，而不是给 Agent 私钥或无限 allowance。 | `src/client/permissions/metamaskAdvancedPermissions.ts` 使用 `@metamask/smart-accounts-kit`、`erc7715ProviderActions`、`ERC20PeriodTransferEnforcer`、`decodeDelegations` 和 `hashDelegation`。 |
| MetaMask Advanced Permissions | 父级授权边界。保存的 grant 记录 delegator、session account/redeemer、token、period amount、expiry、delegation manager 和 permission context。 | Policy guard 要求 `source="metamask-erc7715"` 且 `permissionType="erc20-token-periodic"` 才允许 paid execution。 |
| x402 | HTTP 付费发现和 paid request 包装。Seller endpoint 签发 `402 Payment Required`，只有支付验证和结算成功后才返回 AI 结果。 | `src/server/x402/erc7710PaidPocResourceServer.ts` 注册 `x402ExactEvmErc7710ServerScheme`；保护路由是 `POST /api/x402/deepseek/risk-brief/erc7710-paid-poc`。 |
| ERC-7710 | x402 payment payload 内的 delegated payment execution。每次 paid call 都生成新的 child delegation 和 payment caveats。 | `src/client/x402/payErc7710DeepseekRiskBrief.ts` 使用 `x402Erc7710Client`、`createDelegation`、`signDelegation` 和 encoded delegation payloads。 |
| SpendGuard Policy Guard | 应用层支付防火墙。在允许 paid execution 前重新校验 Agent 决策和所有 payment requirement。 | `src/server/agent-runner/policyGuard.ts` 和 paid PoC route 会阻断非法 amount、endpoint、token、network、payTo、过期权限、旧 payload 或被拒绝的 agent decision。 |
| 1Shot API | ERC-7710 settlement infrastructure 和 relayer accounting。real mode 下，SpendGuard 请求 fee data、估算 `7710` transaction、提交交易并轮询 task status。 | `src/server/x402/erc7710OneShotSettlement.ts` 和 `src/server/adapters/oneShotAdapter.ts` 实现 `getFeeData`、`estimate7710`、`send7710` 和 `getStatus`。 |
| Venice AI provider slot | settlement 之后执行的下游 paid AI task。支付层 provider-agnostic，因此 risk-brief 任务可以切换到配置的模型提供方，而不改变 x402/ERC-7710 安全语义。 | 仓库包含 `AI_PROVIDER=venice` 配置、Venice env 字段和 mock Venice-compatible result adapter。当前 live-validated real AI path 使用 DeepSeek；Venice mode 是可替换的 demo/provider slot。 |
| Chain Evidence Verifier | 给评委看的链上证据验证器，证明 settlement 进入 ERC-7710 onchain execution path。 | `src/server/chain-evidence/verifyChainEvidence.ts` 校验 Base Sepolia receipts、DelegationManager target、`redeemDelegations` selector、USDC service transfer 和 1Shot relay fee transfer。 |

#### 关键链上与支付参数

| 参数 | 值 |
|---|---|
| Network | Base Sepolia, `eip155:84532` |
| Payment asset | Base Sepolia USDC, `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| Demo service price | `10000` atomic USDC，即 `0.01 USDC` |
| Demo budget | `1.00 USDC / 24h` |
| x402 scheme | `exact` |
| x402 transfer method | `erc7710` |
| ERC-7710 execution target | MetaMask DelegationManager `0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3` |
| Onchain function proof | `redeemDelegations(bytes[],bytes32[],bytes[])`, selector `0xcef6d209` |
| 1Shot Base Sepolia target | `0xf1ef956eff4181Ce913b664713515996858B9Ca9` |
| 1Shot fee collector | `0xE936e8FAf4A5655469182A49a505055B71C17604` |

### 5. 核心 Demo 流程

1. 打开 Agent SpendGuard Dashboard，说明目标：Agent 可以为 API 付费，但只能在用户批准的预算内付费。
2. 连接 MetaMask，并切换或确认 Base Sepolia。
3. 批准 scoped MetaMask Advanced Permission：Base Sepolia USDC、`1.00 USDC / 24h`、risk-brief endpoint scope、session account/redeemer、expiry，并强调不是无限 allowance。
4. 启动 Agent。Agent 生成 spend decision：`decision=spend`、reason、estimated cost、budget before、projected budget after 和 confidence。
5. SpendGuard 执行 policy guard，在任何 paid x402 header 提交前校验 permission status、budget、endpoint、method、network、token、payTo 和 agent decision。
6. 客户端向 SpendGuard x402 seller 发起 unpaid request。Seller 返回带有 `scheme=exact` 和 `assetTransferMethod=erc7710` 的 `402 Payment Required`。
7. 客户端基于已保存的 MetaMask Advanced Permission 构造新的 ERC-7710 payment payload。Dashboard 展示 payload proof、child delegation target、payload context hash 和 required caveats。
8. SpendGuard 执行 local/server preflight checks，然后用户确认真实 testnet spend。paid x402 request 被提交，ERC-7710 settlement path 产生 Base Sepolia transaction hash。
9. settlement 后返回 AI risk brief。Dashboard 记录 service price、1Shot relay fee、total wallet debit、tx hash、remaining budget 和 ledger row。
10. 再运行第二次或第三次调用，展示一个 permission 支撑多次独立 paid calls；随后运行 oversized request，展示该请求在 paid header 和 settlement 前被阻断，`txHash=null` 且没有 wallet debit。

### 6. 技术亮点与创新点

#### 6.1 Agent Intent 与 Payment Authority 分离

Agent 可以建议支出，但不能自己完成结算。只有当 `decision=spend` 且 policy check 为 `allowed` 时，SpendGuard 才会继续。如果模型被 prompt injection 诱导提出不安全支出，硬策略仍会按 amount、endpoint、token、chain、payTo、permission status 和 budget 阻断。

#### 6.2 x402 是真实 Seller 边界

x402 seller 是 SpendGuard paid risk-brief API，而不是模糊的“AI API payment”占位符。受保护路由会签发具体 x402 requirement，并且只有 x402 verification 和 settlement 成功后才记录支付。UI 明确区分：

- x402 seller: Agent SpendGuard paid risk-brief API
- downstream AI provider: settlement 后执行的模型
- payment asset: Base Sepolia USDC
- transfer method: ERC-7710

#### 6.3 ERC-7710 Child Delegations 按调用加固

每次 paid call 都使用新的 child delegation 和 payload context hash。child delegation 包含与本次支付相关的 caveats：

- `limitedCalls`
- `valueLte`
- `allowedTargets`
- `allowedMethods`
- `timestamp`
- `erc20TransferAmount`

服务端会在 settlement 前 decode 并校验这些 caveats。缺失或不匹配都会 fail closed。

#### 6.4 一次授权支持多次受控调用

Demo 证明了真实 Agent 场景需要的能力：用户不必每次 API 调用都重新授权，但 Agent 也不能无限花钱。同一个 MetaMask Advanced Permission grant 已经支撑三次独立 paid calls，每次都有独立 ERC-7710 payload context hash 和 Base Sepolia transaction hash。

已验证 paid calls：

| Call | Base Sepolia transaction | Payload context hash | Service payment | Relay fee |
|---|---|---|---:|---:|
| #1 | `0x62e550bd889a8eeb72b72633371bd4be8118cd6026ad330ffeb0957d18b0aec0` | `0xe35522e53e9cf3c72e0150fa298e9b9446c83b91343ad6ce79da1be957481d10` | `10000` atomic USDC | `12042` atomic USDC |
| #2 | `0x9398cc02b95761f07c890a9a6346318e78ef4649c1c971659b92f4e1f9d1bd4e` | `0xf4a42c3b50e45e9e74bb3afc7c6f6691f97f41018752da0a3115e6b02110dc5f` | `10000` atomic USDC | `10626` atomic USDC |
| #3 | `0xa065cfa4d2e09048ae4015e2f4a779c26de05cccae4a14af65c8356d174f65d3` | `0xe3f22f2014585830d985097d945f4a4416f732aed2999f7764fdac63554a2d8a` | `10000` atomic USDC | `10626` atomic USDC |

可用以下命令复验：

```bash
npm run verify:chain-evidence
```

#### 6.5 1Shot Relay Fee 与 Agent Budget 分账

SpendGuard 不把 relay cost 混进 Agent budget。Ledger 会区分：

- x402 service price：计入 Agent budget
- 1Shot relay fee：作为 settlement infrastructure cost 展示
- total wallet debit：service price + relay fee
- remaining budget：按策略定义的 service price 递减

这对评审很重要，因为它说明项目清楚区分 API monetization、relayer compensation 和 user accounting。

#### 6.6 Fail-Closed Payment Semantics

不安全路径不会产生 success ledger entry。Oversized request 会在 payment header 构造前阻断。重复 payload context hash 会被拒绝。缺失 ERC-7710 payload 时只返回 unpaid x402 response。Dry-run route 会拒绝 payment header。只有 settlement callback 成功后，系统才记录 settlement success。

#### 6.7 Judge-Visible Evidence Rails

Dashboard 不是黑盒，它直接展示：

- x402 protected resource 和 selected requirement
- `scheme=exact`
- `assetTransferMethod=erc7710`
- token、amount、network、payTo
- MetaMask Advanced Permission summary
- child delegation target 和 caveats
- ERC-7710 payload context hash
- 1Shot task 和 fee data
- Base Sepolia tx hash
- ledger accounting 和 remaining budget
- blocked row evidence，显示 no paid header 和 no tx

### 7. 赛道资格自查

✅ Requirement: 使用 MetaMask Smart Accounts 或 Advanced Permissions 执行基于 ERC-7710 的 x402 调用。

Agent SpendGuard 使用 MetaMask Smart Accounts Kit Advanced Permissions 作为父级授权层，并为 paid calls 构造 ERC-7710 x402 payment payload。paid path 使用 `@metamask/smart-accounts-kit`、`@metamask/x402` 和 `@x402/core`。

✅ Requirement: Demo 中需展示 MetaMask Smart Accounts Kit 的真实实现。

Demo 会请求并保存真实 MetaMask Advanced Permission grant，把 grant 与策略做匹配校验，decode delegation context，并使用该 grant 构造 ERC-7710 x402 payload。相关实现位于 `src/client/permissions/metamaskAdvancedPermissions.ts` 和 `src/client/x402/payErc7710DeepseekRiskBrief.ts`。

✅ Requirement: 使用 ERC-7710 执行 x402 calls。

x402 seller endpoint 要求 `extra.assetTransferMethod="erc7710"`，并注册 `x402ExactEvmErc7710ServerScheme`。客户端筛选 ERC-7710 requirement，构造 delegation payment payload，并通过 x402 HTTP client 提交 paid request。

✅ Requirement: 展示协议证据，而不只是 UI 状态。

项目包含已确认的 Base Sepolia transactions，这些交易调用 MetaMask DelegationManager `redeemDelegations(...)`；同时提供 chain evidence verifier，校验 receipt status、function selector、USDC service transfer 和 relay fee transfer。

✅ Requirement: 若使用 1Shot API，需清晰说明其具体用途。

1Shot 被用作 ERC-7710 settlement/relayer path。real mode 下，SpendGuard 会调用 1Shot 获取 fee data、估算 7710 transaction、提交 transaction 并轮询 task status。Dashboard 展示 1Shot fee、task state、tx hash 和 total wallet debit。

✅ Requirement: 保持 AI provider 角色清晰。

AI provider 在 settlement 后运行，不被宣称为 x402 seller。仓库包含 Venice-compatible provider slot 和 mock adapter；当前已真实验证的 model path 是 DeepSeek。这样可以让评分核心 x402/ERC-7710 path 不依赖 provider 可用性，同时保留 AI Agent 用例。

✅ Requirement: 展示安全行为。

Demo 包含 oversized request path，该路径会在 paid x402 header 或 settlement request 前阻断。Ledger 将其记录为 blocked，且没有 tx hash 和 wallet debit。

### 8. 当前实现状态

#### 真实实现并已验证

| 区域 | 状态 |
|---|---|
| MetaMask wallet connection | 已实现真实 MetaMask detection、account read 和 Base Sepolia network enforcement。 |
| MetaMask Advanced Permission request | 已使用 Smart Accounts Kit 和 ERC-20 periodic permission semantics 实现。 |
| x402 seller endpoint | 已实现 `POST /api/x402/deepseek/risk-brief/erc7710-paid-poc`。 |
| ERC-7710 x402 client path | 已使用 `x402Erc7710Client`、generated child delegations 和 paid x402 submission 实现。 |
| Server-side ERC-7710 verification | 已实现 requirement match、grant match、delegator match、delegation manager match、caveat validation 和 payload freshness。 |
| Base Sepolia settlement evidence | 已实现并记录多笔 tx hashes。 |
| 1Shot-supported settlement path | 已接入 real-mode adapter，并在 tx/fee evidence 中体现。Mock mode 是默认安全本地 demo 模式。 |
| AI spending decision layer | 已在 paid request submission 前实现。 |
| Over-budget blocking | 已验证在 paid header/settlement 前阻断。 |
| Ledger and dashboard evidence | 已展示 service price、relay fee、total wallet debit、tx hash、payload hash 和 remaining budget。 |
| Verification scripts | 已实现 `npm run p7:verify`、`npm run smoke:p3`、`npm run smoke:p8`、`npm run verify:chain-evidence`。 |

#### Demo 或 Feature-Flagged 边界

| 区域 | 边界 |
|---|---|
| Production persistence | Ledger 和 permission state 使用本地 demo persistence，不是生产数据库。 |
| Real 1Shot calls | 由 `ONESHOT_MODE=real`、`ONESHOT_REAL_CALLS_ENABLED=true` 和 server-side 1Shot configuration 控制。Mock mode 是默认安全模式。 |
| Venice AI | 架构中有 provider slot 和 Venice mock/result path。真实 Venice adapter 不是当前 live-validated AI path；当前 paid route 的真实 adapter 使用 DeepSeek。 |
| Revoke | App 会尝试 `wallet_revokeExecutionPermission` 并同步 wallet truth。Direct revoke support 依赖用户 MetaMask build；fallback 是用户在 MetaMask 中手动 revoke 后同步。 |
| Settlement failure fixture | Route 结构是 fail-closed，但项目还没有一个 live fixture 专门构造 valid ERC-7710 payload 并只在 settlement 阶段失败。 |
| Real spend UX | 真实 paid run 包含 post-preflight browser confirmation，避免 demo 中一次诊断点击误花 testnet USDC。 |

### 9. 未来扩展方向

Agent SpendGuard 可以扩展成 autonomous agents 的通用支出控制平面：

- 将 Venice AI real adapter 作为第一流 post-settlement provider，用于 privacy-preserving agent analysis。
- 构建 Agent tool marketplace，让每个工具公开 x402 price，并由 SpendGuard policy 定义 Agent 可购买的工具范围。
- 将 policy 和 ledger state 从本地 persistence 迁移到生产数据库，并加入 signed policy snapshots。
- 增加 onchain policy registry，让 budgets、scopes 和 revocations 可被独立审计。
- 支持 multi-agent budgets，由 manager agent 向 worker agents 分配子预算。
- 增加 dynamic risk scoring，在 Agent、endpoint 或 wallet 行为异常时自动降低限额。
- 从 USDC risk-brief payments 扩展到 data APIs、model inference、simulation services、relayer services 和 autonomous SaaS subscriptions。
- 增加 recurring spending windows、per-endpoint caps 和 emergency global pause controls。
- 构建 x402 + ERC-7710 developer tooling，让 paid-agent 应用可以把 SpendGuard 作为 policy middleware 复用，而不是自己重写预算逻辑。

长期判断很简单：如果 AI Agent 要参与 crypto-economic activity，支付权限必须默认 delegated、scoped、observable 和 revocable。Agent SpendGuard 用 MetaMask Advanced Permissions、x402、ERC-7710 和 relay-aware settlement ledger 展示了这种模式。

---

# English Version

## Agent SpendGuard Hackathon Submission

Target track: Best x402 + ERC-7710
Event context: MetaMask Smart Accounts Kit x 1Shot API x Venice AI Dev Cook-Off

### 1. Project One-Line Pitch

Agent SpendGuard gives AI agents a bounded onchain spending account: they can buy x402-protected APIs through MetaMask Advanced Permissions and ERC-7710, but every payment is policy-checked before settlement and fully traceable after settlement.

```text
AI decides when to spend.
SpendGuard decides whether it may spend.
x402 + ERC-7710 proves how it spent.
```

### 2. Core Problem

AI agents are starting to do paid work: call premium models, buy risk reports, fetch proprietary data, and pay for execution services. The unsafe default is to give the agent too much payment power.

Current approaches are not good enough for autonomous agents:

- Private-key custody gives the agent or backend direct wallet control.
- Unlimited ERC-20 approvals let an agent overspend before the user notices.
- Centralized backend billing hides which exact request caused each debit.
- Frontend-only budgets are not payment constraints. They can look safe while the payment rail remains unbounded.
- Post-payment monitoring catches damage after settlement. Agent payment safety needs pre-payment blocking.
- x402 makes HTTP APIs payable, but an agent still needs a delegated, scoped, revocable way to pay without touching the user's main wallet authority.

SpendGuard addresses the missing layer between agent intent and x402 settlement: the user grants a narrow spending capability, the agent proposes a spend, and SpendGuard verifies budget, endpoint, token, network, payTo, payload, and caveats before a paid x402 request is submitted.

### 3. Solution Overview

Agent SpendGuard is an onchain spending-control layer for AI agents. A user connects MetaMask and approves a scoped MetaMask Advanced Permission, for example `1.00 USDC / 24h` on Base Sepolia for a wallet risk-brief agent. When the agent wants to call a paid API, it first produces a spending decision with a reason and estimated cost. SpendGuard then enforces the hard policy. If the request is allowed, the client requests an x402 challenge from the SpendGuard seller endpoint, constructs an ERC-7710 delegation payment payload from the stored MetaMask permission, and submits the paid request. Settlement is executed through the ERC-7710 path, with 1Shot used as the relayer/facilitator path when real relay mode is enabled. After settlement, the downstream AI provider returns the risk brief and the dashboard records the x402 requirement, ERC-7710 payload hash, transaction hash, relay fee, service price, and remaining budget.

The result is not "an agent with a wallet." It is an agent with a measurable, revocable, pre-checked payment capability.

### 4. Technical Architecture

#### Protocol Flow

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

#### Component Roles

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

#### Key Onchain and Payment Parameters

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

### 5. Core Demo Flow

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

### 6. Technical Highlights and Innovation

#### 6.1 Agent Intent Is Separated From Payment Authority

The agent can recommend a spend, but it cannot settle by itself. SpendGuard only proceeds when `decision=spend` and the policy check is `allowed`. If the model is manipulated into requesting an unsafe spend, the hard policy still blocks by amount, endpoint, token, chain, payTo, permission status, and budget.

#### 6.2 x402 Is Used as a Real Seller Boundary

The x402 seller is the SpendGuard paid risk-brief API, not a vague "AI API payment" placeholder. The protected route issues a concrete x402 requirement and records payment only after x402 verification and settlement succeed. The UI explicitly distinguishes:

- x402 seller: Agent SpendGuard paid risk-brief API
- downstream AI provider: the model that runs after settlement
- payment asset: Base Sepolia USDC
- transfer method: ERC-7710

#### 6.3 ERC-7710 Child Delegations Are Hardened Per Call

Each paid call uses a fresh child delegation and payload context hash. The child delegation includes payment-specific caveats, including:

- `limitedCalls`
- `valueLte`
- `allowedTargets`
- `allowedMethods`
- `timestamp`
- `erc20TransferAmount`

The server decodes and validates these caveats before settlement. A missing or mismatched caveat fails closed.

#### 6.4 One Permission Can Support Multiple Bounded Calls

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

#### 6.5 1Shot Relay Fees Are Accounted Separately

SpendGuard does not hide relay cost inside the agent budget. The ledger separates:

- x402 service price: counted against the agent budget
- 1Shot relay fee: shown as settlement infrastructure cost
- total wallet debit: service price plus relay fee
- remaining budget: decremented by the policy-defined service price

This matters for judging because it shows the project understands the difference between API monetization, relayer compensation, and user accounting.

#### 6.6 Fail-Closed Payment Semantics

Unsafe paths do not produce successful ledger entries. Oversized requests are blocked before payment header construction. Duplicate payload context hashes are rejected. Missing ERC-7710 payloads return unpaid x402 responses. Dry-run routes reject payment headers. Settlement success is recorded only after the settlement callback succeeds.

#### 6.7 Judge-Visible Evidence Rails

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

### 7. Track Qualification Self-Check

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

### 8. Current Implementation Status

#### Real and Live-Validated

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

#### Demo or Feature-Flagged Boundaries

| Area | Boundary |
|---|---|
| Production persistence | Ledger and permission state use local demo persistence, not a production database. |
| Real 1Shot calls | Guarded by `ONESHOT_MODE=real`, `ONESHOT_REAL_CALLS_ENABLED=true`, and server-side 1Shot configuration. Mock mode is the safe default. |
| Venice AI | The architecture has a provider slot and Venice mock/result path. A real Venice adapter is not the currently live-validated AI path; DeepSeek is the real adapter used after settlement in the current paid route. |
| Revoke | The app attempts `wallet_revokeExecutionPermission` and then syncs wallet truth. Direct revoke support depends on the user's MetaMask build; manual MetaMask revoke plus sync is the fallback. |
| Settlement failure fixture | The route is fail-closed by structure, but the project does not yet include a live fixture that creates a valid ERC-7710 payload and intentionally fails only at settlement. |
| Real spend UX | Real paid runs include a post-preflight browser confirmation so the demo cannot accidentally spend testnet USDC from a diagnostic click. |

### 9. Future Expansion

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
