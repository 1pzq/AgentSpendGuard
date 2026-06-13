import type { PaidErc7710RiskBriefData } from "@/client/x402/payErc7710DeepseekRiskBrief";
import { BASE_SEPOLIA_EXPLORER_URL } from "@/shared/chain";
import type { SpendGuardDemoState } from "@/shared/types";
import { formatStateLabel, StatusBadge } from "./StatusBadge";

type DemoEvidenceStageProps = {
  paidPocResult: PaidErc7710RiskBriefData | null;
  remainingBudget: number;
  state: SpendGuardDemoState;
};

const REDEEM_SELECTOR = "0xcef6d209";

function shortenHex(value: string | null | undefined, fallback = "待生成") {
  if (!value) return fallback;
  if (value.length <= 16) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function latestProofEntry(state: SpendGuardDemoState) {
  return state.ledgerEntries.find(
    (entry) => entry.txHash || entry.payloadContextHash
  );
}

function onchainAmountCopy(state: SpendGuardDemoState) {
  const onchain = state.onchainPermission;

  if (onchain.status === "available") return onchain.availableAmount;
  if (onchain.status === "querying") return "查询中";
  if (onchain.status === "not_queried") return "待查询";
  if (onchain.status === "not_applicable") return "无链上授权";
  return "不可用";
}

function decisionCopy(state: SpendGuardDemoState) {
  const decision = state.agentDecision;

  if (!decision) {
    return {
      label: "等待 agent",
      reason: "",
      value: "waiting"
    };
  }

  return {
    label: `${formatStateLabel(decision.decision)} / ${formatStateLabel(
      decision.policyCheck
    )}`,
    reason: decision.reason,
    value: decision.policyCheck
  };
}

function x402ChallengeCopy(state: SpendGuardDemoState) {
  const { challengeStatus, paymentHeaderStatus } = state.x402Evidence;

  if (challengeStatus === "settled" || paymentHeaderStatus === "settled") {
    return "402 settled";
  }
  if (paymentHeaderStatus === "submitted") return "paid header submitted";
  if (challengeStatus === "received_402") return "402 received";
  if (state.payment === "blocked") return "blocked before header";
  return "waiting for 402";
}

function stageStepClass(active: boolean, complete: boolean) {
  if (complete) return "is-complete";
  if (active) return "is-active";
  return undefined;
}

function SketchIcon({ type }: { type: "wallet" | "guard" | "payment" | "proof" }) {
  const filterId = `sketch-roughen-${type}`;
  const seedByType = {
    guard: 17,
    payment: 23,
    proof: 31,
    wallet: 11
  } satisfies Record<typeof type, number>;
  const paths = {
    guard: {
      ghost: [
        "M31.1 8.9c7.4 4.1 14.1 5 20.2 6.4 1.2 15.7-4.8 28.9-19.2 39.3C17.2 46 10.9 31.6 11.8 15.2c7.3-.9 13.9-2.6 19.3-6.3Z",
        "M22.7 31.7c2.4 2.2 4.2 4.1 6.7 6.1 4.6-4.7 8.2-9.5 13.1-14.3"
      ],
      main: [
        "M31.8 8.6c6.8 4.6 14.8 5.2 20.4 6.5.7 15.3-4.3 28.6-20.1 39.5C17.5 45.8 10.3 31.9 12 14.9c7.8-.7 13.8-2.8 19.8-6.3Z",
        "m23.1 31.3 6.3 6.2 12.7-14.1"
      ],
      texture: [
        "M18.4 18.1c3.7-.8 7.8-2.2 11.6-4.1",
        "M46.8 20.6c-.6 8.7-3.7 18.8-14.9 27.1"
      ]
    },
    payment: {
      ghost: [
        "M13.2 17.9c11.6-2 25.4-1.6 37.5.3 2.5.4 4.7 2.8 4.8 5.5.4 4.9.1 10.1-.5 14.8-.5 3.4-3.4 6.2-6.6 6.4-10.2.9-22.9.7-34-.3-3.1-.3-6-3.2-6.2-6.5-.4-5.1-.1-9.7.4-14 .4-3.1 1.8-5.6 4.6-6.2Z",
        "M10.5 27.5c8.6.8 31.7 1 43.1-.4"
      ],
      main: [
        "M13.5 17.4c12.3-1.6 24.9-1.4 37.1.5 2.9.5 5.1 2.9 5.2 5.8.2 4.8.1 9.7-.4 14.5-.4 3.6-3.3 6.4-6.8 6.7-10.9.9-22.3.8-34.1-.4-3.5-.4-6.2-3.3-6.4-6.8-.2-4.7-.1-9.4.4-14.1.3-3.4 2-6.2 5-6.7Z",
        "M10.8 27.1c9.4 1.1 30.6.9 43.2-.3",
        "M17.4 37.5c3.1-.4 7.6-.3 11.3 0"
      ],
      texture: [
        "M18.1 22.1c7.9-.6 20.4-.7 29.2.1",
        "M36.2 37.7c2.6-.3 5.2-.2 8.5.2"
      ]
    },
    proof: {
      ghost: [
        "M18.4 10.4c6.4-.7 16.7-.8 24.6.6 2.7.4 4.4 2.4 4.8 5 1.6 9.4 1.4 22.4-.2 32.3-.5 2.7-2.6 4.4-5.1 4.8-7.1.9-16.9.6-24.3-.4-2.4-.4-4.2-2.1-4.6-4.6-1.5-9.8-1.6-21.8 0-32.4.4-2.8 1.9-4.8 4.8-5.3Z",
        "M24.6 26.7c4.1-1.2 11.2-1.3 15.4.2"
      ],
      main: [
        "M18 10.8c6.1-.8 17.4-.7 25.2.5 2.4.4 4.2 2.2 4.6 4.6 1.8 10.4 1.7 22.5-.2 32.6-.5 2.6-2.7 4.5-5.3 4.8-7.6.7-16.2.6-24.1-.4-2.5-.3-4.4-2.3-4.8-4.8-1.6-10.3-1.6-21.4.1-32.4.4-2.8 1.9-4.9 4.5-5.4Z",
        "M24.2 26.2c4.9-1.2 11.4-1.1 15.8.2",
        "M24.4 35c3.6.8 9.8.9 15.1-.2",
        "M30.8 6.8c.2 4.3.1 6.3-.2 10.4"
      ],
      texture: [
        "M22.6 43.3c4.7.4 11.4.2 17.7-.6",
        "M36.4 7.8c1.4.1 2.8.2 4.2.4"
      ]
    },
    wallet: {
      ghost: [
        "M12.4 19.1c8.5-2.9 25.1-5.2 37.9-2.1 3 .7 4.8 2.8 4.6 5.9-.1 7.3-.1 14.4-.6 21.1-.2 3.7-2.5 6.1-5.4 6.4-10.6.9-24.9.9-36.1-.8-2.6-.4-4.9-2.5-5-5.2-.3-6-.2-12.9-.1-19 .1-2.6 1.8-5.1 4.7-6.3Z",
        "M39.1 31.1c5-.7 10-.5 15 .4"
      ],
      main: [
        "M12 19.5c8.2-3.1 25.7-5 38.4-2.2 2.8.6 4.6 2.9 4.5 5.7l-.4 21.4c-.1 3.2-2.5 5.8-5.7 6.1-10.5 1-24.6.8-36.2-.7-2.8-.4-4.8-2.8-4.8-5.6V25.4c0-2.5 1.6-5 4.2-5.9Z",
        "M39.4 31.5c5.3-.4 9.5-.3 14.8.3",
        "M43.9 38.3c1.5 1.1 3.5 1 4.8-.2"
      ],
      texture: [
        "M16.4 25.4c5.2-1 13-1.6 20.1-1.2",
        "M15.4 45.2c9.9 1.1 21.6 1 31.6.3"
      ]
    }
  }[type];

  return (
    <svg aria-hidden="true" className="sketch-icon" viewBox="0 0 64 64">
      <defs>
        <filter id={filterId}>
          <feTurbulence
            baseFrequency="0.72"
            numOctaves="2"
            seed={seedByType[type]}
            type="fractalNoise"
          />
          <feDisplacementMap in="SourceGraphic" scale="0.55" />
        </filter>
      </defs>
      <g className="sketch-lines" filter={`url(#${filterId})`}>
        {paths.ghost.map((path) => (
          <path className="sketch-ghost" d={path} key={path} />
        ))}
        {paths.main.map((path) => (
          <path className="sketch-main" d={path} key={path} />
        ))}
        {paths.texture.map((path) => (
          <path className="sketch-texture" d={path} key={path} />
        ))}
      </g>
    </svg>
  );
}

export function DemoEvidenceStage({
  paidPocResult,
  remainingBudget,
  state
}: DemoEvidenceStageProps) {
  const latestEntry = latestProofEntry(state);
  const requirement = state.x402Evidence.selectedRequirement;
  const proof = state.erc7710Proof;
  const payload = proof.payload;
  const grant = proof.grant;
  const decision = decisionCopy(state);
  const spentPercent = Math.min(
    100,
    (state.policyConfig.spent / state.policyConfig.maxSpend) * 100
  );
  const txHash =
    state.x402Evidence.paidRequest.txHash ??
    state.relayerInfo.txHash ??
    latestEntry?.txHash ??
    null;
  const payloadHash =
    payload?.permissionContextHash ?? latestEntry?.payloadContextHash ?? null;
  const explorerHref = txHash
    ? `${BASE_SEPOLIA_EXPLORER_URL}/tx/${txHash}`
    : null;
  const hasPayload = !!payloadHash;
  const hasChallenge = state.x402Evidence.challengeStatus !== "idle";
  const hasPaidHeader =
    state.x402Evidence.paymentHeaderStatus === "submitted" ||
    state.x402Evidence.paymentHeaderStatus === "settled";
  const hasSettlement =
    state.payment === "paid" ||
    state.x402Evidence.paymentHeaderStatus === "settled" ||
    !!txHash;
  const aiResultCopy = state.veniceResult
    ? "DeepSeek 简报已返回"
    : hasSettlement
      ? "结算后执行 DeepSeek"
      : "等待结算后执行";

  return (
    <section className="demo-evidence-stage" aria-label="核心演示证据">
      <div className="evidence-card-grid">
        <article className="evidence-card evidence-card-budget">
          <span className="sketch-icon-shell">
            <SketchIcon type="wallet" />
          </span>
          <div className="evidence-card-header">
            <div>
              <p className="evidence-label">预算策略</p>
              <h3>MetaMask AP 给 agent 预算</h3>
            </div>
            <StatusBadge value={state.permission} />
          </div>
          <div className="evidence-meter" aria-label="预算使用进度">
            <div>
              <span>已用 {state.policyConfig.spent.toFixed(2)} USDC</span>
              <span>剩余 {remainingBudget.toFixed(2)} USDC</span>
            </div>
            <span>
              <i style={{ width: `${spentPercent}%` }} />
            </span>
          </div>
          <dl className="evidence-metrics two-col">
            <div>
              <dt>预算上限</dt>
              <dd>{state.policyConfig.maxSpend.toFixed(2)} USDC</dd>
            </div>
            <div>
              <dt>单次价格</dt>
              <dd>{state.accounting.servicePrice}</dd>
            </div>
            <div>
              <dt>允许用途</dt>
              <dd>{state.policyConfig.service} 风险简报</dd>
            </div>
            <div>
              <dt>链上可用</dt>
              <dd>{onchainAmountCopy(state)}</dd>
            </div>
            <div>
              <dt>时间窗口</dt>
              <dd>{state.policyConfig.windowHours} 小时</dd>
            </div>
            <div>
              <dt>授权类型</dt>
              <dd>{grant?.source === "metamask-erc7715" ? "MetaMask AP" : "待授权"}</dd>
            </div>
          </dl>
        </article>

        <article className="evidence-card evidence-card-agent">
          <span className="sketch-icon-shell">
            <SketchIcon type="guard" />
          </span>
          <div className="evidence-card-header">
            <div>
              <p className="evidence-label">Agent 决策</p>
              
            </div>
            <StatusBadge value={decision.value} />
          </div>
          <div className="decision-quote">
            <strong>{decision.label}</strong>
            {decision.reason ? <p>{decision.reason}</p> : null}
          </div>
          <dl className="evidence-metrics two-col">
            <div>
              <dt>估算成本</dt>
              <dd>{state.agentDecision?.estimatedCost ?? state.accounting.servicePrice}</dd>
            </div>
            <div>
              <dt>策略结果</dt>
              <dd>{state.agentDecision ? formatStateLabel(state.agentDecision.policyCheck) : "待预检"}</dd>
            </div>
            <div>
              <dt>检查范围</dt>
              <dd>budget / endpoint / token / network / payTo</dd>
            </div>
            <div>
              <dt>超预算</dt>
              <dd>{state.block.attempted ? "付款前阻断" : "待测试"}</dd>
            </div>
          </dl>
        </article>

        <article className="evidence-card evidence-card-payment">
          <span className="sketch-icon-shell">
            <SketchIcon type="payment" />
          </span>
          <div className="evidence-card-header">
            <div>
              <p className="evidence-label">x402 支付轨道</p>
              <h3>402 challenge 到 ERC-7710 payment payload</h3>
            </div>
            <StatusBadge value={state.payment} />
          </div>
          <ol className="payment-mini-steps" aria-label="x402 支付进度">
            <li className={stageStepClass(hasChallenge, hasChallenge)}>
              <span>01</span>
              <strong>{x402ChallengeCopy(state)}</strong>
            </li>
            <li className={stageStepClass(hasPayload, hasPayload)}>
              <span>02</span>
              <strong>ERC-7710 payload {shortenHex(payloadHash, "pending")}</strong>
            </li>
            <li className={stageStepClass(hasPaidHeader, hasPaidHeader)}>
              <span>03</span>
              <strong>{formatStateLabel(state.x402Evidence.paymentHeaderStatus)}</strong>
            </li>
            <li className={stageStepClass(hasSettlement, hasSettlement)}>
              <span>04</span>
              <strong>{hasSettlement ? "settlement recorded" : "waiting settlement"}</strong>
            </li>
          </ol>
          <dl className="evidence-metrics two-col">
            <div>
              <dt>Scheme</dt>
              <dd>{requirement.scheme}</dd>
            </div>
            <div>
              <dt>Transfer</dt>
              <dd>{requirement.assetTransferMethod}</dd>
            </div>
            <div>
              <dt>Resource</dt>
              <dd>{state.x402Evidence.protectedResource}</dd>
            </div>
          </dl>
        </article>

        <article className="evidence-card evidence-card-proof">
          <span className="sketch-icon-shell">
            <SketchIcon type="proof" />
          </span>
          <div className="evidence-card-header">
            <div>
              <p className="evidence-label">结算证据</p>
              <h3>AI 风险简报</h3>
            </div>
            <StatusBadge value={state.ledger} />
          </div>
          <dl className="evidence-metrics two-col">
            <div>
              <dt>DelegationManager</dt>
              <dd>{shortenHex(grant?.delegationManager, "授权后显示")}</dd>
            </div>
            <div>
              <dt>Redeem selector</dt>
              <dd>{REDEEM_SELECTOR}</dd>
            </div>
            <div>
              <dt>Relay fee</dt>
              <dd>{state.accounting.relayFee}</dd>
            </div>
            <div>
              <dt>AI provider</dt>
              <dd>{aiResultCopy}</dd>
            </div>
          </dl>
          {state.veniceResult ? (
            <div className="ai-result-mini">
              <strong>{state.veniceResult.title}</strong>
              <p>{state.veniceResult.summary}</p>
            </div>
          ) : null}
        </article>
      </div>
    </section>
  );
}
