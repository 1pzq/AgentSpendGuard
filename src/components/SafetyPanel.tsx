import type { SpendGuardDemoState } from "@/shared/types";
import { formatStateLabel, StatusBadge } from "./StatusBadge";

type SafetyPanelProps = {
  state: SpendGuardDemoState;
};

export function SafetyPanel({ state }: SafetyPanelProps) {
  const revokeReason =
    state.revocation === "revoked"
      ? "The smart account permission is closed for this agent."
      : "Active permission can be revoked by the user.";

  return (
    <article className="panel safety-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Safety proof</p>
          <h2>Blocked and revoked states</h2>
        </div>
        <StatusBadge value={state.revocation} />
      </div>
      <div className="safety-grid">
        <div>
          <p className="mini-label">Over-budget block</p>
          <strong>{state.block.attempted ? "Blocked" : "Not attempted"}</strong>
          <span>{state.block.reason}</span>
        </div>
        <div>
          <p className="mini-label">Revocation</p>
          <strong>{formatStateLabel(state.revocation)}</strong>
          <span>{revokeReason}</span>
        </div>
      </div>
    </article>
  );
}
