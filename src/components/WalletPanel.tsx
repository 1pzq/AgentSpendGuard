import type { SpendGuardDemoState } from "@/shared/types";
import { StatusBadge } from "./StatusBadge";

type WalletPanelProps = {
  state: SpendGuardDemoState;
};

function walletConnectionCopy(state: SpendGuardDemoState) {
  if (state.wallet === "connected") return "Real MetaMask EOA";
  if (state.wallet === "unsupported") return "MetaMask unavailable";
  return "Not connected";
}

export function WalletPanel({ state }: WalletPanelProps) {
  return (
    <article className="panel wallet-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Wallet</p>
          <h2>MetaMask EOA</h2>
        </div>
        <StatusBadge value={state.wallet} />
      </div>
      <dl className="detail-list">
        <div>
          <dt>Connection</dt>
          <dd>{walletConnectionCopy(state)}</dd>
        </div>
        <div>
          <dt>EOA address</dt>
          <dd>{state.walletInfo.eoa ?? "Not connected"}</dd>
        </div>
        <div>
          <dt>Network</dt>
          <dd>{state.walletInfo.chain}</dd>
        </div>
        <div>
          <dt>Permission account</dt>
          <dd>
            {state.walletInfo.smartAccount ??
              state.advancedPermissionGrant?.from ??
              "No Advanced Permission grant"}
          </dd>
        </div>
        <div>
          <dt>Session account</dt>
          <dd>
            {state.advancedPermissionGrant?.sessionAccount ??
              "No Advanced Permission grant"}
          </dd>
        </div>
      </dl>
    </article>
  );
}
