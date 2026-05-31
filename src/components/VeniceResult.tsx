import type { SpendGuardDemoState } from "@/shared/types";
import { StatusBadge } from "./StatusBadge";

type VeniceResultProps = {
  state: SpendGuardDemoState;
};

export function VeniceResult({ state }: VeniceResultProps) {
  return (
    <article className="panel result-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">{state.policyConfig.service} result</p>
          <h2>Returned report</h2>
        </div>
        <StatusBadge value={state.veniceResult ? "succeeded" : "waiting"} />
      </div>
      <div className="result-card">
        {state.veniceResult ? (
          <>
            <h3>{state.veniceResult.title}</h3>
            <p>{state.veniceResult.summary}</p>
            <ul>
              {state.veniceResult.findings.map((finding) => (
                <li key={finding}>{finding}</li>
              ))}
            </ul>
          </>
        ) : (
          <p className="empty-text">
            Run the agent after permission approval to show the paid AI output.
          </p>
        )}
      </div>
    </article>
  );
}
