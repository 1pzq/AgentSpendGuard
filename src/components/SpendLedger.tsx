import type { SpendGuardDemoState } from "@/shared/types";
import { formatStateLabel, StatusBadge } from "./StatusBadge";

type SpendLedgerProps = {
  state: SpendGuardDemoState;
};

function shortenHex(value: string | null) {
  if (!value) return "未记录";
  if (value.length <= 16) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function SpendLedger({ state }: SpendLedgerProps) {
  const rows =
    state.ledgerEntries.length > 0
      ? state.ledgerEntries
      : [
          {
            id: "empty-ledger-row",
            time: "暂无账本记录",
            service: "等待中",
            cost: "0.00 USDC",
            budgetConsumed: "0.00 USDC",
            relayFee: "未报价",
            serviceCost: "0.00 USDC",
            status: "empty",
            callNumber: null,
            childDelegationTarget: null,
            agentDecision: null,
            agentDecisionReason: null,
            paymentRequirementId: null,
            payloadContextHash: null,
            remainingAfter: `${state.policyConfig.maxSpend.toFixed(2)} ${state.policyConfig.token}`,
            totalWalletDebit: "未结算",
            txHash: null
          }
        ] as const;

  return (
    <article className="panel ledger-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">支出账本</p>
          <h2>可观察的 agent 支出</h2>
        </div>
        <StatusBadge value={state.ledger} />
      </div>
      <div className="ledger-table" role="table" aria-label="支出账本">
        <div className="ledger-row ledger-head" role="row">
          <span role="columnheader">时间</span>
          <span role="columnheader">服务</span>
          <span role="columnheader">记账</span>
          <span role="columnheader">证明</span>
          <span role="columnheader">状态</span>
        </div>
        {rows.map((entry) => (
          <div className="ledger-row" key={entry.id}>
            <span>{entry.time}</span>
            <span>{entry.service}</span>
            <span className="ledger-accounting">
              <span>服务 {entry.serviceCost}</span>
              <span>中继 {entry.relayFee}</span>
              <span>钱包 {entry.totalWalletDebit}</span>
              <span>预算 {entry.budgetConsumed}</span>
            </span>
            <span className="ledger-proof">
              {entry.payloadContextHash ? (
                <span>payload {shortenHex(entry.payloadContextHash)}</span>
              ) : entry.status === "blocked" ? (
                <span>未提交付费 header</span>
              ) : (
                <span>等待 payload</span>
              )}
              <span>交易 {shortenHex(entry.txHash)}</span>
              <span>剩余 {entry.remainingAfter}</span>
              {entry.agentDecision ? (
                <span>
                  AI {formatStateLabel(entry.agentDecision.decision)}：
                  {entry.agentDecision.reason}
                </span>
              ) : null}
            </span>
            <span>
              <span className={`ledger-status ${entry.status}`}>
                {formatStateLabel(entry.status)}
              </span>
            </span>
          </div>
        ))}
      </div>
    </article>
  );
}
