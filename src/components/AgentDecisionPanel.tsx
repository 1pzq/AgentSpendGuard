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
          <h2>是否值得花这 0.01 USDC</h2>
        </div>
        <StatusBadge value={decision?.decision ?? "waiting"} />
      </div>
      {decision ? (
        <dl className="detail-list agent-decision-list compact-evidence-list">
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
            <dt>Guardrail</dt>
            <dd>
              <span className="decision-inline">
                {decision.estimatedCost}
                <StatusBadge value={decision.policyCheck} />
              </span>
            </dd>
          </div>
        </dl>
      ) : (
        <p className="empty-text">运行 agent 后，这里只显示支出判断、理由和策略结果</p>
      )}
    </article>
  );
}
