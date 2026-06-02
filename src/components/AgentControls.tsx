import type { SpendGuardDemoState } from "@/shared/types";
import type { Erc7710DryRunPreview } from "@/client/x402/dryRunErc7710Payment";
import type { PaidErc7710RiskBriefData } from "@/client/x402/payErc7710DeepseekRiskBrief";
import { StatusBadge } from "./StatusBadge";

type PaidPocConfig = {
  amountAtomic: string;
  enabled: boolean;
  priceLabel: string;
};

type AgentControlsProps = {
  busyAction: string | null;
  narrative: string;
  onApprove: () => void;
  onConnect: () => void;
  onDryRun: () => void;
  onOverBudget: () => void;
  onPaidPoc: () => void;
  onReset: () => void;
  onRevoke: () => void;
  onRun: () => void;
  dryRunControlsEnabled: boolean;
  dryRunPreview: Erc7710DryRunPreview | null;
  paidPocConfig: PaidPocConfig;
  paidPocResult: PaidErc7710RiskBriefData | null;
  state: SpendGuardDemoState;
};

function getAgentCopy(state: SpendGuardDemoState) {
  const paidCalls = state.ledgerEntries.filter(
    (entry) => entry.status === "success" || entry.status === "paid_ai_failed"
  ).length;

  if (state.wallet === "unsupported") {
    return {
      precheck: "需要 MetaMask 连接 Base Sepolia",
      nextAction: "启用 MetaMask 或切换网络后重新连接"
    };
  }

  if (state.wallet !== "connected") {
    return {
      precheck: "等待 MetaMask",
      nextAction: "连接 Base Sepolia EOA"
    };
  }

  if (state.permission === "requested") {
    return {
      precheck: "策略已准备签名",
      nextAction: "批准 MetaMask Advanced Permission"
    };
  }

  if (state.permission === "rejected") {
    return {
      precheck: "Advanced Permission 未批准",
      nextAction: "重新批准 MetaMask Advanced Permission"
    };
  }

  if (state.payment === "blocked") {
    return {
      precheck: "超预算请求已在付费 header 前阻断",
      nextAction: `账本保留 ${paidCalls} 次已支付调用`
    };
  }

  if (
    paidCalls > 0 &&
    state.policy === "active" &&
    (state.permission === "approved" || state.permission === "redeemed")
  ) {
    return {
      precheck: `${paidCalls} 次 x402 付费调用已结算`,
      nextAction: `使用同一授权运行第 #${paidCalls + 1} 次调用`
    };
  }

  if (state.policy === "active") {
    return {
      precheck: "预算、范围、过期时间检查通过",
      nextAction: `运行 ${state.policyConfig.service} 任务`
    };
  }

  if (state.policy === "exhausted") {
    return {
      precheck: "预算检查失败",
      nextAction: "撤销或等待新的预算窗口"
    };
  }

  if (state.policy === "revoked") {
    return {
      precheck: "权限已撤销",
      nextAction: "不允许继续支出"
    };
  }

  return {
    precheck: "等待中",
    nextAction: "继续演示"
  };
}

function shortenHex(value: string) {
  if (value.length <= 14) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function DemoCommand({
  busyAction,
  dryRunControlsEnabled,
  dryRunPreview,
  narrative,
  onApprove,
  onConnect,
  onDryRun,
  onOverBudget,
  onPaidPoc,
  onReset,
  onRevoke,
  onRun,
  paidPocConfig,
  paidPocResult,
  state
}: AgentControlsProps) {
  const showFallbackNote = state.wallet === "unsupported";
  const showDryRunControls = dryRunControlsEnabled;
  const showPaidPocControls = paidPocConfig.enabled;
  const busy = busyAction !== null;
  const paidCalls = state.ledgerEntries.filter(
    (entry) => entry.status === "success" || entry.status === "paid_ai_failed"
  ).length;
  const nextPaidCall = paidCalls + 1;
  const remainingBudget = Math.max(
    0,
    state.policyConfig.maxSpend - state.policyConfig.spent
  );
  const canApprove =
    state.wallet === "connected" &&
    (state.permission === "requested" || state.permission === "rejected");
  const hasAdvancedGrant = state.advancedPermissionGrant !== null;
  const canUseStoredGrant =
    state.wallet === "connected" &&
    state.policy === "active" &&
    (state.permission === "approved" || state.permission === "redeemed") &&
    hasAdvancedGrant;
  const canDryRun =
    showDryRunControls &&
    canUseStoredGrant;
  const canPaidPoc =
    showPaidPocControls &&
    canUseStoredGrant;

  return (
    <section className="demo-command" aria-label="演示控制">
      <div className="command-copy">
        <h2>演示操作台</h2>
        <p>{narrative}</p>
        {hasAdvancedGrant ? (
          <dl className="multi-run-strip" aria-label="Advanced Permission 复用">
            <div>
              <dt>授权次数</dt>
              <dd>1</dd>
            </div>
            <div>
              <dt>已支付调用</dt>
              <dd>{paidCalls}</dd>
            </div>
            <div>
              <dt>下次调用</dt>
              <dd>#{nextPaidCall}</dd>
            </div>
            <div>
              <dt>剩余预算</dt>
              <dd>
                {remainingBudget.toFixed(2)} {state.policyConfig.token}
              </dd>
            </div>
          </dl>
        ) : null}
        {showPaidPocControls && !paidPocResult ? (
          <p className="paid-poc-note">
            ERC-7710 支付会在 Base Sepolia 上花费 {paidPocConfig.priceLabel}。
          </p>
        ) : null}
        {showFallbackNote ? (
          <p role="note">
            静态原型：<code>prototype/index.html</code>。模拟 API 仍由服务端守护；真实授权必须在连接成功后才能启用。
          </p>
        ) : null}
        {showDryRunControls && dryRunPreview ? (
          <details className="dry-run-result" open>
            <summary>ERC-7710 dry-run 预览</summary>
            <dl className="detail-list two-col" aria-label="ERC-7710 dry-run 结果">
              <div>
                <dt>支付要求</dt>
                <dd>
                  {dryRunPreview.requirement.amountAtomic} atomic USDC 到{" "}
                  {shortenHex(dryRunPreview.requirement.payTo)}
                </dd>
              </div>
              <div>
                <dt>授权人</dt>
                <dd>{shortenHex(dryRunPreview.payload.delegator)}</dd>
              </div>
              <div>
                <dt>Payload 哈希</dt>
                <dd>
                  {dryRunPreview.payloadProof.permissionContextHash
                    ? shortenHex(dryRunPreview.payloadProof.permissionContextHash)
                    : "未记录"}
                </dd>
              </div>
              <div>
                <dt>子 target</dt>
                <dd>
                  {dryRunPreview.payloadProof.childDelegationTarget
                    ? shortenHex(dryRunPreview.payloadProof.childDelegationTarget)
                    : "未记录"}
                </dd>
              </div>
              <div>
                <dt>验证</dt>
                <dd>
                  {dryRunPreview.payloadProof.localPayloadMatchesGrant
                    ? "Payload 与授权匹配"
                    : "未验证"}
                </dd>
              </div>
              <div>
                <dt>无支出保护</dt>
                <dd>
                  {dryRunPreview.safeguards.paymentSignatureHeaderSubmitted
                    ? "header 已提交"
                    : "未发送支付 header"}
                </dd>
              </div>
            </dl>
          </details>
        ) : null}
        {showPaidPocControls && paidPocResult ? (
          <details className="paid-poc-result" open>
            <summary>ERC-7710 支付结果</summary>
            <dl className="detail-list two-col" aria-label="ERC-7710 支付结果">
              <div>
                <dt>金额</dt>
                <dd>{paidPocResult.x402.amountAtomic} atomic USDC</dd>
              </div>
              <div>
                <dt>付款人</dt>
                <dd>{shortenHex(paidPocResult.x402.payer)}</dd>
              </div>
              <div>
                <dt>收款地址</dt>
                <dd>{shortenHex(paidPocResult.x402.payTo)}</dd>
              </div>
              <div>
                <dt>交易 hash</dt>
                <dd>
                  {paidPocResult.x402.txHash
                    ? shortenHex(paidPocResult.x402.txHash)
                    : "等待结算"}
                </dd>
              </div>
              <div>
                <dt>Payload 哈希</dt>
                <dd>
                  {paidPocResult.paymentReceipt.erc7710Proof?.permissionContextHash
                    ? shortenHex(
                        paidPocResult.paymentReceipt.erc7710Proof
                          .permissionContextHash
                      )
                    : "未记录"}
                </dd>
              </div>
              <div>
                <dt>验证</dt>
                <dd>
                  {paidPocResult.paymentReceipt.erc7710Proof?.settlementPreflight
                    ? "本地预检通过"
                    : paidPocResult.paymentReceipt.erc7710Proof
                          ?.serverPayloadMatchesGrant
                      ? "服务端授权匹配"
                      : "未记录"}
                </dd>
              </div>
            </dl>
          </details>
        ) : null}
      </div>
      <div className="button-row">
        <button
          disabled={busy || state.wallet === "connected"}
          onClick={onConnect}
          type="button"
        >
          {busyAction === "connect" ? "连接中..." : "连接钱包"}
        </button>
        <button
          disabled={busy || !canApprove}
          onClick={onApprove}
          type="button"
        >
          {busyAction === "approve" ? "授权中..." : "批准权限"}
        </button>
        <button
          disabled={busy || !(canUseStoredGrant && paidPocConfig.enabled)}
          onClick={onRun}
          type="button"
        >
          {busyAction === "run"
            ? "运行中..."
            : paidCalls > 0
              ? `运行调用 #${nextPaidCall}`
              : "运行 Autonomous Agent"}
        </button>
        {showDryRunControls ? (
          <button disabled={busy || !canDryRun} onClick={onDryRun} type="button">
            {busyAction === "dryRun" ? "预览中..." : "7710 预演"}
          </button>
        ) : null}
        {showPaidPocControls ? (
          <button disabled={busy || !canPaidPoc} onClick={onPaidPoc} type="button">
            {busyAction === "paidPoc"
              ? "支付中..."
              : `支付 ${paidPocConfig.priceLabel} 7710 #${nextPaidCall}`}
          </button>
        ) : null}
        <button
          disabled={busy || !(state.policy === "active" && state.payment === "paid")}
          onClick={onOverBudget}
          type="button"
        >
          {busyAction === "overBudget" ? "检查中..." : "尝试超预算"}
        </button>
        <button
          className="danger"
          disabled={
            busy ||
            !(
              state.wallet === "connected" &&
              state.revocation !== "revoked" &&
              hasAdvancedGrant
            )
          }
          onClick={onRevoke}
          type="button"
        >
          {busyAction === "revoke" ? "撤销中..." : "撤销"}
        </button>
        <button className="ghost" disabled={busy} onClick={onReset} type="button">
          {busyAction === "reset" ? "重置中..." : "重置"}
        </button>
      </div>
    </section>
  );
}

export function AgentControls({ state }: Pick<AgentControlsProps, "state">) {
  const copy = getAgentCopy(state);

  return (
    <article className="panel agent-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Agent 运行器</p>
          <h2>{state.policyConfig.service} 任务</h2>
        </div>
        <StatusBadge value={state.agentAction} />
      </div>
      <div className="agent-task">
        <p className="task-title">生成钱包风险简报</p>
        <p>
          Agent 会先生成支出意图，再通过 SpendGuard 策略检查，之后才接收 x402 支付要求并使用 ERC-7710 会话权限。
        </p>
      </div>
      <dl className="detail-list">
        <div>
          <dt>预检查</dt>
          <dd>{copy.precheck}</dd>
        </div>
        <div>
          <dt>下一步</dt>
          <dd>{copy.nextAction}</dd>
        </div>
      </dl>
    </article>
  );
}
