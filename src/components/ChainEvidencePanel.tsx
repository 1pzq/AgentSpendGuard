"use client";

import { useState } from "react";
import { BASE_SEPOLIA_EXPLORER_URL } from "@/shared/chain";
import type { ApiResponse, SpendGuardDemoState } from "@/shared/types";

type ChainEvidencePanelProps = {
  state: SpendGuardDemoState;
};

type ChainEvidenceVerificationResult = {
  blockNumber: string | null;
  call: string;
  explorerUrl: string;
  failures: string[];
  gasUsed: string | null;
  inputSelector: string | null;
  ok: boolean;
  payloadContextHash: string;
  to: string | null;
  txHash: string;
};

type ChainEvidenceVerificationReport = {
  checkedAt: string;
  delegationManager: string;
  functionSelector: string;
  functionSignature: string;
  network: string;
  ok: boolean;
  results: ChainEvidenceVerificationResult[];
};

const REDEEM_DELEGATIONS_SELECTOR = "0xcef6d209";
const REDEEM_DELEGATIONS_SIGNATURE =
  "redeemDelegations(bytes[],bytes32[],bytes[])";

function fullHex(value: string | null) {
  return value ?? "未记录";
}

function latestProofEntry(state: SpendGuardDemoState) {
  return state.ledgerEntries.find(
    (entry) => entry.txHash || entry.payloadContextHash
  );
}

function verificationStatusCopy(
  report: ChainEvidenceVerificationReport | null,
  verifying: boolean
) {
  if (verifying) return "正在通过 Base Sepolia RPC 校验链上证据";
  if (!report) return null;
  return report.ok
    ? `链上验证通过：${report.results.length} 笔 tx 均匹配 redeemDelegations 和 USDC 转账`
    : "链上验证未通过，请查看失败项";
}

export function ChainEvidencePanel({ state }: ChainEvidencePanelProps) {
  const [verification, setVerification] =
    useState<ChainEvidenceVerificationReport | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
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
  const explorerHref = txHash
    ? `${BASE_SEPOLIA_EXPLORER_URL}/tx/${txHash}`
    : null;

  async function verifyEvidence() {
    setVerifying(true);
    setVerificationError(null);

    try {
      const response = await fetch("/api/evidence/chain", {
        cache: "no-store"
      });
      const json =
        (await response.json()) as ApiResponse<ChainEvidenceVerificationReport>;

      if (!json.ok) {
        throw new Error(json.error.message);
      }

      setVerification(json.data);
    } catch (error) {
      setVerification(null);
      setVerificationError(
        error instanceof Error ? error.message : "链上证据验证失败"
      );
    } finally {
      setVerifying(false);
    }
  }

  return (
    <article className="panel chain-evidence-panel">
      <dl className="detail-list chain-evidence-list">
        <div>
          <dt>DelegationManager</dt>
          <dd className="full-hash">{fullHex(delegationManager)}</dd>
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
                {fullHex(txHash)}
              </a>
            ) : (
              fullHex(txHash)
            )}
          </dd>
        </div>
        <div>
          <dt>Payload context hash</dt>
          <dd className="full-hash">{fullHex(payloadHash)}</dd>
        </div>
        <div>
          <dt>Child delegation target</dt>
          <dd className="full-hash">{fullHex(childTarget)}</dd>
        </div>
      </dl>
      <div className="chain-verify" aria-label="链上证据验证">
        <button
          className="ghost evidence-verify-button"
          disabled={verifying}
          onClick={verifyEvidence}
          type="button"
        >
          {verifying ? "验证中..." : "验证链上证据"}
        </button>
        {verification || verifying ? (
          <p className="panel-note">
            {verificationStatusCopy(verification, verifying)}
          </p>
        ) : null}
        {verificationError ? (
          <p className="chain-verify-error">{verificationError}</p>
        ) : null}
        {verification ? (
          <ul className="chain-verify-list">
            {verification.results.map((result) => (
              <li key={result.txHash}>
                <span className={result.ok ? "is-ok" : "is-failed"}>
                  {result.ok ? "PASS" : "FAIL"} {result.call}
                </span>
                <a href={result.explorerUrl} rel="noreferrer" target="_blank">
                  {fullHex(result.txHash)}
                </a>
                <span>payload {fullHex(result.payloadContextHash)}</span>
                <span>block {result.blockNumber ?? "n/a"}</span>
                <span>selector {result.inputSelector ?? "n/a"}</span>
                {result.failures.length > 0 ? (
                  <span>{result.failures.join("；")}</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </article>
  );
}
