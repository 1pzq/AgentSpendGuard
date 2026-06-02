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
    title: "钱包风险简报",
    summary: `模拟 ${service} 风险简报：钱包 ${shortAddress(walletAddress)} 已完成 x402 支付 ${input.paymentReceipt.id}。`,
    findings: [
      "抽样钱包活动中未发现高危授权暴露。",
      "主网复用前，建议复查两个过期的测试网授权。",
      "建议下一步：继续将该 agent 限制在每天 1.00 USDC 预算内。"
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
