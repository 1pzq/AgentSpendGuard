import type { SpendGuardDemoState } from "@/shared/types";
import { formatStateLabel, StatusBadge } from "./StatusBadge";

type SafetyPanelProps = {
  state: SpendGuardDemoState;
};

export function SafetyPanel({ state }: SafetyPanelProps) {
  const revokeReason =
    state.revocation === "revoked"
      ? "该 agent 的智能账户权限已关闭。"
      : "用户可以撤销当前活跃权限。";

  return (
    <article className="panel safety-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">安全证明</p>
          <h2>阻断与撤销状态</h2>
        </div>
        <StatusBadge value={state.revocation} />
      </div>
      <div className="safety-grid">
        <div>
          <p className="mini-label">超预算阻断</p>
          <strong>{state.block.attempted ? "已阻断" : "未尝试"}</strong>
          <span>{state.block.reason}</span>
        </div>
        <div>
          <p className="mini-label">撤销</p>
          <strong>{formatStateLabel(state.revocation)}</strong>
          <span>{revokeReason}</span>
        </div>
      </div>
    </article>
  );
}
