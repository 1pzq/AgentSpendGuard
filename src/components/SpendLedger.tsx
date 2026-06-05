import type { SpendGuardDemoState } from "@/shared/types";
import { formatStateLabel } from "./StatusBadge";

type SpendLedgerProps = {
  state: SpendGuardDemoState;
};

function fullHash(value: string | null) {
  return value ?? "未记录";
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
      <div className="ledger-table" role="table" aria-label="支出账本">
        <div className="ledger-row ledger-head" role="row">
          <span role="columnheader">调用</span>
          <span role="columnheader">花费</span>
          <span role="columnheader">证明</span>
          <span role="columnheader">状态</span>
        </div>
        {rows.map((entry) => (
          <div className="ledger-row" key={entry.id}>
            <span className="ledger-call">
              <strong>
                {entry.callNumber ? `#${entry.callNumber}` : entry.service}
              </strong>
              <span>{entry.time}</span>
            </span>
            <span className="ledger-accounting">
              <span>{entry.serviceCost}</span>
              <span>剩余 {entry.remainingAfter}</span>
            </span>
            <span className="ledger-proof">
              <span>
                {entry.status === "blocked"
                  ? "未提交 paid header"
                  : `tx ${fullHash(entry.txHash)}`}
              </span>
              <span>payload {fullHash(entry.payloadContextHash)}</span>
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
