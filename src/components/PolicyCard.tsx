import type { SpendGuardDemoState } from "@/shared/types";
import { StatusBadge } from "./StatusBadge";

type PolicyCardProps = {
  remainingBudget: number;
  state: SpendGuardDemoState;
};

function currency(value: number) {
  return `$${value.toFixed(2)}`;
}

export function PolicyCard({ remainingBudget, state }: PolicyCardProps) {
  const { policyConfig } = state;
  const spentPercent = Math.min(100, (policyConfig.spent / policyConfig.maxSpend) * 100);
  const meterTone =
    state.policy === "revoked" || state.policy === "exhausted" ? "danger" : "ready";

  return (
    <article className="panel policy-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Budget policy</p>
          <h2>{policyConfig.service} risk brief agent</h2>
        </div>
        <StatusBadge value={state.policy} />
      </div>
      <div className="meter" aria-label="Budget remaining">
        <div className="meter-top">
          <span>{currency(policyConfig.spent)} spent</span>
          <span>{currency(Math.max(0, remainingBudget))} left</span>
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
          <dt>Max spend</dt>
          <dd>{policyConfig.maxSpend.toFixed(2)} {policyConfig.token}</dd>
        </div>
        <div>
          <dt>Price per call</dt>
          <dd>{policyConfig.pricePerCall.toFixed(2)} {policyConfig.token}</dd>
        </div>
        <div>
          <dt>Window</dt>
          <dd>{policyConfig.windowHours} hours</dd>
        </div>
        <div>
          <dt>Scope</dt>
          <dd>{policyConfig.service} only</dd>
        </div>
      </dl>
    </article>
  );
}
