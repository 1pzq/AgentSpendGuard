import type { SpendGuardDemoState } from "@/shared/types";
import { StatusBadge } from "./StatusBadge";

type PolicyCardProps = {
  remainingBudget: number;
  state: SpendGuardDemoState;
};

function currency(value: number) {
  return `${value.toFixed(2)} USDC`;
}

function onchainAmountCopy(state: SpendGuardDemoState) {
  const onchain = state.onchainPermission;

  if (onchain.status === "available") return onchain.availableAmount;
  if (onchain.status === "querying") return "查询中";
  if (onchain.status === "not_queried") return "待查询";
  if (onchain.status === "not_applicable") return "无链上授权";
  return "不可用";
}

function onchainDetailCopy(state: SpendGuardDemoState) {
  const onchain = state.onchainPermission;

  if (onchain.status === "available") {
    return onchain.isNewPeriod ? "新周期" : `period ${onchain.currentPeriod ?? "-"}`;
  }

  return onchain.error ?? "等待链上读取";
}

export function PolicyCard({ remainingBudget, state }: PolicyCardProps) {
  const { policyConfig } = state;
  const { accounting } = state;
  const spentPercent = Math.min(100, (policyConfig.spent / policyConfig.maxSpend) * 100);
  const meterTone =
    state.policy === "revoked" || state.policy === "exhausted" ? "danger" : "ready";

  return (
    <article className="panel policy-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">预算策略</p>
          <h2>给 agent 一条小预算</h2>
        </div>
        <StatusBadge value={state.policy} />
      </div>
      <div className="meter" aria-label="剩余预算">
        <div className="meter-top">
          <span>已用 {currency(policyConfig.spent)}</span>
          <span>剩余 {currency(Math.max(0, remainingBudget))}</span>
        </div>
        <div className="meter-track">
          <span
            className="meter-fill"
            data-tone={meterTone}
            style={{ width: `${spentPercent}%` }}
          />
        </div>
      </div>
      <dl className="accounting-strip policy-summary-strip" aria-label="预算摘要">
        <div>
          <dt>预算上限</dt>
          <dd>{policyConfig.maxSpend.toFixed(2)} {policyConfig.token}</dd>
        </div>
        <div>
          <dt>单次价格</dt>
          <dd>{accounting.servicePrice}</dd>
        </div>
        <div>
          <dt>允许用途</dt>
          <dd>{policyConfig.service} 风险简报</dd>
        </div>
        <div>
          <dt>链上可用</dt>
          <dd>{onchainAmountCopy(state)}</dd>
        </div>
        <div>
          <dt>时间窗口</dt>
          <dd>{policyConfig.windowHours} 小时</dd>
        </div>
        <div>
          <dt>链上状态</dt>
          <dd>{onchainDetailCopy(state)}</dd>
        </div>
      </dl>
      <p className="accounting-note">
        预算只计算 x402 服务价；钱包扣款细节会写入账本。
      </p>
    </article>
  );
}
