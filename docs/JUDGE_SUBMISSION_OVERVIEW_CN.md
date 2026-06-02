# Agent SpendGuard 评审提交说明

最后更新：2026-06-02

## 一句话介绍

Agent SpendGuard 是一个面向 AI agent 的链上支出控制 demo：用户通过 MetaMask Advanced Permissions 给 agent 一个有限额、有时间窗口、有使用范围的 Base Sepolia USDC 支付权限；agent 在调用 x402 保护的付费 API 时，必须使用 ERC-7710 delegation payment payload，并在 SpendGuard 的预算和 caveat 校验通过后才能完成结算。

项目主赛道聚焦：

```text
Best x402 + ERC-7710
```

## 要解决的问题

AI agent 如果要自主调用付费 API，常见风险是用户必须把过大的支付能力交给 agent，例如：

- 让 agent 接触主钱包私钥；
- 给 agent 无限 ERC-20 allowance；
- 由中心化后端代付，用户很难看清每次支出；
- agent 超预算之后只能事后发现，而不是付款前阻断。

Agent SpendGuard 的目标是证明另一种模式：agent 可以付款，但付款能力来自用户明确批准的 scoped permission，并且每次支出都能被 x402 requirement、ERC-7710 payload、链上交易和本地账本串起来验证。

P8.5 后，项目叙事升级为：

```text
AI decides when to spend.
SpendGuard decides whether it may spend.
x402 + ERC-7710 proves how it spent.
```

## 当前已经完成的核心功能

### 1. MetaMask 钱包连接与 Base Sepolia 约束

应用支持真实 MetaMask EOA 连接，并把 demo 约束在 Base Sepolia。Dashboard 会展示钱包、网络、授权账户和支付状态，避免用户在错误网络上操作。

### 2. MetaMask Advanced Permission 授权

用户可以批准一个 ERC-20 periodic permission，用于限制 agent 的支付范围：

```text
token: Base Sepolia USDC
预算上限: 1.00 USDC / 24h
单次服务价格: 0.01 USDC
用途: DeepSeek-backed wallet risk brief
```

这里不是无限 token approval，也不是把私钥交给 agent。agent 后续付款依赖这个受限授权。

### 3. x402 protected seller endpoint

项目实现了自己的 x402 seller endpoint：

```text
POST /api/x402/deepseek/risk-brief/erc7710-paid-poc
```

这个 endpoint 会签发 x402 `402 Payment Required` challenge，声明 `scheme=exact`、`assetTransferMethod=erc7710`、Base Sepolia USDC、价格和收款地址。客户端收到 challenge 后，用已保存的 MetaMask Advanced Permission 构造 ERC-7710 payment payload，再提交 paid request。

边界说明：DeepSeek 是 settlement 成功后由 SpendGuard seller 调用的后端 AI provider，不是 DeepSeek 官方原生 x402 seller。

### 3.5 AI Spending Decision Layer

在提交 paid x402 request 之前，agent 会先生成一份支出决策：

```text
decision: spend | skip | blocked
reason: 为什么值得花这 0.01 USDC
estimatedCostAtomic: 10000
budgetBeforeAtomic: 当前剩余额度
budgetAfterAtomic: 预计支付后的剩余额度
confidence: low | medium | high
policyCheck: allowed | denied
```

DeepSeek real mode 可生成这份 decision；如果 API 不可用，服务端会使用 mock fallback，避免 demo 中断。SpendGuard 不信任模型自评，而是在模型表达 `decision=spend` 后重新执行预算、endpoint、token、network、payTo 等策略检查。只有 `decision=spend` 且 `policyCheck=allowed` 时，前端才进入现有 x402 + ERC-7710 paid flow。

Dashboard 已新增 `Agent Decision` 面板，位于 x402 payment rail 之前；ledger 的 success / blocked 记录也会保存并展示 `agentDecision.reason` 和 `policyCheck`。

### 4. ERC-7710 child delegation caveat 硬化

每次 paid call 都会生成本次调用的 child delegation。项目已经把关键限制放进 child caveats，并在 UI 和服务端校验中展示/使用：

- `limitedCalls`
- `valueLte`
- `allowedTargets`
- `allowedMethods`
- `timestamp`
- `erc20TransferAmount`

其中 `erc20TransferAmount` 会限制本次 ERC-20 转账金额上限，避免预算约束只存在于前端 JS。

### 5. 服务端 settlement 前 caveat assertion

服务端在 settlement 前会检查 ERC-7710 payload 与保存的 Advanced Permission 和 x402 requirement 是否匹配，包括：

- allowed target 是否匹配 USDC asset；
- allowed method 是否包含 ERC-20 `transfer` selector；
- timestamp 是否在 x402 timeout 窗口内；
- limited calls 是否在允许范围内；
- `erc20TransferAmount` 的 token 和金额是否覆盖本次 payment amount，且不超过父级授权额度；
- payload context hash 是否为新 payload，避免重复 payload 被当成新支付记录。

如果关键 caveat 缺失或不匹配，服务端会在 settlement 前阻断。

### 6. 同一授权下多次真实付费调用

项目已经完成同一 MetaMask Advanced Permission grant 下的三次真实 paid call。每次调用都有独立的 ERC-7710 payload context hash、独立 Base Sepolia transaction hash 和独立账本记录。

已验证交易：

| Call | Base Sepolia tx | Payload context hash | x402 service price | Relay fee | Remaining budget |
|---|---|---|---:|---:|---:|
| #1 | `0x62e550bd889a8eeb72b72633371bd4be8118cd6026ad330ffeb0957d18b0aec0` | `0xe35522e53e9cf3c72e0150fa298e9b9446c83b91343ad6ce79da1be957481d10` | 10000 atomic USDC | 12042 atomic USDC | 0.99 USDC |
| #2 | `0x9398cc02b95761f07c890a9a6346318e78ef4649c1c971659b92f4e1f9d1bd4e` | `0xf4a42c3b50e45e9e74bb3afc7c6f6691f97f41018752da0a3115e6b02110dc5f` | 10000 atomic USDC | 10626 atomic USDC | 0.98 USDC |
| #3 | `0xa065cfa4d2e09048ae4015e2f4a779c26de05cccae4a14af65c8356d174f65d3` | `0xe3f22f2014585830d985097d945f4a4416f732aed2999f7764fdac63554a2d8a` | 10000 atomic USDC | 10626 atomic USDC | 0.97 USDC |

Explorer links：

```text
https://sepolia.basescan.org/tx/0x62e550bd889a8eeb72b72633371bd4be8118cd6026ad330ffeb0957d18b0aec0
https://sepolia.basescan.org/tx/0x9398cc02b95761f07c890a9a6346318e78ef4649c1c971659b92f4e1f9d1bd4e
https://sepolia.basescan.org/tx/0xa065cfa4d2e09048ae4015e2f4a779c26de05cccae4a14af65c8356d174f65d3
```

ERC-7710 redeem proof：

```text
DelegationManager: 0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3
function: redeemDelegations(bytes[],bytes32[],bytes[])
selector: 0xcef6d209
network: Base Sepolia
```

本地验证命令：

```bash
npm run verify:chain-evidence
```

该命令通过 Base Sepolia RPC 读取上述 tx，校验 receipt status、tx `to`
地址、function selector、0.01 USDC service transfer 和 1Shot relay fee
transfer。

### 7. 超预算付款前阻断

项目已经验证 oversized request 会在 paid header / settlement 之前被阻断：

```text
amountAtomic: 1010000
state.payment: blocked
txHash: null
payloadContextHash: null
budgetConsumed: 0.00 USDC
totalWalletDebit: 无钱包扣款
```

这说明 SpendGuard 的安全行为不是“付款后报警”，而是“付款前拦截”。

### 8. Dashboard 证据展示

Dashboard 已经展示以下证据：

- x402 protected resource；
- selected payment requirement；
- `scheme=exact`；
- `assetTransferMethod=erc7710`；
- asset / amount / payTo；
- paid header 状态；
- settlement tx hash；
- Advanced Permission 父级授权摘要；
- child delegation caveat inspector；
- payload context hash；
- ledger accounting；
- relay fee 和 total wallet debit。

这让评审可以直接在 UI 上看到协议链路，而不需要只相信口头描述。

### 9. 可复现非交互验证

项目已新增 P7 验证入口：

```bash
node scripts/p7-verify.mjs
```

该脚本会运行：

```text
TypeScript typecheck
Next build
P3 caveat assertion smoke
git diff --check
isolated next start server
local x402 /supported facilitator stub
SSR page smoke
Step 7 failure smoke
```

最近一次验证结果：

```text
P7 verification passed
```

本地最新一次验证使用 workspace bundled Node 执行通过。该验证不会触发 MetaMask、真实 paid call、DeepSeek、1Shot real call 或 settlement；它使用临时 `SPENDGUARD_DATA_DIR`，不会清空当前 demo 证据。

## 项目优点

### 协议组合完整

项目不是单独展示 wallet connect、单独展示 x402、或单独展示一个 AI response，而是把下面这条链路连成了一个可操作产品 demo：

```text
MetaMask Advanced Permission
-> ERC-7710 delegation payment payload
-> x402 402 challenge
-> paid x402 request
-> settlement tx
-> ledger proof
-> AI risk brief
```

### 安全边界清楚

SpendGuard 把 agent payment 的几个边界拆清楚了：

- 用户授权边界：MetaMask Advanced Permission；
- HTTP 付费边界：x402 seller endpoint；
- 本次支付边界：ERC-7710 child delegation caveats；
- 预算边界：SpendGuard policy guard；
- 结算证据：Base Sepolia tx hash；
- 业务输出：DeepSeek risk brief。

### 不是无限授权

agent 没有用户主钱包私钥，也没有无限 USDC allowance。它只能在用户批准的权限、金额、时间窗口和目标范围内尝试支付。

### 支出可观察

每笔账本都记录服务价格、relay fee、总钱包扣款、payload hash、tx hash 和剩余预算。评审可以看到“钱为什么扣、扣到哪里、对应哪个 payload、预算如何变化”。

### 支持一次授权多次受控执行

这对 agent 场景很重要：用户不需要每次 API 调用都重新授权，但 agent 也不能无限花钱。当前 demo 已经用三笔真实交易证明同一授权可被多次受控使用。

### 失败路径也有验证

项目不仅证明成功付款，也验证了缺 payment payload、dry-run payment header、oversized request、重复 settled identity 等失败语义。P7 smoke 可以复现这些非支付失败路径。

## Demo 推荐讲解顺序

1. 打开 Dashboard，说明目标：agent 可以自主调用付费 API，但必须受用户授权预算限制。
2. 展示钱包和 Base Sepolia 状态。
3. 展示 Advanced Permission：1.00 USDC / 24h，单次 0.01 USDC。
4. 运行一次 agent，展示 x402 challenge、ERC-7710 proof、settlement tx、DeepSeek brief。
5. 再运行一次或展示已有三笔 tx 证据，说明同一授权可支持多次独立 paid call。
6. 展示 ledger：payload hash、tx hash、relay fee、wallet debit、remaining budget。
7. 触发或展示 oversized block，强调没有 paid header、没有 tx、没有钱包扣款。
8. 最后运行或展示 P7 验证命令，说明 build/smoke 可复现。

## 真实边界和未完成项

以下内容需要真实说明，不能夸大：

- 当前是黑客松 MVP，不是生产系统。
- ledger 和 permission persistence 是本地 demo state，不是生产级数据库。
- 当前链路主要验证 Base Sepolia。
- relay fee 是 settlement 基础设施成本，单独展示，不计入 demo policy 的 x402 service budget。
- DeepSeek 是 SpendGuard seller settlement 成功后的后端 AI provider，不是 DeepSeek 官方原生 x402 endpoint。
- 直接 revoke 能力取决于用户 MetaMask 版本；如果钱包不支持，当前 fallback 是用户在 MetaMask 内手动撤销后同步本地状态。
- P7 自动验证不会做真实支付；真实 paid call 需要用户手动确认 MetaMask / paid flow。
- settlement failure without ledger success 目前主要由 route 结构保证，没有构造一个只在 settlement 阶段失败的完整 ERC-7710 payload fixture。

## 评审应重点看什么

建议评审重点看四件事：

```text
1. Advanced Permission 是否限制了 agent 的支付能力；
2. ERC-7710 child delegation 是否包含本次支付 caveats；
3. x402 seller endpoint 是否真实签发 challenge 并完成 paid request；
4. 多笔 tx 和 over-budget no-tx 是否证明了“可支付但不可乱花”。
```

如果只用一句话总结项目完成度：

```text
Agent SpendGuard 已经完成 x402 + ERC-7710 agent payment 的本地产品闭环，并用真实 Base Sepolia 多笔交易证明同一 MetaMask Advanced Permission 可以被 agent 多次受控使用，同时超预算请求会在付款前阻断。
```
