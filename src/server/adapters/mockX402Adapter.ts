import { spendguardConfig } from "@/server/config/spendguard";
import type { GetRequirementInput } from "@/server/agent-runner/runAgentWithPermission";
import type { RunnerPaymentRequirement } from "@/server/agent-runner/policyGuard";

const REQUIREMENT_TTL_MS = 15 * 60 * 1000;
const MOCK_X402_FALLBACK_LABEL = "MOCK/FALLBACK local protected endpoint";

function nowIso(): string {
  return new Date().toISOString();
}

function expiresAtIso(createdAt: string): string {
  return new Date(Date.parse(createdAt) + REQUIREMENT_TTL_MS).toISOString();
}

function formatAtomicUsdc(amountAtomic: string) {
  const scale = BigInt(10) ** BigInt(spendguardConfig.token.decimals);
  const amount = BigInt(amountAtomic);
  const whole = amount / scale;
  const fraction = amount % scale;

  if (fraction === BigInt(0)) return `${whole.toString()} USDC`;

  return `${whole.toString()}.${fraction
    .toString()
    .padStart(spendguardConfig.token.decimals, "0")
    .replace(/0+$/, "")} USDC`;
}

export async function getMockX402Requirement({
  action,
  permission
}: GetRequirementInput): Promise<RunnerPaymentRequirement> {
  const createdAt = nowIso();

  return {
    id: spendguardConfig.mockIds.paymentRequirementId,
    endpoint: spendguardConfig.endpoint.path,
    method: spendguardConfig.endpoint.method,
    amountAtomic: spendguardConfig.policy.pricePerCallAtomic,
    token: spendguardConfig.token.symbol,
    tokenDecimals: spendguardConfig.token.decimals,
    chainId: spendguardConfig.chain.id,
    payTo: permission.payTo,
    description: `${MOCK_X402_FALLBACK_LABEL} for ${action}: fixed ${formatAtomicUsdc(
      spendguardConfig.policy.pricePerCallAtomic
    )} ${spendguardConfig.endpoint.service} risk brief`,
    status: "required",
    createdAt,
    expiresAt: expiresAtIso(createdAt),
    resource: spendguardConfig.endpoint.path
  };
}

export const mockX402Adapter = {
  getRequirement: getMockX402Requirement
};
