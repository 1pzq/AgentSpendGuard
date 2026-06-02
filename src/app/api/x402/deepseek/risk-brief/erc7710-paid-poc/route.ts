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
import { agentDecisionAllowsPayment } from "@/server/agent-runner/agentSpendDecision";
import {
  clearCurrentAgentSpendDecision,
  getCurrentAgentSpendDecision
} from "@/server/agent-runner/agentSpendDecisionStore";
import { runRealDeepSeek } from "@/server/adapters/deepseekAdapter";
import type { RunAiRiskBriefInput } from "@/server/agent-runner/runAgentWithPermission";
import { spendguardConfig } from "@/server/config/spendguard";
import {
  appendLedgerEntry,
  findSettledLedgerEntry,
  listLedgerEntries
} from "@/server/ledger/store";
import { getPermissionRecord, updatePermissionSpend } from "@/server/permissions/store";
import {
  erc7710PaidPocDisabledResponse,
  runErc7710PaidPocProtectedJson,
  type Erc7710PaidPocSettledPaymentContext,
  type Erc7710PaidPocVerifiedPaymentContext
} from "@/server/x402/erc7710PaidPocResourceServer";
import { setDemoPhase } from "@/app/api/_lib/demoState";
import { BASE_SEPOLIA_PUBLIC_RPC_URL } from "@/shared/chain";
import type {
  AgentSpendDecision,
  AiRiskBrief,
  Erc7710PayloadProof,
  OneShotPaymentTimeline,
  PaymentReceipt,
  PermissionRecord,
  WalletInfo
} from "@/shared/types";
import {
  buildErc7710PayloadProof,
  validateErc7710RequiredChildCaveats
} from "@/shared/x402/erc7710DelegationInspector";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RiskBriefRequestBody = {
  walletAddress?: unknown;
};

type PaidErc7710PocData = {
  agentDecision: AgentSpendDecision;
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

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
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

function extractPermissionContext(paymentPayload: PaymentPayload): string | null {
  const payload = asRecord(paymentPayload.payload);
  const permissionContext = payload?.permissionContext;

  if (typeof permissionContext !== "string" || !permissionContext.startsWith("0x")) {
    return null;
  }

  return permissionContext;
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

function assertAllowedAgentDecision(amountAtomic: string): AgentSpendDecision {
  const agentDecision = getCurrentAgentSpendDecision();

  if (!agentDecision) {
    throw new AgentRunnerError(
      "AGENT_DECISION_BLOCKED",
      "No AI spending decision was recorded before submitting the paid request.",
      {
        blocked: true,
        details: {
          amountAtomic
        }
      }
    );
  }

  if (!agentDecisionAllowsPayment(agentDecision)) {
    throw new AgentRunnerError(
      "AGENT_DECISION_BLOCKED",
      "AI spending decision did not pass SpendGuard enforcement.",
      {
        blocked: true,
        details: {
          agentDecision
        }
      }
    );
  }

  if (agentDecision.estimatedCostAtomic !== amountAtomic) {
    throw new AgentRunnerError(
      "AGENT_DECISION_BLOCKED",
      "AI spending decision amount does not match the x402 payment amount.",
      {
        blocked: true,
        details: {
          agentDecisionAmountAtomic: agentDecision.estimatedCostAtomic,
          x402AmountAtomic: amountAtomic
        }
      }
    );
  }

  return agentDecision;
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
  const payloadProof = buildErc7710PayloadProof({
    localPayloadMatchesGrant: null,
    permissionContext: extractPermissionContext(paymentPayload),
    redeemerConstraint: null,
    serverPayloadMatchesGrant: true,
    settlementPreflight: null,
    validationSource: "server_verified"
  });

  if (!payloadProof.permissionContextHash || !payloadProof.childDelegationTarget) {
    throw blockedError("ERC-7710 payload permission context is missing or undecodable", {
      childDelegationTarget: payloadProof.childDelegationTarget,
      delegationCount: payloadProof.delegationCount,
      permissionContextHash: payloadProof.permissionContextHash
    });
  }

  return {
    delegator,
    delegationManager,
    payloadProof
  };
}

function assertFreshErc7710PaymentPayload(payloadProof: Erc7710PayloadProof) {
  const payloadHash = payloadProof.permissionContextHash;

  if (!payloadHash) {
    throw blockedError("ERC-7710 payload permission context hash is missing", {
      permissionContextHash: null
    });
  }

  const duplicateEntry = listLedgerEntries().find((entry) => {
    if (entry.status !== "success" && entry.status !== "paid_ai_failed") {
      return false;
    }

    return (
      entry.paymentReceipt?.erc7710Proof?.permissionContextHash?.toLowerCase() ===
      payloadHash.toLowerCase()
    );
  });

  if (duplicateEntry) {
    throw blockedError(
      "ERC-7710 payment payload was already recorded. Build a fresh child delegation for the next paid call.",
      {
        duplicateLedgerEntryId: duplicateEntry.id,
        payloadContextHash: payloadHash
      }
    );
  }
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
  paymentRequirements: PaymentRequirements,
  payloadProof: Erc7710PayloadProof
) {
  const payloadHash = payloadProof.permissionContextHash;
  if (payloadHash) return `x402-erc7710-${payloadHash.slice(2, 18)}`;

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
  delegator: string,
  payloadProof: Erc7710PayloadProof
): RunAiRiskBriefInput {
  const now = new Date().toISOString();
  const requirementId = x402RequirementId(
    context.paymentRequirements,
    payloadProof
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
    asset: context.paymentRequirements.asset,
    assetTransferMethod:
      context.paymentRequirements.extra?.assetTransferMethod === "erc7710"
        ? "erc7710"
        : String(context.paymentRequirements.extra?.assetTransferMethod ?? "unknown"),
    token: spendguardConfig.token.symbol,
    tokenDecimals: spendguardConfig.token.decimals,
    chainId: spendguardConfig.chain.id,
    payTo: context.paymentRequirements.payTo,
    description: `${spendguardConfig.endpoint.service} wallet risk brief through ERC-7710 x402 paid PoC`,
    status: "required",
    createdAt: now,
    expiresAt: expiresAtIso(context.paymentRequirements),
    maxTimeoutSeconds: context.paymentRequirements.maxTimeoutSeconds,
    network: context.paymentRequirements.network,
    scheme: context.paymentRequirements.scheme,
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
    paidAt: now,
    erc7710Proof: payloadProof
  };

  return {
    action: "ai-risk-brief",
    paymentReceipt,
    paymentRequirement,
    permission: activePermission,
    policyId: spendguardConfig.policy.id
  };
}

function settlementRedeemerTargets(
  paymentPayload: PaymentPayload,
  paymentRequirements: PaymentRequirements
) {
  const acceptedExtra = asRecord(paymentPayload.accepted.extra);
  const requirementExtra = asRecord(paymentRequirements.extra);
  const acceptedTargets = stringArray(acceptedExtra?.facilitatorAddresses);
  const requirementTargets = stringArray(requirementExtra?.facilitatorAddresses);

  if (acceptedTargets.length > 0) return acceptedTargets;
  if (requirementTargets.length > 0) return requirementTargets;

  return spendguardConfig.erc7710PaidPoc.facilitatorAddresses;
}

function assertErc7710PayloadHasRequiredChildCaveats({
  paymentPayload,
  paymentRequirements,
  payloadProof,
  permission
}: {
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
  payloadProof: Erc7710PayloadProof;
  permission: PermissionRecord;
}) {
  const validation = validateErc7710RequiredChildCaveats({
    expectedAllowedTargets: [paymentRequirements.asset],
    expectedChildDelegationTargets: settlementRedeemerTargets(
      paymentPayload,
      paymentRequirements
    ),
    expectedMaxTransferAmountAtomic:
      permission.advancedPermissionGrant?.periodAmountAtomic ??
      permission.maxSpendAtomic,
    expectedMinTransferAmountAtomic: paymentRequirements.amount,
    expectedTokenAddress: paymentRequirements.asset,
    maxLimitedCalls: 2,
    maxTimeoutSeconds: paymentRequirements.maxTimeoutSeconds,
    payloadProof
  });

  if (!validation.ok) {
    throw blockedError(
      "ERC-7710 child delegation is missing required caveat protections",
      {
        childDelegationTarget: payloadProof.childDelegationTarget,
        caveatCount: validation.details.caveatCount,
        missingCaveats: validation.missing,
        mismatchedCaveats: validation.mismatches,
        permissionContextHash: payloadProof.permissionContextHash,
        required: {
          allowedTargets: validation.details.expectedAllowedTargets,
          childDelegationTargets:
            validation.details.expectedChildDelegationTargets,
          erc20TransferAmount: {
            maxAmountAtomic:
              validation.details.expectedMaxTransferAmountAtomic,
            minAmountAtomic:
              validation.details.expectedMinTransferAmountAtomic,
            tokenAddress: validation.details.expectedTokenAddress
          },
          limitedCallsMax: 2,
          methodSelectors: validation.details.expectedMethodSelectors
        },
        seen: {
          allowedMethods: validation.details.allowedMethods,
          allowedTargets: validation.details.allowedTargets,
          erc20TransferAmount: validation.details.amountCap,
          limitedCalls: validation.details.limitedCalls,
          timestamp: validation.details.timestamp
        }
      }
    );
  }
}

function oneShotTimelineFromSettlement(
  settlement: Erc7710PaidPocSettledPaymentContext<PaidErc7710PocData>["settlement"]
): OneShotPaymentTimeline | undefined {
  const extra = asRecord(settlement.extra);
  const oneShot = asRecord(extra?.oneShot);

  if (!oneShot) return undefined;

  const quoteId = typeof oneShot.quoteId === "string" ? oneShot.quoteId : null;
  const taskId = typeof oneShot.taskId === "string" ? oneShot.taskId : null;
  const status =
    oneShot.status === "submitted" ||
    oneShot.status === "pending" ||
    oneShot.status === "confirmed" ||
    oneShot.status === "failed"
      ? oneShot.status
      : null;

  if (!quoteId || !taskId || !status) return undefined;

  const estimate = asRecord(oneShot.estimate) ?? asRecord(extra?.estimate);
  const requiredPaymentAmount =
    typeof estimate?.requiredPaymentAmount === "string"
      ? estimate.requiredPaymentAmount
      : null;
  const relayerFeeAmount =
    typeof estimate?.relayerFeeAmount === "string"
      ? estimate.relayerFeeAmount
      : null;
  const feeAtomic = requiredPaymentAmount ?? relayerFeeAmount;
  const feeCollector =
    typeof estimate?.relayerFeeCollector === "string"
      ? estimate.relayerFeeCollector
      : null;
  const settledAmount =
    typeof settlement.amount === "string" ? settlement.amount : null;
  const totalWalletDebitAtomic =
    feeAtomic && settledAmount && /^\d+$/.test(feeAtomic) && /^\d+$/.test(settledAmount)
      ? (BigInt(settledAmount) + BigInt(feeAtomic)).toString()
      : null;
  const fee = feeAtomic
    ? `${feeAtomic} atomic ${spendguardConfig.token.symbol}`
    : "1Shot estimate accepted";

  return {
    feeAtomic,
    feeCollector,
    quoteId,
    fee,
    taskId,
    status,
    totalWalletDebitAtomic,
    txHash: typeof oneShot.txHash === "string" ? oneShot.txHash : ""
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
    oneShot: oneShotTimelineFromSettlement(settlement),
    paidAt,
    txHash: settlement.transaction || null
  };

  data.paymentReceipt = paymentReceipt;
  data.x402.amountAtomic = amountAtomic;
  data.x402.payer = paymentReceipt.payer;
  data.x402.txHash = paymentReceipt.txHash;

  const ledgerInput = {
    amountAtomic,
    agentDecision: data.agentDecision,
    endpoint: data.paymentRequirement.endpoint,
    occurredAt: paidAt,
    paymentReceipt,
    paymentRequirement: data.paymentRequirement,
    permissionId: permission.id,
    policyId: permission.policyId,
    service: permission.service,
    serviceId: permission.serviceId,
    status: "success" as const,
    token: paymentReceipt.token,
    tokenDecimals: data.paymentRequirement.tokenDecimals,
    veniceRiskBrief: data.brief
  };

  if (findSettledLedgerEntry(ledgerInput)) {
    clearCurrentAgentSpendDecision();
    setDemoPhase("run_completed");
    return;
  }

  try {
    updatePermissionSpend({
      amountAtomic,
      permissionId: permission.id,
      spentAt: paidAt
    });
    appendLedgerEntry(ledgerInput);
    clearCurrentAgentSpendDecision();
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
        assertErc7710PayloadHasRequiredChildCaveats({
          paymentPayload: context.paymentPayload,
          paymentRequirements: context.paymentRequirements,
          payloadProof: payloadAddresses.payloadProof,
          permission
        });
        assertFreshErc7710PaymentPayload(payloadAddresses.payloadProof);
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
        const agentDecision = assertAllowedAgentDecision(
          context.paymentRequirements.amount
        );

        const runnerInput = buildRunnerInput(
          body,
          context,
          permission,
          payloadAddresses.delegator,
          payloadAddresses.payloadProof
        );
        const brief = await runRealDeepSeek(runnerInput);

        return {
          agentDecision,
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
