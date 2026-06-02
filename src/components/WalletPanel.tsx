import type { SpendGuardDemoState } from "@/shared/types";
import { StatusBadge } from "./StatusBadge";

type WalletPanelProps = {
  state: SpendGuardDemoState;
};

function walletConnectionCopy(state: SpendGuardDemoState) {
  if (state.wallet === "connected") return "真实 MetaMask EOA";
  if (state.wallet === "unsupported") return "MetaMask 不可用";
  return "未连接";
}

export function WalletPanel({ state }: WalletPanelProps) {
  return (
    <article className="panel wallet-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">钱包</p>
          <h2>MetaMask EOA</h2>
        </div>
        <StatusBadge value={state.wallet} />
      </div>
      <dl className="detail-list">
        <div>
          <dt>连接状态</dt>
          <dd>{walletConnectionCopy(state)}</dd>
        </div>
        <div>
          <dt>EOA 地址</dt>
          <dd>{state.walletInfo.eoa ?? "未连接"}</dd>
        </div>
        <div>
          <dt>网络</dt>
          <dd>{state.walletInfo.chain}</dd>
        </div>
        <div>
          <dt>授权账户</dt>
          <dd>
            {state.walletInfo.smartAccount ??
              state.advancedPermissionGrant?.from ??
              "暂无 Advanced Permission 授权"}
          </dd>
        </div>
        <div>
          <dt>会话账户</dt>
          <dd>
            {state.advancedPermissionGrant?.sessionAccount ??
              "暂无 Advanced Permission 授权"}
          </dd>
        </div>
      </dl>
    </article>
  );
}
