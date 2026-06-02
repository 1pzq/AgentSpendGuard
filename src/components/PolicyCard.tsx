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
          <h2>{policyConfig.service} 风险简报 agent</h2>
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
      <dl className="detail-list two-col">
        <div>
          <dt>预算上限</dt>
          <dd>{policyConfig.maxSpend.toFixed(2)} {policyConfig.token}</dd>
        </div>
        <div>
          <dt>单次价格</dt>
          <dd>{accounting.servicePrice}</dd>
        </div>
        <div>
          <dt>有效窗口</dt>
          <dd>{policyConfig.windowHours} 小时</dd>
        </div>
        <div>
          <dt>作用范围</dt>
          <dd>仅限 {policyConfig.service}</dd>
        </div>
      </dl>
      <dl className="accounting-strip" aria-label="预算边界">
        <div>
          <dt>本地 agent 预算余额</dt>
          <dd>{accounting.remainingBudget}</dd>
        </div>
        <div>
          <dt>链上 permission 可用额度</dt>
          <dd>{onchainAmountCopy(state)}</dd>
        </div>
        <div>
          <dt>链上来源</dt>
          <dd>ERC20PeriodTransferEnforcer</dd>
        </div>
        <div>
          <dt>链上状态</dt>
          <dd>{onchainDetailCopy(state)}</dd>
        </div>
      </dl>
      <dl className="accounting-strip" aria-label="预算记账">
        <div>
          <dt>x402 服务价</dt>
          <dd>{accounting.servicePrice}</dd>
        </div>
        <div>
          <dt>中继费</dt>
          <dd>{accounting.relayFee}</dd>
        </div>
        <div>
          <dt>钱包扣款</dt>
          <dd>{accounting.totalWalletDebit}</dd>
        </div>
        <div>
          <dt>预算消耗</dt>
          <dd>{accounting.agentBudgetConsumed}</dd>
        </div>
      </dl>
      <p className="accounting-note">{accounting.policyNote}</p>
    </article>
  );
}
