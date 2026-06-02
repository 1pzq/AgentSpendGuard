import type { SpendGuardDemoState } from "@/shared/types";
import { StatusBadge } from "./StatusBadge";

type AgentDecisionPanelProps = {
  state: SpendGuardDemoState;
};

function decisionLabel(decision: NonNullable<SpendGuardDemoState["agentDecision"]>) {
  if (decision.decision === "spend") return "Spend";
  if (decision.decision === "skip") return "Skip";
  return "Blocked";
}

export function AgentDecisionPanel({ state }: AgentDecisionPanelProps) {
  const decision = state.agentDecision;

  return (
    <article className="panel agent-decision-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Agent Decision</p>
          <h2>AI 支出意图</h2>
        </div>
        <StatusBadge value={decision?.decision ?? "waiting"} />
      </div>
      {decision ? (
        <dl className="detail-list agent-decision-list">
          <div>
            <dt>Decision</dt>
            <dd>
              <span className="decision-inline">
                {decisionLabel(decision)}
                <StatusBadge value={decision.confidence} />
              </span>
            </dd>
          </div>
          <div>
            <dt>Why</dt>
            <dd>{decision.reason}</dd>
          </div>
          <div>
            <dt>Estimated cost</dt>
            <dd>{decision.estimatedCost}</dd>
          </div>
          <div>
            <dt>Budget before</dt>
            <dd>{decision.budgetBefore}</dd>
          </div>
          <div>
            <dt>Budget after</dt>
            <dd>{decision.budgetAfter}</dd>
          </div>
          <div>
            <dt>Enforcement</dt>
            <dd>
              <span className="decision-inline">
                <StatusBadge value={decision.policyCheck} />
                {decision.enforcement}
              </span>
            </dd>
          </div>
        </dl>
      ) : (
        <p className="empty-text">尚未生成支出决策。</p>
      )}
    </article>
  );
}
