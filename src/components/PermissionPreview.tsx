import type { SpendGuardDemoState } from "@/shared/types";
import { StatusBadge } from "./StatusBadge";

type PermissionPreviewProps = {
  state: SpendGuardDemoState;
};

export function PermissionPreview({ state }: PermissionPreviewProps) {
  const grant = state.advancedPermissionGrant;
  const checks = [
    {
      active: grant?.source === "metamask-erc7715",
      copy: "Uses a MetaMask Advanced Permission grant."
    },
    {
      active: grant?.permissionType === "erc20-token-periodic",
      copy: "Grant type is ERC-20 periodic spend."
    },
    {
      active: state.ledger !== "empty",
      copy: "Blocks payment when remaining budget is too low."
    },
    {
      active: state.revocation === "revoked",
      copy: "Revocation closes the policy and future spends."
    }
  ];

  return (
    <article className="panel permission-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Permission preview</p>
          <h2>Readable before signing</h2>
        </div>
        <StatusBadge value={state.permission} />
      </div>
      <div className="permission-copy">
        <p>
          You are authorizing the SpendGuard agent to spend up to{" "}
          <strong>{state.policyConfig.maxSpend.toFixed(2)} {state.policyConfig.token}</strong>{" "}
          during the next <strong>{state.policyConfig.windowHours} hours</strong>.
        </p>
        <p>
          The permission can only be redeemed for the{" "}
          {state.policyConfig.service} risk brief task and can be revoked at any
          time.
        </p>
      </div>
      {grant ? (
        <dl className="detail-list">
          <div>
            <dt>Grant type</dt>
            <dd>{grant.permissionType}</dd>
          </div>
          <div>
            <dt>Delegation manager</dt>
            <dd>{grant.delegationManager}</dd>
          </div>
          <div>
            <dt>Session account</dt>
            <dd>{grant.sessionAccount}</dd>
          </div>
          <div>
            <dt>Expires</dt>
            <dd>{grant.expiresAt}</dd>
          </div>
        </dl>
      ) : null}
      <ul className="check-list" aria-label="Permission boundaries">
        {checks.map((check) => (
          <li className={check.active ? "is-active" : undefined} key={check.copy}>
            {check.copy}
          </li>
        ))}
      </ul>
    </article>
  );
}
