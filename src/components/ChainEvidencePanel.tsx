import { BASE_SEPOLIA_EXPLORER_URL } from "@/shared/chain";
import type { SpendGuardDemoState } from "@/shared/types";
import { StatusBadge } from "./StatusBadge";

type ChainEvidencePanelProps = {
  state: SpendGuardDemoState;
};

const REDEEM_DELEGATIONS_SELECTOR = "0xcef6d209";
const REDEEM_DELEGATIONS_SIGNATURE =
  "redeemDelegations(bytes[],bytes32[],bytes[])";

function shortenHex(value: string | null) {
  if (!value) return "未记录";
  if (value.length <= 16) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function latestProofEntry(state: SpendGuardDemoState) {
  return state.ledgerEntries.find(
    (entry) => entry.txHash || entry.payloadContextHash
  );
}

function chainEvidenceStatus(state: SpendGuardDemoState, txHash: string | null) {
  if (txHash) return "confirmed";
  if (state.payment === "blocked") return "blocked";
  if (state.x402Evidence.paymentHeaderStatus === "submitted") return "pending";
  return "waiting";
}

function chainEvidenceCopy(state: SpendGuardDemoState, txHash: string | null) {
  if (txHash) {
    return "已记录链上 tx。评审可在 Basescan 对照 DelegationManager、方法 selector、payload hash 和 USDC 转账。";
  }
  if (state.payment === "blocked") {
    return "本次请求在付款前被阻断；没有 PAYMENT header，也没有 settlement tx。";
  }
  if (state.x402Evidence.paymentHeaderStatus === "submitted") {
    return "paid request 已提交，正在等待 settlement 结果。";
  }
  return "尚未产生链上 settlement 证据。";
}

export function ChainEvidencePanel({ state }: ChainEvidencePanelProps) {
  const proofEntry = latestProofEntry(state);
  const txHash = state.x402Evidence.paidRequest.txHash ?? proofEntry?.txHash ?? null;
  const payloadHash =
    state.erc7710Proof.payload?.permissionContextHash ??
    proofEntry?.payloadContextHash ??
    null;
  const delegationManager =
    state.erc7710Proof.grant?.delegationManager ?? null;
  const childTarget =
    state.erc7710Proof.payload?.childDelegationTarget ??
    proofEntry?.childDelegationTarget ??
    null;
  const status = chainEvidenceStatus(state, txHash);
  const explorerHref = txHash
    ? `${BASE_SEPOLIA_EXPLORER_URL}/tx/${txHash}`
    : null;

  return (
    <article className="panel chain-evidence-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Chain Evidence</p>
          <h2>ERC-7710 链上证明</h2>
        </div>
        <StatusBadge value={status} />
      </div>
      <p className="panel-note">{chainEvidenceCopy(state, txHash)}</p>
      <dl className="detail-list chain-evidence-list">
        <div>
          <dt>DelegationManager</dt>
          <dd>{shortenHex(delegationManager)}</dd>
        </div>
        <div>
          <dt>Redeem function</dt>
          <dd>{REDEEM_DELEGATIONS_SIGNATURE}</dd>
        </div>
        <div>
          <dt>Function selector</dt>
          <dd>{REDEEM_DELEGATIONS_SELECTOR}</dd>
        </div>
        <div>
          <dt>Settlement tx</dt>
          <dd>
            {explorerHref ? (
              <a
                className="evidence-link"
                href={explorerHref}
                rel="noreferrer"
                target="_blank"
              >
                {shortenHex(txHash)}
              </a>
            ) : (
              shortenHex(txHash)
            )}
          </dd>
        </div>
        <div>
          <dt>Payload context hash</dt>
          <dd>{shortenHex(payloadHash)}</dd>
        </div>
        <div>
          <dt>Child delegation target</dt>
          <dd>{shortenHex(childTarget)}</dd>
        </div>
      </dl>
    </article>
  );
}
