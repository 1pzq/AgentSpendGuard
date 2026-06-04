import type { SpendGuardDemoState } from "@/shared/types";
import type { PaidErc7710RiskBriefData } from "@/client/x402/payErc7710DeepseekRiskBrief";
import { formatStateLabel, StatusBadge } from "./StatusBadge";

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
  onOverBudget: () => void;
  onReset: () => void;
  onRevoke: () => void;
  onRun: () => void;
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

function x402StatusCopy(state: SpendGuardDemoState) {
  const { challengeStatus, paymentHeaderStatus } = state.x402Evidence;

  if (challengeStatus === "settled" || paymentHeaderStatus === "settled") {
    return "402 settled";
  }
  if (paymentHeaderStatus === "submitted") return "paid header submitted";
  if (challengeStatus === "received_402") return "402 received";
  if (state.payment === "blocked") return "blocked before header";
  return "waiting for 402";
}

function policyEvidenceCopy(state: SpendGuardDemoState) {
  if (state.agentDecision) {
    return `${state.agentDecision.policyCheck} / ${state.agentDecision.estimatedCost}`;
  }
  if (state.payment === "blocked") return "denied / no paid header";
  if (state.policy === "active") return "policy active";
  return "waiting precheck";
}

export function DemoCommand({
  busyAction,
  narrative,
  onApprove,
  onConnect,
  onOverBudget,
  onReset,
  onRevoke,
  onRun,
  paidPocConfig,
  paidPocResult,
  state
}: AgentControlsProps) {
  const showFallbackNote = state.wallet === "unsupported";
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
  const walletCopy = state.walletInfo.eoa
    ? shortenHex(state.walletInfo.eoa)
    : formatStateLabel(state.wallet);

  return (
    <section className="demo-command" aria-label="演示控制">
      <div className="command-copy">
        <p className="eyebrow">Demo controls</p>
        <p>{narrative}</p>
        <dl className="operator-summary" aria-label="演示状态摘要">
          <div>
            <dt>钱包</dt>
            <dd>{walletCopy}</dd>
          </div>
          <div>
            <dt>权限</dt>
            <dd>{formatStateLabel(state.permission)}</dd>
          </div>
          <div>
            <dt>支付轨道</dt>
            <dd>{x402StatusCopy(state)}</dd>
          </div>
          <div>
            <dt>策略证据</dt>
            <dd>{policyEvidenceCopy(state)}</dd>
          </div>
          <div>
            <dt>已支付调用</dt>
            <dd>{paidCalls}</dd>
          </div>
          <div>
            <dt>剩余预算</dt>
            <dd>
              {remainingBudget.toFixed(2)} {state.policyConfig.token}
            </dd>
          </div>
        </dl>
        {showFallbackNote ? (
          <p role="note">
            静态原型：<code>prototype/index.html</code>。模拟 API 仍由服务端守护；真实授权必须在连接成功后才能启用。
          </p>
        ) : null}
        {paidPocResult ? (
          <dl className="settlement-strip" aria-label="ERC-7710 支付结果">
              <div>
                <dt>金额</dt>
                <dd>{paidPocResult.x402.amountAtomic} atomic USDC</dd>
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
              : "运行 Agent"}
        </button>
        <button
          disabled={busy || !(state.policy === "active" && state.payment === "paid")}
          onClick={onOverBudget}
          type="button"
        >
          {busyAction === "overBudget" ? "检查中..." : "测试阻断"}
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
