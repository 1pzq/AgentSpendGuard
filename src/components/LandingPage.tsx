const navLinks = [
  { href: "#features", label: "能力" },
  { href: "#protocol", label: "协议" },
  { href: "#proof", label: "审计" }
];

const heroMetrics = [
  { label: "Session cap", value: "1.00 USDC" },
  { label: "Per request", value: "0.01 USDC" },
  { label: "Policy state", value: "Revocable" }
];

const featureCards = [
  {
    icon: "01",
    title: "预算边界",
    text: "在 Agent 调用付费 API 前，先限定 token、单次价格、总额度与过期时间"
  },
  {
    icon: "02",
    title: "x402 支付轨道",
    text: "只有策略检查通过后才构造支付请求，让 API 访问和钱包授权保持分离"
  },
  {
    icon: "03",
    title: "可撤销证明",
    text: "每次运行都留下本地账本与链上证据，用户可以审计、限额或直接撤销"
  },
  {
    icon: "04",
    title: "主钱包隔离",
    text: "Agent 不接触私钥，也不需要无限 token approval，只使用会话级权限"
  }
];

export function LandingPage() {
  return (
    <main className="landing-shell">
      <header className="landing-nav" aria-label="Agent SpendGuard navigation">
        <a className="landing-brand" href="/">
          <img className="landing-brand-mark" src="/loge.svg" alt="" />
          Agent SpendGuard
        </a>
        <nav aria-label="Primary">
          {navLinks.map((link) => (
            <a href={link.href} key={link.href}>
              {link.label}
            </a>
          ))}
        </nav>
        <a className="landing-nav-cta" href="/demo">
          打开演示
        </a>
      </header>

      <section className="landing-hero" id="overview">
        <div className="landing-sticker-field" aria-hidden="true">
          <img className="landing-sticker landing-sticker-moon" src="/illustrations/sticker-7.png" alt="" />
          <img className="landing-sticker landing-sticker-duck" src="/illustrations/sticker-10.png" alt="" />
          <img className="landing-sticker landing-sticker-fish" src="/illustrations/sticker-8.png" alt="" />
        </div>
        <div className="landing-hero-copy">
          <p className="landing-kicker">x402 + ERC-7710 payment control</p>
          <h1>给 AI Agent 一笔可控预算</h1>
          <p className="landing-hero-lede">
            Agent SpendGuard 让智能体在可撤销的会话额度内支付 API，用户主钱包始终保持隔离
          </p>
          <div className="landing-actions">
            <a className="landing-button landing-button-primary" href="/demo">
              打开产品演示
            </a>
            <a className="landing-button landing-button-secondary" href="#protocol">
              查看协议流程
            </a>
          </div>
        </div>

        <div className="landing-hero-media" aria-label="Agent SpendGuard product preview">
          <div className="landing-floating-pill landing-floating-pill-left">
            <span>policy check</span>
            <strong>approved</strong>
          </div>
          <div className="landing-product-frame">
            <div className="landing-window-bar" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <div className="landing-product-grid">
              <aside className="landing-product-sidebar">
                <img className="landing-product-logo" src="/loge.svg" alt="" />
                <p>Agent Session</p>
                <strong>Budget active</strong>
                <div className="landing-session-meter">
                  <span />
                </div>
                <dl>
                  {heroMetrics.map((metric) => (
                    <div key={metric.label}>
                      <dt>{metric.label}</dt>
                      <dd>{metric.value}</dd>
                    </div>
                  ))}
                </dl>
              </aside>
              <div className="landing-product-main">
                <div className="landing-product-header">
                  <span>DeepSeek risk brief</span>
                  <strong>x402 ready</strong>
                </div>
                <div className="landing-flow-row is-active">
                  <span>01</span>
                  <p>Read policy caveats</p>
                  <strong>pass</strong>
                </div>
                <div className="landing-flow-row">
                  <span>02</span>
                  <p>Build ERC-7710 payload</p>
                  <strong>bounded</strong>
                </div>
                <div className="landing-flow-row">
                  <span>03</span>
                  <p>Settle x402 request</p>
                  <strong>0.01 USDC</strong>
                </div>
                <div className="landing-ledger-preview">
                  <span>Chain evidence</span>
                  <code>0xe611...d0Be</code>
                </div>
              </div>
            </div>
          </div>
          <div className="landing-mobile-frame" aria-hidden="true">
            <span>Spend</span>
            <strong>0.01 USDC</strong>
            <p>7 checks passed</p>
          </div>
          <div className="landing-floating-pill landing-floating-pill-right">
            <span>main wallet</span>
            <strong>isolated</strong>
          </div>
        </div>
      </section>

      <section className="landing-trust" aria-label="SpendGuard guarantees">
        <div>
          <span>Hard cap</span>
          <strong>先限额，再支付</strong>
        </div>
        <div>
          <span>No key handoff</span>
          <strong>主钱包不交给 Agent</strong>
        </div>
        <div>
          <span>Audit trail</span>
          <strong>每笔请求都有证据</strong>
        </div>
      </section>

      <section className="landing-section landing-features" id="features">
        <div className="landing-section-heading">
          <p className="landing-kicker">Safety layer</p>
          <h2>把 Agent 支付拆成清晰、可控、可撤销的步骤</h2>
          <p>
            它不是替 Agent 持有一切权限，而是在每次付费前放置一层明确的预算和证据边界
          </p>
        </div>
        <div className="landing-feature-grid">
          {featureCards.map((feature) => (
            <article className="landing-feature-card" key={feature.title}>
              <span className="landing-feature-icon" aria-hidden="true">
                {feature.icon}
              </span>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-protocol-band" id="protocol" aria-label="Protocol overview">
        <div className="landing-protocol-inner">
          <div>
            <p className="landing-kicker">Protocol flow</p>
            <h2>一次受控支付，从策略开始，到证据结束</h2>
          </div>
          <ol className="landing-protocol-list">
            <li>
              <span>1</span>
              <strong>用户授予会话预算</strong>
              <p>预算只覆盖指定 token、服务价格、时间窗和 API endpoint</p>
            </li>
            <li>
              <span>2</span>
              <strong>Agent 请求 x402 付费资源</strong>
              <p>服务端返回 challenge，前端用 ERC-7710 permission 构造受限 payload</p>
            </li>
            <li>
              <span>3</span>
              <strong>结算后写入证据面</strong>
              <p>账本记录支出、余额、relayer 状态和链上可验证信息</p>
            </li>
          </ol>
        </div>
      </section>

      <section className="landing-section landing-proof" id="proof">
        <div className="landing-proof-copy">
          <p className="landing-kicker">Proof surface</p>
          <h2>黑客松评审现场展示</h2>
          <p>
            从连接钱包、授权预算、Agent 运行、x402 结算到撤销权限，整条链路都能在 demo 中跑通
          </p>
        </div>
        <a className="landing-button landing-button-primary" href="/demo">
          进入实时演示
        </a>
      </section>
    </main>
  );
}
