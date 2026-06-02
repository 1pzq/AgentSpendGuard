# Agent SpendGuard 黑客松评审总结报告

最后更新：2026-06-02

## 一句话 Pitch

Agent SpendGuard 让 AI agent 可以用 MetaMask Advanced Permissions 和 ERC-7710 支付 x402 保护的 API，同时在链上结算前执行预算、范围和权限校验，避免 agent 获得无限 token 授权或不透明支出能力。

## 项目定位

Agent SpendGuard 是一个面向单个 AI agent 的链上支出控制层。它解决的问题是：当 agent 需要自主调用付费 API 时，用户不应该把主钱包私钥、无限 ERC-20 allowance 或不可控付款权限交给 agent。

本项目把 agent payment 拆成三个清晰边界：

1. 用户授权：用户通过 MetaMask Advanced Permissions 批准一个有上限、有时效、有范围的 USDC 权限。
2. Agent 执行：agent 只能在该策略允许的 API、金额和时间窗口内发起支付。
3. 协议结算：实际 API 请求通过 x402 触发 402 challenge，并使用 ERC-7710 delegation payment payload 完成付费调用。

最终目标是让 AI agent 的链上支出变得可授权、可限制、可观察、可审计、可阻断。

## 核心功能

### 1. MetaMask 钱包连接与网络约束

应用要求用户连接 MetaMask，并强制运行在 Base Sepolia。钱包状态、EOA 地址、授权账户和网络会在界面中明确展示，避免用户在错误网络或错误账户下误操作。

### 2. 有范围的 Advanced Permission 授权

用户不是给 agent 无限 token allowance，而是批准一个 MetaMask Advanced Permission：

- token：Base Sepolia USDC
- 授权类型：ERC-20 周期性支出
- 预算上限：1.00 USDC / 24 小时
- 单次服务价格：0.01 USDC
- 使用范围：DeepSeek 风险简报 agent
- 可撤销或过期

这让 agent 获得的是受限能力，而不是用户钱包的完整控制权。

### 3. x402 + ERC-7710 真实付费 API 调用

Agent 调用受 x402 保护的 SpendGuard paid risk-brief API。这个 API 是项目自建的 x402 seller endpoint；DeepSeek 是 settlement 成功后由该 endpoint 调用的后端 AI provider，不是 DeepSeek 官方原生 x402 endpoint。服务端先返回 x402 `402 Payment Required` challenge，客户端再基于已保存的 MetaMask Advanced Permission 生成 ERC-7710 payment payload，并提交带支付凭证的 paid request。

界面会展示：

- x402 seller = SpendGuard paid risk-brief API
- 受保护资源
- x402 requirement
- scheme = exact
- network = Base Sepolia
- asset = USDC
- amount = 10000 atomic USDC
- payTo 地址
- PAYMENT header 状态
- 下游 AI provider = DeepSeek
- 交易 hash

这证明项目不是 mock payment，而是把 x402 challenge、ERC-7710 delegation payload 和链上 settlement 串成了完整闭环。

### 4. 同一授权下的多次 agent 调用

用户只需批准一次 Advanced Permission。之后 agent 可以在剩余预算内复用同一个授权进行多次 x402 付费调用。每次调用都会生成新的 ERC-7710 child delegation / payment payload，并在账本中记录独立交易、payload hash 和预算余额。

这展示了 agent 经济模型中的关键能力：一次授权，多次受控执行。

### 5. 支出账本与协议证据栏

应用不仅显示“成功/失败”，还展示每次支付的证据：

- 调用编号
- 服务价格
- 1Shot relay fee
- 钱包总扣款
- agent 预算消耗
- ERC-7710 payload context hash
- child delegation target
- settlement tx hash
- 剩余预算

账本让评审可以直接看到每笔 agent 支出如何从权限、payload、x402 requirement 到链上交易对应起来。

### 6. 超预算请求阻断

当 agent 尝试发起超出策略范围的请求时，SpendGuard 会在提交 paid x402 request 和 settlement 之前阻断。这个失败路径不会创建支付 header，不会触发 relayer 交易，也不会消耗钱包余额。

这正是项目的安全核心：不是付款后报警，而是付款前拦截。

### 7. DeepSeek AI 输出

付费 API 调用成功后，SpendGuard seller endpoint 会运行 DeepSeek 风险简报任务，返回钱包风险分析结果。AI 输出不是主安全边界，也不是 x402 seller；它用来展示 agent 为什么需要自主调用付费 API，以及 x402 payment 如何服务真实 agent 工作流。

### 8. 撤销与同步

界面提供撤销入口。应用会优先尝试 MetaMask 支持的直接撤销路径，并通过 wallet truth sync 检查授权是否仍然存在。当前撤销能力依赖用户 MetaMask 版本支持；如果钱包不支持直接 revoke，应用会提示用户在 MetaMask 中手动撤销后再同步本地状态。

## 技术亮点

### 1. 主赛道聚焦清晰

项目主赛道是 `Best x402 + ERC-7710`。核心演示链路是：

```text
MetaMask Advanced Permissions
-> ERC-7710 delegation payment payload
-> x402 402 challenge
-> paid x402 request
-> settlement confirmation
-> SpendGuard ledger proof
```

1Shot 在项目中作为 settlement 支撑基础设施，DeepSeek 作为真实 agent 任务输出，二者不稀释主赛道叙事。

### 2. x402 Seller 边界透明

项目的 x402 seller 是 `Agent SpendGuard paid risk-brief API`，保护接口是：

```text
POST /api/x402/deepseek/risk-brief/erc7710-paid-poc
```

该 seller endpoint 负责签发 402 challenge、声明 USDC requirement、验证 ERC-7710 payment payload、执行 settlement，并在付款确认后调用 DeepSeek 生成风险简报。这个边界避免两个误解：

- 不是宣称 DeepSeek 官方原生支持 x402。
- 不是本地 mock 自付费；成功账本行必须有 paid request、settlement tx hash 和 ERC-7710 payload proof。

### 3. 结算前策略校验

SpendGuard 在 paid request 之前检查：

- 是否存在有效 Advanced Permission
- 是否匹配 Base Sepolia
- token 和收款地址是否匹配
- 单次金额是否在策略内
- 累计支出是否超过预算
- ERC-7710 payload 是否匹配授权
- payload 是否为新生成，避免重复记账或重放

这让 agent payment 具备 fail-closed 行为。

### 4. 权限和支付证据可视化

很多钱包授权 demo 只显示“已授权”。Agent SpendGuard 把评审真正关心的协议证据直接放在界面上：x402 requirement、ERC-7710 proof、payload hash、delegation target、tx hash、ledger accounting。评审不需要打开代码就能看懂支付链路。

### 5. 预算会计清晰

项目明确区分：

- x402 服务价格：计入 agent 预算
- 1Shot relay fee：作为钱包扣款单独展示
- 钱包总扣款：服务价格 + relay fee
- 剩余 agent 预算：只按策略定义的服务价格递减

这种拆分避免把 relayer 成本误认为 agent 服务预算，也让账本更适合审计。

### 6. 无私钥托管、无无限授权

Agent 不持有用户主钱包私钥，也不需要无限 ERC-20 allowance。用户授权的是可过期、可限制、可撤销的 Advanced Permission。agent 的执行能力来自 delegation，不来自用户钱包的完全控制权。

## 已验证结果

本项目已经完成手动端到端测试，核心路径全部成功：

- 连接 MetaMask
- 切换 / 校验 Base Sepolia
- 批准 MetaMask Advanced Permission
- 获取 x402 `402 Payment Required` challenge
- 构造 ERC-7710 payment payload
- 提交 paid x402 request
- 通过 settlement 完成真实 Base Sepolia USDC 扣款
- DeepSeek agent 返回风险简报
- 支出账本记录成功交易
- 同一授权下多次付费调用成功
- 预算递减正确
- 超预算请求在付款前被阻断

已记录的一次成功交易：

```text
0xd864924d7f92e498f51d5a0065c4d1a29ae6629087f5e9602177f0c8590c3a4d
```

BaseScan:

```text
https://sepolia.basescan.org/tx/0xd864924d7f92e498f51d5a0065c4d1a29ae6629087f5e9602177f0c8590c3a4d
```

该交易显示：

- Function：Redeem Delegations
- 网络：Base Sepolia Testnet
- x402 服务支付：0.01 USDC
- relay fee：0.010944 USDC
- 钱包总扣款：0.020944 USDC
- agent 预算消耗：0.01 USDC

自动化 / 静态验证包括：

- TypeScript typecheck 通过
- Next build 曾通过
- `git diff --check` 通过
- Step 7 failure smoke 通过 5 项检查
- 中文界面和核心操作手测通过

## 评审 Demo 推荐流程

### 60-90 秒演示脚本

1. 打开 Dashboard，说明目标：让 AI agent 在链上自主支付 API，但不能超预算。
2. 连接 MetaMask，展示 Base Sepolia 和钱包状态。
3. 批准 Advanced Permission，强调这是 1.00 USDC / 24 小时的受限权限，不是无限授权。
4. 点击运行 agent，展示 x402 challenge 和 ERC-7710 proof。
5. 等待 paid request 成功，展示 tx hash、账本、预算从 1.00 变为 0.99。
6. 再运行一次，展示同一授权复用、多次调用、账本新增记录。
7. 点击超预算测试，展示请求在 paid header / settlement 之前被阻断。
8. 总结：Agent 可以付款，但只能在用户授权的链上预算和范围内付款。

### 评审应重点看的界面区域

- 演示操作台：展示当前 agent 动作和下一步
- 钱包卡片：确认 MetaMask 和 Base Sepolia
- 预算策略：确认上限、单价、剩余预算
- 权限预览：确认 Advanced Permission 内容
- x402 支付：确认 challenge、requirement、payment header 和 tx hash
- ERC-7710 proof：确认 delegation payload 与授权匹配
- 支出账本：确认每笔支出、payload hash、relay fee 和剩余预算

## 项目优势

### 对用户

- 不需要把主钱包私钥交给 agent
- 不需要给无限 token allowance
- 每次支出都可见、可追踪、可审计
- 超预算请求会在付款前被拦截
- 授权可过期、可撤销

### 对 AI agent 应用

- 支持 agent 自主调用付费 API
- 一次授权可支持多次受控调用
- 支付逻辑和业务任务解耦
- x402 让 API monetization 更自然
- ERC-7710 让支付能力可以被 delegation 化，而不是靠中心化后端代付

### 对协议生态

- 展示了 x402 与 ERC-7710 的实际组合方式
- 证明 MetaMask Advanced Permissions 可以成为 agent payment 的安全边界
- 把链上授权、HTTP 402 challenge、delegation settlement 和 agent output 组合成完整产品体验
- 提供了可视化证据栏，降低评审和开发者理解协议链路的成本

## 当前边界与后续方向

当前版本是黑客松 MVP，重点证明 x402 + ERC-7710 agent payment 的核心闭环。仍然保留以下边界：

- 状态存储是本地 demo persistence，不是生产数据库
- 当前演示网络是 Base Sepolia
- relay fee 作为 settlement 基础设施成本单独展示
- revoke 能力受用户 MetaMask 版本支持影响
- 生产环境还需要更完整的监控、错误恢复和多用户隔离

后续可以扩展：

- 多 agent / 多策略管理
- 更细粒度 API scope 和 spend categories
- 生产级 revoke 与 permission dashboard
- 更完整的交易补录和链上 reconciliation
- 支持更多 x402 付费服务

## 结论

Agent SpendGuard 的核心贡献是把“AI agent 可以自主付款”这件事变得安全、可控、可证明。它不是简单地让 agent 发起链上交易，而是用 MetaMask Advanced Permissions 定义授权边界，用 ERC-7710 表达 delegation payment payload，用 x402 连接 HTTP API 付费场景，并用 SpendGuard 在 settlement 前执行预算策略。

对于黑客松评审，最重要的判断点是：这个项目已经把 x402 + ERC-7710 从协议概念变成了一个可运行、可观察、可阻断的 agent payment 产品原型。
