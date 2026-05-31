import type { SpendGuardDemoState } from "@/shared/types";
import type { Erc7710DryRunPreview } from "@/client/x402/dryRunErc7710Payment";
import type { PaidErc7710RiskBriefData } from "@/client/x402/payErc7710DeepseekRiskBrief";
import { StatusBadge } from "./StatusBadge";

type PaidPocConfig = {
  amountAtomic: string;
  enabled: boolean;
  priceLabel: string;
};

type AgentControlsProps = {
  busyAction: string | null;
  narrative: string;
  onApprove: () => void;
  onConnect: () => void;
  onDryRun: () => void;
  onOverBudget: () => void;
  onPaidPoc: () => void;
  onReset: () => void;
  onRevoke: () => void;
  onRun: () => void;
  dryRunControlsEnabled: boolean;
  dryRunPreview: Erc7710DryRunPreview | null;
  paidPocConfig: PaidPocConfig;
  paidPocResult: PaidErc7710RiskBriefData | null;
  state: SpendGuardDemoState;
};

function getAgentCopy(state: SpendGuardDemoState) {
  if (state.wallet === "unsupported") {
    return {
      precheck: "MetaMask on Base Sepolia required",
      nextAction: "Retry Connect after enabling MetaMask or switching networks"
    };
  }

  if (state.wallet !== "connected") {
    return {
      precheck: "Waiting for MetaMask",
      nextAction: "Connect a Base Sepolia EOA"
    };
  }

  if (state.permission === "requested") {
    return {
      precheck: "Policy ready to sign",
      nextAction: "Approve MetaMask Advanced Permission"
    };
  }

  if (state.permission === "rejected") {
    return {
      precheck: "Advanced Permission was not approved",
      nextAction: "Approve MetaMask Advanced Permission"
    };
  }

  if (state.permission === "redeemed" && state.payment === "paid") {
    return {
      precheck: "First paid task succeeded",
      nextAction: "Try over-budget request"
    };
  }

  if (state.policy === "active") {
    return {
      precheck: "Budget, scope, and expiry passed",
      nextAction: `Run ${state.policyConfig.service} task`
    };
  }

  if (state.policy === "exhausted") {
    return {
      precheck: "Budget check failed",
      nextAction: "Revoke or wait for a new window"
    };
  }

  if (state.policy === "revoked") {
    return {
      precheck: "Permission revoked",
      nextAction: "No further spends allowed"
    };
  }

  return {
    precheck: "Waiting",
    nextAction: "Continue demo"
  };
}

function shortenHex(value: string) {
  if (value.length <= 14) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function DemoCommand({
  busyAction,
  dryRunControlsEnabled,
  dryRunPreview,
  narrative,
  onApprove,
  onConnect,
  onDryRun,
  onOverBudget,
  onPaidPoc,
  onReset,
  onRevoke,
  onRun,
  paidPocConfig,
  paidPocResult,
  state
}: AgentControlsProps) {
  const showFallbackNote = state.wallet === "unsupported";
  const showDryRunControls = dryRunControlsEnabled;
  const showPaidPocControls = paidPocConfig.enabled;
  const busy = busyAction !== null;
  const canApprove =
    state.wallet === "connected" &&
    (state.permission === "requested" || state.permission === "rejected");
  const hasAdvancedGrant = state.advancedPermissionGrant !== null;
  const canDryRun =
    showDryRunControls &&
    state.wallet === "connected" &&
    state.permission === "approved" &&
    state.policy === "active" &&
    hasAdvancedGrant;
  const canPaidPoc =
    showPaidPocControls &&
    state.wallet === "connected" &&
    state.permission === "approved" &&
    state.policy === "active" &&
    hasAdvancedGrant;

  return (
    <section className="demo-command" aria-label="Demo controls">
      <div className="command-copy">
        <h2>Demo runbook</h2>
        <p>{narrative}</p>
        {showPaidPocControls && !paidPocResult ? (
          <p className="paid-poc-note">
            ERC-7710 payment spends {paidPocConfig.priceLabel} Base Sepolia USDC.
          </p>
        ) : null}
        {showFallbackNote ? (
          <p role="note">
            Static prototype: <code>prototype/index.html</code>. Mock API validation
            remains server-guarded; real approval stays locked until Connect succeeds.
          </p>
        ) : null}
        {showDryRunControls && dryRunPreview ? (
          <details className="dry-run-result" open>
            <summary>ERC-7710 dry-run preview</summary>
            <dl className="detail-list two-col" aria-label="ERC-7710 dry-run result">
              <div>
                <dt>Requirement</dt>
                <dd>
                  {dryRunPreview.requirement.amountAtomic} atomic USDC to{" "}
                  {shortenHex(dryRunPreview.requirement.payTo)}
                </dd>
              </div>
              <div>
                <dt>Delegator</dt>
                <dd>{shortenHex(dryRunPreview.payload.delegator)}</dd>
              </div>
              <div>
                <dt>Payload hash</dt>
                <dd>{shortenHex(dryRunPreview.payload.permissionContextHash)}</dd>
              </div>
              <div>
                <dt>No-spend guard</dt>
                <dd>
                  {dryRunPreview.safeguards.paymentSignatureHeaderSubmitted
                    ? "Header submitted"
                    : "No payment header sent"}
                </dd>
              </div>
            </dl>
          </details>
        ) : null}
        {showPaidPocControls && paidPocResult ? (
          <details className="paid-poc-result" open>
            <summary>ERC-7710 payment result</summary>
            <dl className="detail-list two-col" aria-label="ERC-7710 payment result">
              <div>
                <dt>Amount</dt>
                <dd>{paidPocResult.x402.amountAtomic} atomic USDC</dd>
              </div>
              <div>
                <dt>Payer</dt>
                <dd>{shortenHex(paidPocResult.x402.payer)}</dd>
              </div>
              <div>
                <dt>Pay to</dt>
                <dd>{shortenHex(paidPocResult.x402.payTo)}</dd>
              </div>
              <div>
                <dt>Tx hash</dt>
                <dd>
                  {paidPocResult.x402.txHash
                    ? shortenHex(paidPocResult.x402.txHash)
                    : "Settlement pending"}
                </dd>
              </div>
            </dl>
          </details>
        ) : null}
      </div>
      <div className="button-row">
        <button
          disabled={busy || state.wallet === "connected"}
          onClick={onConnect}
          type="button"
        >
          {busyAction === "connect" ? "Connecting..." : "Connect"}
        </button>
        <button
          disabled={busy || !canApprove}
          onClick={onApprove}
          type="button"
        >
          {busyAction === "approve" ? "Approving..." : "Approve Permission"}
        </button>
        <button
          disabled={
            busy ||
            !(
              state.policy === "active" &&
              state.permission === "approved" &&
              hasAdvancedGrant &&
              paidPocConfig.enabled
            )
          }
          onClick={onRun}
          type="button"
        >
          {busyAction === "run" ? "Running..." : "Run Agent"}
        </button>
        {showDryRunControls ? (
          <button disabled={busy || !canDryRun} onClick={onDryRun} type="button">
            {busyAction === "dryRun" ? "Previewing..." : "Dry Run 7710"}
          </button>
        ) : null}
        {showPaidPocControls ? (
          <button disabled={busy || !canPaidPoc} onClick={onPaidPoc} type="button">
            {busyAction === "paidPoc"
              ? "Paying..."
              : `Pay ${paidPocConfig.priceLabel} 7710`}
          </button>
        ) : null}
        <button
          disabled={busy || !(state.policy === "active" && state.payment === "paid")}
          onClick={onOverBudget}
          type="button"
        >
          {busyAction === "overBudget" ? "Checking..." : "Try Over Budget"}
        </button>
        <button
          className="danger"
          disabled={
            busy ||
            !(
              state.wallet === "connected" &&
              state.revocation !== "revoked" &&
              hasAdvancedGrant
            )
          }
          onClick={onRevoke}
          type="button"
        >
          {busyAction === "revoke" ? "Revoking..." : "Revoke"}
        </button>
        <button className="ghost" disabled={busy} onClick={onReset} type="button">
          {busyAction === "reset" ? "Resetting..." : "Reset"}
        </button>
      </div>
    </section>
  );
}

export function AgentControls({ state }: Pick<AgentControlsProps, "state">) {
  const copy = getAgentCopy(state);

  return (
    <article className="panel agent-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Agent runner</p>
          <h2>{state.policyConfig.service} task</h2>
        </div>
        <StatusBadge value={state.agentAction} />
      </div>
      <div className="agent-task">
        <p className="task-title">Generate a wallet risk brief</p>
        <p>
          Agent prechecks policy, receives an x402 payment requirement, redeems
          the ERC-7710 session permission, then returns a paid AI result.
        </p>
      </div>
      <dl className="detail-list">
        <div>
          <dt>Precheck</dt>
          <dd>{copy.precheck}</dd>
        </div>
        <div>
          <dt>Next action</dt>
          <dd>{copy.nextAction}</dd>
        </div>
      </dl>
    </article>
  );
}
