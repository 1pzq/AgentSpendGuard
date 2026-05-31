import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { NextResponse, type NextRequest } from "next/server";
import { createPublicClient, http, type Address } from "viem";
import { baseSepolia } from "viem/chains";
import {
  AGENT_RUNNER_ACTION,
  precheckPolicyGuard,
  type RunnerPaymentRequirement
} from "@/server/agent-runner/policyGuard";
import { AgentRunnerError, isAgentRunnerError } from "@/server/agent-runner/errors";
import { runRealDeepSeek } from "@/server/adapters/deepseekAdapter";
import type { RunAiRiskBriefInput } from "@/server/agent-runner/runAgentWithPermission";
import { spendguardConfig } from "@/server/config/spendguard";
import { appendLedgerEntry } from "@/server/ledger/store";
import { getPermissionRecord, updatePermissionSpend } from "@/server/permissions/store";
import {
  erc7710PaidPocDisabledResponse,
  runErc7710PaidPocProtectedJson,
  type Erc7710PaidPocSettledPaymentContext,
  type Erc7710PaidPocVerifiedPaymentContext
} from "@/server/x402/erc7710PaidPocResourceServer";
import { setDemoPhase } from "@/app/api/_lib/demoState";
import type {
  AiRiskBrief,
  PaymentReceipt,
  PermissionRecord,
  WalletInfo
} from "@/shared/types";
import { BASE_SEPOLIA_PUBLIC_RPC_URL } from "@/shared/chain";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RiskBriefRequestBody = {
  walletAddress?: unknown;
};

type PaidErc7710PocData = {
  brief: AiRiskBrief;
  paymentReceipt: PaymentReceipt;
  paymentRequirement: RunnerPaymentRequirement;
  x402: {
    amountAtomic: string;
    asset: string;
    assetTransferMethod: "erc7710";
    network: string;
    payTo: string;
    payer: string;
    requirementId: string;
    txHash: string | null;
  };
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function isAddressLike(value: unknown): value is string {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function lowerHex(value: string | null | undefined) {
  return value ? value.toLowerCase() : null;
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return typeof error === "string" ? error : "Unknown error";
}

function isFacilitatorUnavailableError(error: unknown) {
  const message = errorMessage(error);

  return (
    message.includes("Failed to initialize") ||
    message.includes("Failed to fetch supported kinds") ||
    message.includes("fetch failed")
  );
}

function blockedError(
  message: string,
  details: Record<string, unknown>
): AgentRunnerError {
  return new AgentRunnerError("CONFIG_MISMATCH", message, {
    blocked: true,
    details
  });
}

function getBaseSepoliaClient() {
  return createPublicClient({
    chain: baseSepolia,
    transport: http(spendguardConfig.chain.rpcUrl ?? BASE_SEPOLIA_PUBLIC_RPC_URL)
  });
}

function extractDelegatorAddress(paymentPayload: PaymentPayload): string | null {
  const payload = asRecord(paymentPayload.payload);
  const delegator = payload?.delegator;

  return isAddressLike(delegator) ? delegator : null;
}

function extractDelegationManager(paymentPayload: PaymentPayload): string | null {
  const payload = asRecord(paymentPayload.payload);
  const delegationManager = payload?.delegationManager;

  return isAddressLike(delegationManager) ? delegationManager : null;
}

function permissionContextNonce(paymentPayload: PaymentPayload): string | null {
  const payload = asRecord(paymentPayload.payload);
  const permissionContext = payload?.permissionContext;

  if (typeof permissionContext !== "string" || !permissionContext.startsWith("0x")) {
    return null;
  }

  return permissionContext.slice(2, 14);
}

function assertErc7710RequirementMatchesPocConfig(
  paymentRequirements: PaymentRequirements
) {
  const mismatches: string[] = [];

  if (paymentRequirements.scheme !== "exact") mismatches.push("scheme");
  if (paymentRequirements.network !== spendguardConfig.x402Network) {
    mismatches.push("network");
  }
  if (lowerHex(paymentRequirements.asset) !== lowerHex(spendguardConfig.token.address)) {
    mismatches.push("asset");
  }
  if (paymentRequirements.amount !== spendguardConfig.erc7710PaidPoc.priceAtomic) {
    mismatches.push("amount");
  }
  if (lowerHex(paymentRequirements.payTo) !== lowerHex(spendguardConfig.x402PayTo)) {
    mismatches.push("payTo");
  }
  if (paymentRequirements.extra?.assetTransferMethod !== "erc7710") {
    mismatches.push("assetTransferMethod");
  }

  if (mismatches.length > 0) {
    throw blockedError("ERC-7710 paid PoC requirement does not match config", {
      amountAtomic: paymentRequirements.amount,
      asset: paymentRequirements.asset,
      expectedAmountAtomic: spendguardConfig.erc7710PaidPoc.priceAtomic,
      expectedAsset: spendguardConfig.token.address,
      mismatches
    });
  }
}

function assertErc7710PayloadMatchesGrant(
  paymentPayload: PaymentPayload,
  permission: PermissionRecord
) {
  const grant = permission.advancedPermissionGrant;
  const delegator = extractDelegatorAddress(paymentPayload);
  const delegationManager = extractDelegationManager(paymentPayload);

  if (paymentPayload.accepted.extra?.assetTransferMethod !== "erc7710") {
    throw blockedError("x402 payload is not an ERC-7710 payment payload", {
      assetTransferMethod: paymentPayload.accepted.extra?.assetTransferMethod ?? null
    });
  }

  if (!grant || !grant.from) {
    throw blockedError("Stored MetaMask Advanced Permission grant is missing", {
      permissionId: permission.id
    });
  }

  if (!delegator || lowerHex(delegator) !== lowerHex(grant.from)) {
    throw blockedError("ERC-7710 payload delegator does not match stored grant", {
      delegator,
      grantFrom: grant.from
    });
  }

  if (
    !delegationManager ||
    lowerHex(delegationManager) !== lowerHex(grant.delegationManager)
  ) {
    throw blockedError(
      "ERC-7710 payload delegation manager does not match stored grant",
      {
        delegationManager,
        grantDelegationManager: grant.delegationManager
      }
    );
  }

  return {
    delegator,
    delegationManager
  };
}

async function assertDelegatorExecutableForSettlement(
  delegator: string,
  permission: PermissionRecord
) {
  const code = await getBaseSepoliaClient().getCode({
    address: delegator as Address
  });
  const dependencies =
    permission.advancedPermissionGrant?.dependencies?.length ?? 0;

  if ((!code || code === "0x") && dependencies === 0) {
    throw blockedError(
      "ERC-7710 paid PoC cannot settle because the delegator account has no executable smart-account code on Base Sepolia.",
      {
        delegator,
        reason: "delegator_no_code",
        requiredAction:
          "Enable or deploy the MetaMask smart account / EIP-7702 account, then request a fresh Advanced Permission grant."
      }
    );
  }
}

function x402RequirementId(
  paymentPayload: PaymentPayload,
  paymentRequirements: PaymentRequirements
) {
  const nonce = permissionContextNonce(paymentPayload);
  if (nonce) return `x402-erc7710-${nonce}`;

  return `x402-erc7710-${paymentRequirements.network}-${Date.now()}`;
}

function expiresAtIso(paymentRequirements: PaymentRequirements): string {
  return new Date(
    Date.now() + paymentRequirements.maxTimeoutSeconds * 1000
  ).toISOString();
}

function buildWalletInfo(
  body: RiskBriefRequestBody,
  delegator: string
): WalletInfo {
  const requestedWallet = isAddressLike(body.walletAddress)
    ? body.walletAddress
    : null;

  return {
    eoa: requestedWallet ?? delegator,
    smartAccount: delegator,
    chain: spendguardConfig.chain.name
  };
}

function buildRunnerInput(
  body: RiskBriefRequestBody,
  context: Erc7710PaidPocVerifiedPaymentContext,
  permission: PermissionRecord,
  delegator: string
): RunAiRiskBriefInput {
  const now = new Date().toISOString();
  const requirementId = x402RequirementId(
    context.paymentPayload,
    context.paymentRequirements
  );
  const wallet = buildWalletInfo(body, delegator);
  const activePermission: PermissionRecord = {
    ...permission,
    approvedAt: now,
    status: "active",
    wallet
  };
  const paymentRequirement: RunnerPaymentRequirement = {
    id: requirementId,
    endpoint: spendguardConfig.erc7710PaidPoc.path,
    method: spendguardConfig.endpoint.method,
    amountAtomic: context.paymentRequirements.amount,
    token: spendguardConfig.token.symbol,
    tokenDecimals: spendguardConfig.token.decimals,
    chainId: spendguardConfig.chain.id,
    payTo: context.paymentRequirements.payTo,
    description: `${spendguardConfig.endpoint.service} wallet risk brief through ERC-7710 x402 paid PoC`,
    status: "required",
    createdAt: now,
    expiresAt: expiresAtIso(context.paymentRequirements),
    facilitator: spendguardConfig.erc7710PaidPoc.selfSettle.enabled
      ? `self:${spendguardConfig.erc7710PaidPoc.selfSettle.facilitatorAddress ?? "unconfigured"}`
      : spendguardConfig.x402FacilitatorUrl ?? "https://x402.org/facilitator",
    resource: spendguardConfig.erc7710PaidPoc.path
  };
  const paymentReceipt: PaymentReceipt = {
    id: `${requirementId}-verified`,
    requirementId,
    status: "paid",
    amountAtomic: context.paymentRequirements.amount,
    token: spendguardConfig.token.symbol,
    chainId: spendguardConfig.chain.id,
    payer: delegator,
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
}: Erc7710PaidPocSettledPaymentContext<PaidErc7710PocData>) {
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
    console.warn("ERC-7710 x402 payment settled, but ledger recording failed.", error);
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
  if (!spendguardConfig.erc7710PaidPoc.enabled) {
    return erc7710PaidPocDisabledResponse();
  }

  if (spendguardConfig.aiProvider !== "deepseek") {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "X402_PROVIDER_NOT_ENABLED",
          message: "This ERC-7710 paid PoC route is enabled only when AI_PROVIDER=deepseek."
        }
      },
      { status: 409 }
    );
  }

  try {
    return await runErc7710PaidPocProtectedJson<PaidErc7710PocData>(
      request,
      async (context) => {
        const body = await readBody(request);
        const permission = getPermissionRecord();

        assertErc7710RequirementMatchesPocConfig(context.paymentRequirements);
        const payloadAddresses = assertErc7710PayloadMatchesGrant(
          context.paymentPayload,
          permission
        );
        await assertDelegatorExecutableForSettlement(
          payloadAddresses.delegator,
          permission
        );

        precheckPolicyGuard({
          action: AGENT_RUNNER_ACTION,
          amountAtomic: context.paymentRequirements.amount,
          permissionRecord: permission,
          policyId: spendguardConfig.policy.id
        });

        const runnerInput = buildRunnerInput(
          body,
          context,
          permission,
          payloadAddresses.delegator
        );
        const brief = await runRealDeepSeek(runnerInput);

        return {
          brief,
          paymentReceipt: runnerInput.paymentReceipt,
          paymentRequirement: runnerInput.paymentRequirement,
          x402: {
            amountAtomic: context.paymentRequirements.amount,
            asset: context.paymentRequirements.asset,
            assetTransferMethod: "erc7710",
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

    if (isFacilitatorUnavailableError(error)) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "X402_FACILITATOR_UNAVAILABLE",
            message:
              "The configured ERC-7710 x402 facilitator could not be reached. Check network/VPN access to the MetaMask Base Sepolia facilitator before running the paid PoC.",
            details: {
              facilitatorUrl: spendguardConfig.x402FacilitatorUrl ?? null
            }
          }
        },
        { status: 502 }
      );
    }

    throw error;
  }
}
