import type { SpendGuardDemoState, StateEnums } from "@/shared/types";
import { formatStateLabel, StatusBadge } from "./StatusBadge";

type StateContractProps = {
  state: SpendGuardDemoState;
  stateEnums: StateEnums;
};

export function StateContract({ state, stateEnums }: StateContractProps) {
  const zhStateEnums = Object.fromEntries(
    Object.entries(stateEnums).map(([key, values]) => [
      key,
      values.map((value) => ({
        raw: value,
        label: formatStateLabel(value)
      }))
    ])
  );
  const exposedState = {
    状态枚举: zhStateEnums,
    当前状态: {
      钱包: formatStateLabel(state.wallet),
      策略: formatStateLabel(state.policy),
      权限: formatStateLabel(state.permission),
      agent动作: formatStateLabel(state.agentAction),
      支付: formatStateLabel(state.payment),
      中继: formatStateLabel(state.relayer),
      账本: formatStateLabel(state.ledger),
      撤销: formatStateLabel(state.revocation)
    },
    原始状态: {
      wallet: state.wallet,
      policy: state.policy,
      permission: state.permission,
      agentAction: state.agentAction,
      payment: state.payment,
      relayer: state.relayer,
      ledger: state.ledger,
      revocation: state.revocation
    },
    策略配置: state.policyConfig,
    中继信息: state.relayerInfo,
    账本记录: state.ledgerEntries
  };

  return (
    <article className="panel contract-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">前端状态合同</p>
          <h2>可见状态存储</h2>
        </div>
        <StatusBadge label="实时" value="connected" />
      </div>
      <pre aria-label="当前前端状态">
        {JSON.stringify(exposedState, null, 2)}
      </pre>
    </article>
  );
}
