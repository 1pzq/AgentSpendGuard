import type { SpendGuardDemoState, StateEnums } from "@/shared/types";
import { StatusBadge } from "./StatusBadge";

type StateContractProps = {
  state: SpendGuardDemoState;
  stateEnums: StateEnums;
};

export function StateContract({ state, stateEnums }: StateContractProps) {
  const exposedState = {
    stateEnums,
    current: {
      wallet: state.wallet,
      policy: state.policy,
      permission: state.permission,
      agentAction: state.agentAction,
      payment: state.payment,
      relayer: state.relayer,
      ledger: state.ledger,
      revocation: state.revocation
    },
    wallet: state.wallet,
    policy: state.policy,
    permission: state.permission,
    agentAction: state.agentAction,
    payment: state.payment,
    relayer: state.relayer,
    ledger: state.ledger,
    revocation: state.revocation,
    policyConfig: state.policyConfig,
    relayerInfo: state.relayerInfo,
    ledgerEntries: state.ledgerEntries
  };

  return (
    <article className="panel contract-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Frontend state contract</p>
          <h2>Visible mock store</h2>
        </div>
        <StatusBadge label="Live" value="connected" />
      </div>
      <pre aria-label="Current frontend state">
        {JSON.stringify(exposedState, null, 2)}
      </pre>
    </article>
  );
}
