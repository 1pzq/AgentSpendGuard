import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { NextResponse, type NextRequest } from "next/server";
import {
  AGENT_RUNNER_ACTION,
  precheckPolicyGuard,
  type RunnerPaymentRequirement
} from "@/server/agent-runner/policyGuard";
import { isAgentRunnerError } from "@/server/agent-runner/errors";
import { runRealDeepSeek } from "@/server/adapters/deepseekAdapter";
import type { RunAiRiskBriefInput } from "@/server/agent-runner/runAgentWithPermission";
import { spendguardConfig } from "@/server/config/spendguard";
import { appendLedgerEntry } from "@/server/ledger/store";
import { getPermissionRecord, updatePermissionSpend } from "@/server/permissions/store";
import {
  runX402ProtectedJson,
  type X402SettledPaymentContext,
  type X402VerifiedPaymentContext
} from "@/server/x402/resourceServer";
import { setDemoPhase } from "@/app/api/_lib/demoState";
import type {
  AiRiskBrief,
  PaymentReceipt,
  PermissionRecord,
  WalletInfo
} from "@/shared/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RiskBriefRequestBody = {
  walletAddress?: unknown;
};

type PaidRiskBriefData = {
  brief: AiRiskBrief;
  paymentReceipt: PaymentReceipt;
  paymentRequirement: RunnerPaymentRequirement;
  x402: {
    amountAtomic: string;
    asset: string;
    network: string;
    payTo: string;
    payer: string;
    requirementId: string;
    txHash: string | null;
  };
};

function isAddressLike(value: unknown): value is string {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function extractPayerAddress(paymentPayload: PaymentPayload): string | null {
  const payload = asRecord(paymentPayload.payload);
  const authorization = asRecord(payload?.authorization);
  const permit2Authorization = asRecord(payload?.permit2Authorization);
  const witness = asRecord(permit2Authorization?.witness);

  const candidates = [
    authorization?.from,
    permit2Authorization?.owner,
    witness?.from
  ];

  return candidates.find(isAddressLike) ?? null;
}

function x402RequirementId(
  paymentPayload: PaymentPayload,
  paymentRequirements: PaymentRequirements
): string {
  const payload = asRecord(paymentPayload.payload);
  const authorization = asRecord(payload?.authorization);
  const nonce = authorization?.nonce;

  if (typeof nonce === "string" && nonce) {
    return `x402-real-${nonce.slice(2, 14)}`;
  }

  return `x402-real-${paymentRequirements.network}-${Date.now()}`;
}

function expiresAtIso(paymentRequirements: PaymentRequirements): string {
  return new Date(
    Date.now() + paymentRequirements.maxTimeoutSeconds * 1000
  ).toISOString();
}

function buildWalletInfo(
  body: RiskBriefRequestBody,
  paymentPayload: PaymentPayload
): WalletInfo {
  const payer = extractPayerAddress(paymentPayload);
  const requestedWallet = isAddressLike(body.walletAddress)
    ? body.walletAddress
    : null;

  return {
    eoa: requestedWallet ?? payer ?? spendguardConfig.mockIds.walletEoa,
    smartAccount: null,
    chain: spendguardConfig.chain.name
  };
}

function buildRunnerInput(
  body: RiskBriefRequestBody,
  context: X402VerifiedPaymentContext,
  permission: PermissionRecord
): RunAiRiskBriefInput {
  const now = new Date().toISOString();
  const requirementId = x402RequirementId(
    context.paymentPayload,
    context.paymentRequirements
  );
  const payer =
    extractPayerAddress(context.paymentPayload) ??
    (isAddressLike(body.walletAddress) ? body.walletAddress : "unknown");
  const wallet = buildWalletInfo(body, context.paymentPayload);
  const activePermission: PermissionRecord = {
    ...permission,
    approvedAt: now,
    status: "active",
    wallet
  };
  const paymentRequirement: RunnerPaymentRequirement = {
    id: requirementId,
    endpoint: spendguardConfig.endpoint.path,
    method: spendguardConfig.endpoint.method,
    amountAtomic: context.paymentRequirements.amount,
    token: spendguardConfig.token.symbol,
    tokenDecimals: spendguardConfig.token.decimals,
    chainId: spendguardConfig.chain.id,
    payTo: context.paymentRequirements.payTo,
    description: `${spendguardConfig.endpoint.service} wallet risk brief through real x402`,
    status: "required",
    createdAt: now,
    expiresAt: expiresAtIso(context.paymentRequirements),
    facilitator: spendguardConfig.x402FacilitatorUrl ?? "https://x402.org/facilitator",
    resource: spendguardConfig.endpoint.path
  };
  const paymentReceipt: PaymentReceipt = {
    id: `${requirementId}-verified`,
    requirementId,
    status: "paid",
    amountAtomic: context.paymentRequirements.amount,
    token: spendguardConfig.token.symbol,
    chainId: spendguardConfig.chain.id,
    payer,
    payTo: context.paymentRequirements.payTo,
    txHash: null,
    paidAt: now
  };

  return {
    action: "ai-risk-brief",
    paymentReceipt,
    paymentRequirement,
    permission: activePermission,
    policyId: spendguardConfig.policy.id
  };
}

async function recordSettledSpend({
  data,
  settlement
}: X402SettledPaymentContext<PaidRiskBriefData>) {
  const permission = getPermissionRecord();

  if (permission.status !== "active" && permission.status !== "fallback_local") {
    return;
  }

  const paidAt = new Date().toISOString();
  const amountAtomic = settlement.amount ?? data.paymentReceipt.amountAtomic;
  const paymentReceipt: PaymentReceipt = {
    ...data.paymentReceipt,
    amountAtomic,
    paidAt,
    payer: settlement.payer ?? data.paymentReceipt.payer,
    txHash: settlement.transaction || null
  };

  data.paymentReceipt = paymentReceipt;
  data.x402.amountAtomic = amountAtomic;
  data.x402.payer = paymentReceipt.payer;
  data.x402.txHash = paymentReceipt.txHash;

  try {
    updatePermissionSpend({
      amountAtomic,
      permissionId: permission.id,
      spentAt: paidAt
    });
    appendLedgerEntry({
      amountAtomic,
      endpoint: data.paymentRequirement.endpoint,
      occurredAt: paidAt,
      paymentReceipt,
      paymentRequirement: data.paymentRequirement,
      permissionId: permission.id,
      policyId: permission.policyId,
      service: permission.service,
      serviceId: permission.serviceId,
      status: "success",
      token: paymentReceipt.token,
      tokenDecimals: data.paymentRequirement.tokenDecimals,
      veniceRiskBrief: data.brief
    });
    setDemoPhase("run_completed");
  } catch (error) {
    console.warn("x402 payment settled, but demo ledger recording failed.", error);
  }
}

async function readBody(request: NextRequest): Promise<RiskBriefRequestBody> {
  try {
    return (await request.json()) as RiskBriefRequestBody;
  } catch {
    return {};
  }
}

export async function POST(request: NextRequest) {
  if (spendguardConfig.aiProvider !== "deepseek") {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "X402_PROVIDER_NOT_ENABLED",
          message: "This x402 route is enabled only when AI_PROVIDER=deepseek."
        }
      },
      { status: 409 }
    );
  }

  try {
    return await runX402ProtectedJson<PaidRiskBriefData>(
      request,
      async (context) => {
        const body = await readBody(request);
        const permission = getPermissionRecord();

        precheckPolicyGuard({
          action: AGENT_RUNNER_ACTION,
          amountAtomic: context.paymentRequirements.amount,
          permissionRecord: permission,
          policyId: spendguardConfig.policy.id
        });

        const runnerInput = buildRunnerInput(body, context, permission);
        const brief = await runRealDeepSeek(runnerInput);

        return {
          brief,
          paymentReceipt: runnerInput.paymentReceipt,
          paymentRequirement: runnerInput.paymentRequirement,
          x402: {
            amountAtomic: context.paymentRequirements.amount,
            asset: context.paymentRequirements.asset,
            network: context.paymentRequirements.network,
            payTo: context.paymentRequirements.payTo,
            payer: runnerInput.paymentReceipt.payer,
            requirementId: runnerInput.paymentRequirement.id,
            txHash: null
          }
        };
      },
      {
        onSettled: recordSettledSpend
      }
    );
  } catch (error) {
    if (isAgentRunnerError(error)) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details
          }
        },
        { status: error.blocked ? 409 : 502 }
      );
    }

    throw error;
  }
}
