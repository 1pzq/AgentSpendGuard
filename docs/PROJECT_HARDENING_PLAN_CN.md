# Agent SpendGuard 项目硬化优化计划表

最后更新：2026-06-02

## 优化原则

当前阶段优先改项目本体，最后再集中改文档和提交材料。

核心目标不是继续堆功能，而是把评审最可能质疑的地方变成可运行、可展示、可验证的证据：

```text
预算约束是否真的进入 permission / caveat？
x402 是否是真实 protected endpoint？
多次支付是否真的有链上交易和独立账本？
本地 demo state 和链上权限边界是否讲清楚？
```

## 总体优先级

| 优先级 | 模块 | 目标 | 评审质疑点 | 建议状态 |
|---|---|---|---|---|
| P0 | 稳定基线 | 保留当前已跑通链路，避免硬化时破坏 demo | 当前功能是否真的稳定 | 先冻结成功路径 |
| P1 | Caveat 硬化 | 把 per-call token amount 约束加入 child delegation | 预算约束是否进入 caveat | 已完成，真实 paid call 通过 |
| P2 | Caveat Inspector | 在 UI 中展示父级 permission 和 child caveats | ERC-7710 使用深度是否足够 | 已完成 |
| P3 | Server Caveat Assertion | settlement 前服务端校验必要 caveats | 是否只是前端展示 | 高优先级 |
| P4 | Onchain Available Amount | 查询链上 permission 剩余额度 | 本地状态机是否可绕过 | 高优先级 |
| P5 | 多交易证据 | 记录多次调用的独立 tx / payload / ledger | 是否只有一笔交易 | 中高优先级 |
| P6 | x402 Seller 透明化 | 说明并展示 SpendGuard 自建 x402 seller endpoint | 是否自己给自己 mock 付款 | 已完成 |
| P7 | Build / Smoke 稳定化 | 给出可复现验证命令 | “曾通过”暗示不稳定 | 中优先级 |
| P8 | 最终文档包装 | 更新提交报告、README、demo script | 叙事是否准确 | 最后执行 |

## 详细计划表

### P0：冻结当前成功基线

| 项目 | 内容 |
|---|---|
| 目标 | 确保后续硬化不会破坏当前已成功的 x402 + ERC-7710 主链路 |
| 当前依据 | 用户手测已确认连接、授权、付费调用、多次调用、预算递减、超预算阻断全部成功 |
| 主要动作 | 记录当前可跑通流程；避免无关重构；每次硬化后只测主链路 |
| 涉及文件 | `docs/CURRENT_PROGRESS.md`、`docs/X402_ERC7710_E2E_RESULTS.md` |
| 验收标准 | 当前 demo 仍能完成：批准权限 -> paid call -> ledger -> repeat call -> over-budget block |
| 风险 | 后续 caveat 变更可能影响 1Shot settlement |
| 风险控制 | 每个改动保持小步提交；先 typecheck，再 dry run，再真实手测 |

### P1：Child Delegation Caveat 硬化

| 项目 | 内容 |
|---|---|
| 目标 | 把本次支付的最大 ERC-20 金额约束写入 child delegation caveat |
| 要解决的质疑 | “预算约束是不是只在前端 JS 里？” |
| 当前状态 | child delegation 已有 `limitedCalls`、`valueLte`、`allowedTargets`、`allowedMethods`、`timestamp` |
| 主要动作 | 增加 `erc20TransferAmount` caveat，`maxAmount = x402 service price + relay fee budget` |
| 备选动作 | 如果 settlement 兼容，再探索 `exactCalldata`、`exactExecutionBatch` 或 `specificActionERC20TransferBatch` |
| 涉及文件 | `src/client/x402/payErc7710DeepseekRiskBrief.ts` |
| 验收标准 | 新生成的 payment payload 中能解码出 `erc20TransferAmount` caveat；真实 paid call 仍可 settlement |
| 风险 | 1Shot facilitator 或 delegation execution 对新增 caveat 不兼容 |
| 风险控制 | 先只加金额上限，不直接上 exact calldata；保留旧逻辑便于回退 |
| 执行结果 | paid path 生成 child delegation 时已加入 `erc20TransferAmount`，`maxAmount = x402 service price + 1Shot relay fee budget`；relay fee budget 基于 `minFee` / service price 做 2x 有界余量，避免真实 estimate 的 `requiredPaymentAmount` 略高于 `minFee` 时误拦截 |
| 执行结果 | payload proof 已能解码出 child `erc20TransferAmount` 的 enforcer、tokenAddress、maxAmountAtomic，并在客户端提交前断言 token 和 maxAmount |
| 验证结果 | `tsc --noEmit`、`next build`、`git diff --check`、浏览器 smoke、Step 7 failure smoke 已通过；2026-06-01 真实钱包 paid call 已通过 |
| 真实结果 | tx `0x69de2c1f16ac9e837d80669e0830e99d7811dc11052835b8ab270bf00e8eb587`；payload hash `0x9834278a5e92467ea2a41995eebac7e685961c02b4edc782c9b05b2b4a66b0c4`；child `erc20TransferAmount.maxAmountAtomic=30000`；实际钱包扣款 `22042` atomic USDC |

### P2：Caveat Inspector UI

| 项目 | 内容 |
|---|---|
| 目标 | 让评审直接看到 permission 和 caveat，而不是只看到 hash |
| 要解决的质疑 | “ERC-7710 到底用了什么 caveat？” |
| 当前状态 | UI 已展示 payload hash、delegation target、local/server validation |
| 主要动作 | 新增或扩展 ERC-7710 proof panel，展示 decoded parent permission 与 child caveats |
| 展示内容 | parent token、periodAmount、periodDuration、startTime、expiry、delegator、redeemer、delegationManager |
| 展示内容 | child limitedCalls、valueLte、allowedTargets、allowedMethods、timestamp、erc20TransferAmount |
| 涉及文件 | `src/shared/x402/erc7710DelegationInspector.ts`、`src/components/PermissionPreview.tsx`、`src/components/PaymentRail.tsx` 或新增组件 |
| 验收标准 | 页面能清楚显示“父级授权限制”和“本次 child delegation 限制” |
| 风险 | UI 信息过多，评审看不懂 |
| 风险控制 | 用两层展示：摘要默认可见，原始详情折叠 |
| 执行结果 | ERC-7710 proof rail 已扩展为 Caveat Inspector，默认展示父级授权限制和本次 child delegation 限制 |
| 执行结果 | 新生成的 payload proof 会结构化携带 `childCaveats`：`limitedCalls`、`valueLte`、`allowedTargets`、`allowedMethods`、`timestamp`、`erc20TransferAmount`，并保留 ordered raw caveat 摘要 |
| 执行结果 | 现有历史 paid proof 若只保存了 P1 的 `childErc20TransferAmount`，UI 会保留金额上限展示并标注为历史 proof；下一次新 paid payload 会展示完整 child caveats |
| 验证结果 | `tsc --noEmit`、`git diff --check`、浏览器 smoke at `http://localhost:3013/` 已通过 |

### P3：服务端 Caveat Assertion

| 项目 | 内容 |
|---|---|
| 目标 | 服务端在 settlement 前验证 child delegation 必须包含关键 caveats |
| 要解决的质疑 | “UI 展示是不是只做样子？” |
| 当前状态 | 服务端已校验 payload 与 grant 匹配，并拒绝重复 payload hash |
| 主要动作 | 在 paid route 中增加 caveat assertion：必须有 allowed target、allowed method、timestamp、limited calls、amount cap |
| 涉及文件 | `src/app/api/x402/deepseek/risk-brief/erc7710-paid-poc/route.ts`、`src/shared/x402/erc7710DelegationInspector.ts` |
| 验收标准 | 缺少关键 caveat 的 payload 在 settlement 前被拒绝；正常 payload 可通过 |
| 风险 | 解码不同 enforcer terms 有兼容问题 |
| 风险控制 | 先做 presence validation，再逐步做 terms validation |
| 执行结果 | paid route 已在 settlement 前执行服务端 child caveat assertion：要求 `allowedTargets` 指向 x402 asset、`allowedMethods` 包含 ERC-20 `transfer` selector、`timestamp` 在 x402 timeout 窗口内、`limitedCalls` 不超过 2、`erc20TransferAmount` token 匹配且金额覆盖本次 payment amount 但不超过父级授权额度 |
| 执行结果 | `src/shared/x402/erc7710DelegationInspector.ts` 新增可复用 `validateErc7710RequiredChildCaveats`，route 会把缺失或不匹配的 caveat 转成 `CONFIG_MISMATCH` 阻断错误，因此失败发生在 settlement 之前 |
| 验证结果 | `./node_modules/.bin/tsc --noEmit`、`node scripts/p3-caveat-assertion-smoke.mjs`、`git diff --check` 已通过；当前 shell 中 `npm` 命令不可用，因此使用本地 TypeScript CLI 和 Node 直接验证 |

### P4：Onchain Available Amount 查询

| 项目 | 内容 |
|---|---|
| 目标 | 查询并展示 MetaMask period transfer enforcer 的链上可用额度 |
| 要解决的质疑 | “清空本地存储后预算是不是消失？” |
| 当前状态 | 本地 ledger / permission persistence 记录 spent 和 remaining |
| 主要动作 | 接入 Smart Accounts Kit caveat enforcer available amount 查询能力 |
| UI 展示 | `本地 agent 预算余额` 与 `链上 permission 可用额度` 分开展示 |
| 服务端策略 | precheck 可以用链上 available amount 作为额外保护 |
| 涉及文件 | `src/client/permissions/metamaskAdvancedPermissions.ts`、`src/app/api/_lib/demoState.ts`、`src/components/PolicyCard.tsx` |
| 验收标准 | 页面显示链上 available amount；刷新后仍能从 wallet / chain 恢复真实授权额度 |
| 风险 | SDK 查询需要正确 caveat enforcer params，可能要解码 parent delegation terms |
| 风险控制 | 先做只读展示，不立刻替换现有 precheck |
| 执行结果 | 已新增 `readAdvancedPermissionOnchainAvailableAmount`，客户端会解码已保存 parent permission context，定位 `ERC20PeriodTransferEnforcer` caveat，用 `hashDelegation(parent)`、`delegationManager`、`terms` 只读查询链上 `getAvailableAmount` |
| 执行结果 | Dashboard 新增 `onchainPermission` 状态，PolicyCard 分开展示 `本地 agent 预算余额` 与 `链上 permission 可用额度`；查询失败仅显示为链上只读状态，不替换现有本地 precheck |
| 验证结果 | `./node_modules/.bin/tsc --noEmit`、`node scripts/p3-caveat-assertion-smoke.mjs`、`git diff --check` 已通过；当前 shell 中 `npm` 命令不可用，因此使用本地 TypeScript CLI 和 Node 直接验证 |

### P5：多次真实交易证据补强

| 项目 | 内容 |
|---|---|
| 目标 | 用多笔链上 tx 证明同一授权下多次调用真实发生 |
| 要解决的质疑 | “是不是只有一笔交易？” |
| 当前状态 | 已完成：用户在 `127.0.0.1:3012` 跑通同一授权下 call #1/#2/#3 三笔真实 Base Sepolia tx，并补充 over-budget 无 tx 阻断证据 |
| 主要动作 | 再跑干净 E2E：call #1、call #2、call #3、over-budget block |
| 记录内容 | 每笔 tx hash、payload context hash、ledger row、budget remaining、relay fee |
| 涉及文件 | `docs/X402_ERC7710_E2E_RESULTS.md`、`.spendguard/ledger.json` 作为本地证据来源 |
| 验收标准 | 文档和 UI 均能展示多笔独立 tx；over-budget 无 tx |
| 风险 | 测试网 RPC / relayer 不稳定 |
| 风险控制 | 不在核心代码变更未稳定前反复消耗测试币 |
| 执行结果 | 三笔 success ledger 分别记录独立 tx hash：`0x62e550bd889a8eeb72b72633371bd4be8118cd6026ad330ffeb0957d18b0aec0`、`0x9398cc02b95761f07c890a9a6346318e78ef4649c1c971659b92f4e1f9d1bd4e`、`0xa065cfa4d2e09048ae4015e2f4a779c26de05cccae4a14af65c8356d174f65d3` |
| 执行结果 | 三笔 payload context hash 互不相同；预算从 `0.99 USDC` 递减到 `0.97 USDC`；只读 receipt 显示三笔 Base Sepolia tx 均为 `status=0x1` |
| 验证结果 | over-budget precheck 追加一条 `blocked` ledger，`txHash=null`、`payloadContextHash=null`、`totalWalletDebit=无钱包扣款`；P5 证据已写入 `docs/X402_ERC7710_E2E_RESULTS.md` |

### P6：x402 Seller 透明化

| 项目 | 内容 |
|---|---|
| 目标 | 明确 x402 protected endpoint 是 SpendGuard seller endpoint，DeepSeek 是后端 AI provider |
| 要解决的质疑 | “DeepSeek 原生支持 x402 吗？” |
| 当前状态 | 项目已有 x402 protected route 包装 DeepSeek risk brief |
| 主要动作 | UI 和报告中明确 `SpendGuard paid risk-brief API` 是 x402 seller |
| 涉及文件 | `src/components/PaymentRail.tsx`、`src/components/VeniceResult.tsx`、`docs/HACKATHON_JUDGE_REPORT_CN.md` |
| 验收标准 | 评审不会误解为 DeepSeek 官方原生 x402；也不会误解为 mock payment |
| 风险 | 过度解释削弱 pitch |
| 风险控制 | 用一句话讲清楚：SpendGuard wraps DeepSeek behind an x402-protected API |
| 执行结果 | `PaymentRail` 新增 Seller 边界证据：明确 x402 seller 是 `Agent SpendGuard paid risk-brief API`，seller endpoint 是 `POST /api/x402/deepseek/risk-brief/erc7710-paid-poc`，x402 resource 是 `/x402/deepseek/risk-brief/erc7710-paid-poc`，seller 负责签发 402、验证 ERC-7710 payload、settlement 后放行业务响应 |
| 执行结果 | `VeniceResult` 结果卡新增 AI provider 边界：DeepSeek 是 settlement 后由 SpendGuard seller 调用的后端 provider，不直接签发 x402 challenge |
| 执行结果 | 评审报告新增 `x402 Seller 边界透明` 小节，明确这不是 DeepSeek 官方原生 x402，也不是本地 mock 自付费；成功账本行必须有 paid request、settlement tx hash 和 ERC-7710 payload proof |

### P7：验证命令稳定化

| 项目 | 内容 |
|---|---|
| 目标 | 把“曾通过”改成可复现验证 |
| 要解决的质疑 | “build 当前是不是挂的？” |
| 当前状态 | 已完成：固定 `p7:verify` 入口并用 workspace bundled Node 实跑通过 |
| 主要动作 | 固定推荐命令；记录 Node 路径；重新跑非交互 typecheck、build、smoke |
| 涉及文件 | `package.json`、`docs/LOCAL_ENVIRONMENT.md`、`docs/CURRENT_PROGRESS.md` |
| 验收标准 | 文档写明准确命令和最新结果，不再使用“曾通过” |
| 风险 | macOS SWC code signing 影响 Codex 内置 Node |
| 风险控制 | 明确使用 workspace runtime Node：`/Users/puzhiqiu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/p7-verify.mjs` |
| 测试分工 | Codex 只执行非交互验证：typecheck、build、`git diff --check`、不触发真实钱包 / 支付的 smoke 或 API inspection |
| 用户手测 | 所有需要页面点击、MetaMask 弹窗确认、真实 ERC-7710 paid call、repeat paid call、over-budget button 的测试由用户执行并提供截图 / 结果 |
| P7 边界 | P7 不由 Codex 点击 `运行 Agent`、`支付 0.01 USDC`、`批准权限`、`撤销` 等会触发钱包或真实链上动作的按钮 |
| 执行结果 | 新增 `scripts/p7-verify.mjs` 和 `package.json` 的 `p7:verify`；脚本会运行 typecheck、Next build、P3 caveat smoke、`git diff --check`、隔离 `next start` server、隔离 SSR page smoke、Step 7 failure smoke |
| 执行结果 | P7 smoke 使用临时 `SPENDGUARD_DATA_DIR` 和本地 x402 `/supported` facilitator stub，不会重置当前 `.spendguard` 证据或用户正在使用的 `http://127.0.0.1:3012` 状态 |
| 验证结果 | `p7:verify` 已通过；没有触发 MetaMask、真实 paid call、DeepSeek、1Shot real call 或 settlement |
| 已知 warning | Next build/start 仍会输出既有 viem `ox/tempo` dynamic dependency warning；`next start` serving API routes 时 Node 也可能打印 SQLite experimental warning；二者不影响本次 P7 验证结果 |

### P8：最终评审材料收口

| 项目 | 内容 |
|---|---|
| 目标 | 在项目本体硬化完成后，再统一更新评审报告和提交材料 |
| 要解决的质疑 | 文档是否过度拔高 |
| 当前状态 | 已有初版评审报告 |
| 主要动作 | 更新 trust boundary、caveat proof、多交易证据、demo script |
| 涉及文件 | `docs/HACKATHON_JUDGE_REPORT_CN.md`、`README.md`、`docs/CURRENT_PROGRESS.md` |
| 验收标准 | 文档和实际功能一致；不再把本地 ledger 说成链上预算状态 |
| 风险 | 时间不足 |
| 风险控制 | 最后只做事实同步，不再大改叙事结构 |

## 推荐执行顺序

```text
1. P1 Child Delegation Caveat 硬化
2. P2 Caveat Inspector UI
3. P3 服务端 Caveat Assertion
4. P4 Onchain Available Amount 查询
5. P5 多次真实交易证据补强
6. P6 x402 Seller 透明化
7. P7 验证命令稳定化
8. P8 最终评审材料收口
```

## 每一步完成后的固定验收

每完成一个 P 级任务，Codex 可执行的固定验收为：

```text
typecheck
build（P7 固定推荐命令中写明具体 Node 路径）
git diff --check
非支付 smoke / API inspection（如适用）
```

涉及支付路径时，以下需要点击页面或确认 MetaMask 的测试由用户执行，Codex 只记录用户截图 / 结果，不代点按钮：

```text
1. reset
2. connect wallet
3. approve permission
4. dry run
5. paid call #1
6. repeat paid call #2
7. over-budget block
8. /api/ledger inspection
```

## 成功标准

优化完成后，面对专业评审的核心问题：

```text
把预算约束编码进 ERC-7710 caveat 了吗？
```

理想回答应该是：

```text
是。父级 MetaMask Advanced Permission 限制 token、周期额度和时间窗口；
child delegation 限制本次支付的 token、method、call count、timestamp 和最大 ERC-20 转账额；
服务端在 settlement 前验证 payload 与 grant 以及 caveats 一致；
Dashboard 直接展示 decoded permission / caveats / payload hash / tx hash。
```

这才是评审难以继续质疑的版本。
