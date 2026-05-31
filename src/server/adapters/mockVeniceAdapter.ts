import { spendguardConfig } from "@/server/config/spendguard";
import type { RunAiRiskBriefInput } from "@/server/agent-runner/runAgentWithPermission";
import type { AiRiskBrief } from "@/shared/types";

function resolveWalletAddress(input: RunAiRiskBriefInput): string {
  return (
    input.permission.wallet.eoa ??
    input.permission.wallet.smartAccount ??
    spendguardConfig.mockIds.walletEoa
  );
}

function shortAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export async function runMockVenice(
  input: RunAiRiskBriefInput
): Promise<AiRiskBrief> {
  const walletAddress = resolveWalletAddress(input);
  const service = spendguardConfig.endpoint.service;

  return {
    id: `${spendguardConfig.mockIds.aiBriefId}:${input.paymentReceipt.id}`,
    title: "Wallet risk brief",
    summary: `Mock ${service} risk brief for ${shortAddress(walletAddress)} after confirmed x402 payment ${input.paymentReceipt.id}.`,
    findings: [
      "No high-severity approval exposure found in the sampled wallet activity.",
      "Two stale testnet approvals should be reviewed before mainnet reuse.",
      "Recommended next action: keep this agent capped at 1.00 USDC per day."
    ],
    walletAddress,
    riskLevel: "low",
    model: `${spendguardConfig.aiProvider}-mock-risk-brief-v1`,
    createdAt: input.paymentReceipt.paidAt
  };
}

export const runMockAiRiskBrief = runMockVenice;

export const mockVeniceAdapter = {
  runAiRiskBrief: runMockAiRiskBrief,
  runVenice: runMockVenice
};
