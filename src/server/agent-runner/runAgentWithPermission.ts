import { spendguardConfig } from "@/server/config/spendguard";
import {
  appendLedgerEntry,
  findSettledLedgerEntry,
  listLedgerEntries
} from "@/server/ledger/store";
import {
  getPermissionRecord,
  markPermissionRevoked,
  updatePermissionSpend
} from "@/server/permissions/store";
import type {
  AgentSpendDecision,
  AiRiskBrief,
  AdvancedPermissionGrant,
  LedgerEntry,
  PaymentReceipt,
  PermissionRecord,
  RunnerSpendResult
} from "@/shared/types";
import {
  agentDecisionAllowsPayment,
  applyAgentDecisionPolicyCheck,
  buildAgentSpendDecisionInput,
  type AgentSpendDecisionInput
} from "./agentSpendDecision";
import { setCurrentAgentSpendDecision } from "./agentSpendDecisionStore";
import {
  adapterNotConfigured,
  AgentRunnerError,
  formatRunnerError,
  isAgentRunnerError
} from "./errors";
import {
  precheckPolicyGuard,
  type RunnerPaymentRequirement,
  validateRequirement
} from "./policyGuard";

export type RunAgentWithPermissionInput = {
  action: string;
  idempotencyKey?: string;
  permissionRecordId: string;
  policyId: string;
};

export type GetRequirementInput = {
  action: string;
  permission: PermissionRecord;
  policyId: string;
};

export type PayRequirementInput = {
  action: string;
  paymentRequirement: RunnerPaymentRequirement;
  permission: PermissionRecord;
  policyId: string;
};

export type RunAiRiskBriefInput = {
  action: string;
  paymentReceipt: PaymentReceipt;
  paymentRequirement: RunnerPaymentRequirement;
  permission: PermissionRecord;
  policyId: string;
};

export type RunVeniceInput = RunAiRiskBriefInput;

export type AgentRunnerAdapters = {
  decideAgentSpend(input: AgentSpendDecisionInput): Promise<AgentSpendDecision>;
  getRequirement(input: GetRequirementInput): Promise<RunnerPaymentRequirement>;
  payRequirement(input: PayRequirementInput): Promise<PaymentReceipt>;
  runAiRiskBrief(input: RunAiRiskBriefInput): Promise<AiRiskBrief>;
};

export type AgentRunnerAdapterOverrides = Partial<AgentRunnerAdapters> & {
  runVenice?(input: RunVeniceInput): Promise<AiRiskBrief>;
};

export const defaultAgentRunnerAdapters: AgentRunnerAdapters = {
  async decideAgentSpend() {
    throw adapterNotConfigured("decideAgentSpend");
  },
  async getRequirement() {
    throw adapterNotConfigured("getRequirement");
  },
  async payRequirement() {
    throw adapterNotConfigured("payRequirement");
  },
  async runAiRiskBrief() {
    throw adapterNotConfigured("runAiRiskBrief");
  }
};

const inFlightPolicyIds = new Set<string>();
const inFlightIdempotency = new Map<string, Promise<RunnerSpendResult>>();
const completedIdempotency = new Map<string, RunnerSpendResult>();

function nowIso() {
  return new Date().toISOString();
}

function resolveAdapters(
  adapterOverrides: AgentRunnerAdapterOverrides = {}
): AgentRunnerAdapters {
  return {
    decideAgentSpend:
      adapterOverrides.decideAgentSpend ??
      defaultAgentRunnerAdapters.decideAgentSpend,
    getRequirement:
      adapterOverrides.getRequirement ?? defaultAgentRunnerAdapters.getRequirement,
    payRequirement:
      adapterOverrides.payRequirement ?? defaultAgentRunnerAdapters.payRequirement,
    runAiRiskBrief:
      adapterOverrides.runAiRiskBrief ??
      adapterOverrides.runVenice ??
      defaultAgentRunnerAdapters.runAiRiskBrief
  };
}

function idempotencyCacheKey(input: RunAgentWithPermissionInput): string | null {
  if (!input.idempotencyKey) return null;
  return [
    input.policyId,
    input.permissionRecordId,
    input.action,
    input.idempotencyKey
  ].join(":");
}

function createResult({
  blockedReason = null,
  ledgerEntry = null,
  paymentReceipt = null,
  paymentRequirement = null,
  permission,
  veniceRiskBrief = null,
  agentDecision = null
}: {
  agentDecision?: AgentSpendDecision | null;
  blockedReason?: string | null;
  ledgerEntry?: LedgerEntry | null;
  paymentReceipt?: PaymentReceipt | null;
  paymentRequirement?: RunnerPaymentRequirement | null;
  permission: PermissionRecord;
  veniceRiskBrief?: AiRiskBrief | null;
}): RunnerSpendResult {
  return {
    blockedReason,
    ledgerEntry,
    paymentReceipt,
    paymentRequirement,
    permission,
    veniceRiskBrief,
    agentDecision
  };
}

function appendBlockedLedger({
  agentDecision = null,
  error,
  input,
  paymentReceipt = null,
  paymentRequirement = null,
  permission
}: {
  agentDecision?: AgentSpendDecision | null;
  error: unknown;
  input: RunAgentWithPermissionInput;
  paymentReceipt?: PaymentReceipt | null;
  paymentRequirement?: RunnerPaymentRequirement | null;
  permission: PermissionRecord;
}): RunnerSpendResult {
  const reason = formatRunnerError(error);
  const ledgerEntry = appendLedgerEntry({
    amountAtomic:
      agentDecision?.estimatedCostAtomic ??
      paymentRequirement?.amountAtomic ??
      permission.pricePerCallAtomic,
    agentDecision,
    endpoint: paymentRequirement?.endpoint ?? permission.allowedEndpoint,
    paymentReceipt,
    paymentRequirement,
    permissionId: permission.id,
    policyId: input.policyId,
    reason,
    service: permission.service,
    serviceId: permission.serviceId,
    status: "blocked",
    token: paymentRequirement?.token ?? permission.token,
    tokenDecimals: paymentRequirement?.tokenDecimals ?? permission.tokenDecimals
  });

  return createResult({
    blockedReason: reason,
    ledgerEntry,
    paymentReceipt,
    paymentRequirement,
    permission,
    agentDecision
  });
}

function appendBlockedLedgerForMissingPermission(
  input: RunAgentWithPermissionInput,
  error: AgentRunnerError
) {
  appendLedgerEntry({
    amountAtomic: spendguardConfig.policy.pricePerCallAtomic,
    endpoint: spendguardConfig.endpoint.path,
    permissionId: input.permissionRecordId,
    policyId: input.policyId,
    reason: formatRunnerError(error),
    status: "blocked"
  });
}

function readPermissionOrThrow(input: RunAgentWithPermissionInput): PermissionRecord {
  const permission = getPermissionRecord();

  if (permission.id !== input.permissionRecordId) {
    const error = new AgentRunnerError(
      "PERMISSION_NOT_FOUND",
      "Permission record was not found",
      {
        blocked: true,
        details: {
          currentPermissionRecordId: permission.id,
          requestedPermissionRecordId: input.permissionRecordId
        }
      }
    );

    appendBlockedLedgerForMissingPermission(input, error);
    throw error;
  }

  return permission;
}

function isPaidReceipt(paymentReceipt: PaymentReceipt): boolean {
  return paymentReceipt.status === "paid" || paymentReceipt.status === "mocked";
}

function normalizePaymentFailure(error: unknown): AgentRunnerError {
  if (isAgentRunnerError(error)) return error;

  return new AgentRunnerError("PAYMENT_FAILED", "Payment adapter failed", {
    cause: error
  });
}

function normalizeAiFailure(error: unknown): AgentRunnerError {
  if (isAgentRunnerError(error)) return error;

  return new AgentRunnerError("AI_FAILED", "AI adapter failed after payment", {
    cause: error
  });
}

function appendPaidAiFailedLedger({
  agentDecision,
  error,
  input,
  paymentReceipt,
  paymentRequirement,
  permission
}: {
  error: unknown;
  input: RunAgentWithPermissionInput;
  paymentReceipt: PaymentReceipt;
  paymentRequirement: RunnerPaymentRequirement;
  permission: PermissionRecord;
  agentDecision: AgentSpendDecision | null;
}): RunnerSpendResult {
  const reason = formatRunnerError(error);
  const spentAt = paymentReceipt.paidAt || nowIso();
  const duplicateLedgerEntry = findSettledLedgerEntry({
    amountAtomic: paymentReceipt.amountAtomic,
    agentDecision,
    endpoint: paymentRequirement.endpoint,
    occurredAt: spentAt,
    paymentReceipt,
    paymentRequirement,
    permissionId: permission.id,
    policyId: input.policyId,
    reason,
    service: permission.service,
    serviceId: permission.serviceId,
    status: "paid_ai_failed",
    token: paymentReceipt.token,
    tokenDecimals: paymentRequirement.tokenDecimals
  });

  if (duplicateLedgerEntry) {
    return createResult({
      blockedReason: reason,
      ledgerEntry: duplicateLedgerEntry,
      paymentReceipt,
      paymentRequirement,
      permission,
      agentDecision
    });
  }

  const updatedPermission = updatePermissionSpend({
    amountAtomic: paymentReceipt.amountAtomic,
    permissionId: permission.id,
    spentAt
  });
  const ledgerEntry = appendLedgerEntry({
    amountAtomic: paymentReceipt.amountAtomic,
    agentDecision,
    endpoint: paymentRequirement.endpoint,
    occurredAt: spentAt,
    paymentReceipt,
    paymentRequirement,
    permissionId: permission.id,
    policyId: input.policyId,
    reason,
    service: permission.service,
    serviceId: permission.serviceId,
    status: "paid_ai_failed",
    token: paymentReceipt.token,
    tokenDecimals: paymentRequirement.tokenDecimals
  });

  return createResult({
    blockedReason: reason,
    ledgerEntry,
    paymentReceipt,
    paymentRequirement,
    permission: updatedPermission,
    agentDecision
  });
}

function appendSuccessLedger({
  agentDecision,
  input,
  paymentReceipt,
  paymentRequirement,
  permission,
  veniceRiskBrief
}: {
  input: RunAgentWithPermissionInput;
  paymentReceipt: PaymentReceipt;
  paymentRequirement: RunnerPaymentRequirement;
  permission: PermissionRecord;
  veniceRiskBrief: AiRiskBrief;
  agentDecision: AgentSpendDecision | null;
}): RunnerSpendResult {
  const spentAt = paymentReceipt.paidAt || nowIso();
  const duplicateLedgerEntry = findSettledLedgerEntry({
    amountAtomic: paymentReceipt.amountAtomic,
    agentDecision,
    endpoint: paymentRequirement.endpoint,
    occurredAt: spentAt,
    paymentReceipt,
    paymentRequirement,
    permissionId: permission.id,
    policyId: input.policyId,
    service: permission.service,
    serviceId: permission.serviceId,
    status: "success",
    token: paymentReceipt.token,
    tokenDecimals: paymentRequirement.tokenDecimals,
    veniceRiskBrief
  });

  if (duplicateLedgerEntry) {
    return createResult({
      ledgerEntry: duplicateLedgerEntry,
      paymentReceipt,
      paymentRequirement,
      permission,
      veniceRiskBrief,
      agentDecision
    });
  }

  const updatedPermission = updatePermissionSpend({
    amountAtomic: paymentReceipt.amountAtomic,
    permissionId: permission.id,
    spentAt
  });
  const ledgerEntry = appendLedgerEntry({
    amountAtomic: paymentReceipt.amountAtomic,
    agentDecision,
    endpoint: paymentRequirement.endpoint,
    occurredAt: spentAt,
    paymentReceipt,
    paymentRequirement,
    permissionId: permission.id,
    policyId: input.policyId,
    service: permission.service,
    serviceId: permission.serviceId,
    status: "success",
    token: paymentReceipt.token,
    tokenDecimals: paymentRequirement.tokenDecimals,
    veniceRiskBrief
  });

  return createResult({
    ledgerEntry,
    paymentReceipt,
    paymentRequirement,
    permission: updatedPermission,
    veniceRiskBrief,
    agentDecision
  });
}

function blockedAgentDecisionError(
  agentDecision: AgentSpendDecision
): AgentRunnerError {
  const code =
    agentDecision.decision === "skip"
      ? "AGENT_DECISION_SKIPPED"
      : "AGENT_DECISION_BLOCKED";

  return new AgentRunnerError(
    code,
    `Agent decision=${agentDecision.decision}: ${agentDecision.reason}`,
    {
      blocked: true,
      details: {
        agentDecision
      }
    }
  );
}

async function executeRun(
  input: RunAgentWithPermissionInput,
  adapters: AgentRunnerAdapters
): Promise<RunnerSpendResult> {
  const permission = readPermissionOrThrow(input);
  let agentDecision: AgentSpendDecision | null = null;
  let paymentRequirement: RunnerPaymentRequirement | null = null;
  let paymentReceipt: PaymentReceipt | null = null;

  if (inFlightPolicyIds.has(input.policyId)) {
    throw new AgentRunnerError(
      "RUN_IN_PROGRESS",
      "Another run is already in progress for this policy",
      {
        details: {
          policyId: input.policyId
        }
      }
    );
  }

  inFlightPolicyIds.add(input.policyId);

  try {
    const decisionInput = buildAgentSpendDecisionInput({
      action: input.action,
      amountAtomic: permission.pricePerCallAtomic,
      permission,
      policyId: input.policyId,
      recentLedgerEntries: listLedgerEntries()
    });

    agentDecision = await adapters.decideAgentSpend(decisionInput);
    setCurrentAgentSpendDecision(agentDecision);

    if (agentDecision.decision !== "spend") {
      agentDecision = applyAgentDecisionPolicyCheck(agentDecision, "denied");
      setCurrentAgentSpendDecision(agentDecision);

      return appendBlockedLedger({
        agentDecision,
        error: blockedAgentDecisionError(agentDecision),
        input,
        permission
      });
    }

    try {
      precheckPolicyGuard({
        action: input.action,
        amountAtomic: agentDecision.estimatedCostAtomic,
        permissionRecord: permission,
        policyId: input.policyId
      });
      agentDecision = applyAgentDecisionPolicyCheck(agentDecision, "allowed");
      setCurrentAgentSpendDecision(agentDecision);
    } catch (error) {
      agentDecision = applyAgentDecisionPolicyCheck(agentDecision, "denied");
      setCurrentAgentSpendDecision(agentDecision);

      if (isAgentRunnerError(error) && error.blocked) {
        return appendBlockedLedger({ agentDecision, error, input, permission });
      }

      throw error;
    }

    if (!agentDecisionAllowsPayment(agentDecision)) {
      return appendBlockedLedger({
        agentDecision,
        error: blockedAgentDecisionError(agentDecision),
        input,
        permission
      });
    }

    paymentRequirement = await adapters.getRequirement({
      action: input.action,
      permission,
      policyId: input.policyId
    });

    try {
      validateRequirement({
        action: input.action,
        paymentRequirement,
        permissionRecord: permission,
        policyId: input.policyId
      });
    } catch (error) {
      if (isAgentRunnerError(error) && error.blocked) {
        return appendBlockedLedger({
          agentDecision,
          error,
          input,
          paymentRequirement,
          permission
        });
      }

      throw error;
    }

    try {
      paymentReceipt = await adapters.payRequirement({
        action: input.action,
        paymentRequirement,
        permission,
        policyId: input.policyId
      });
    } catch (error) {
      const paymentError = normalizePaymentFailure(error);

      if (paymentError.code === "ADAPTER_NOT_CONFIGURED") {
        throw paymentError;
      }

      return appendBlockedLedger({
        agentDecision,
        error: paymentError,
        input,
        paymentRequirement,
        permission
      });
    }

    if (!isPaidReceipt(paymentReceipt)) {
      return appendBlockedLedger({
        agentDecision,
        error: new AgentRunnerError(
          "PAYMENT_FAILED",
          "Payment was not confirmed",
          {
            details: {
              paymentReceiptId: paymentReceipt.id,
              status: paymentReceipt.status
            }
          }
        ),
        input,
        paymentReceipt,
        paymentRequirement,
        permission
      });
    }

    try {
      const veniceRiskBrief = await adapters.runAiRiskBrief({
        action: input.action,
        paymentReceipt,
        paymentRequirement,
        permission,
        policyId: input.policyId
      });

      return appendSuccessLedger({
        agentDecision,
        input,
        paymentReceipt,
        paymentRequirement,
        permission,
        veniceRiskBrief
      });
    } catch (error) {
      return appendPaidAiFailedLedger({
        agentDecision,
        error: normalizeAiFailure(error),
        input,
        paymentReceipt,
        paymentRequirement,
        permission
      });
    }
  } finally {
    inFlightPolicyIds.delete(input.policyId);
  }
}

export async function runAgentWithPermission(
  input: RunAgentWithPermissionInput,
  adapterOverrides: AgentRunnerAdapterOverrides = {}
): Promise<RunnerSpendResult> {
  const cacheKey = idempotencyCacheKey(input);

  if (cacheKey) {
    const completed = completedIdempotency.get(cacheKey);
    if (completed) return completed;

    const inFlight = inFlightIdempotency.get(cacheKey);
    if (inFlight) return inFlight;
  }

  const adapters = resolveAdapters(adapterOverrides);
  const runPromise = executeRun(input, adapters);

  if (!cacheKey) {
    return runPromise;
  }

  inFlightIdempotency.set(cacheKey, runPromise);

  try {
    const result = await runPromise;
    completedIdempotency.set(cacheKey, result);
    return result;
  } finally {
    inFlightIdempotency.delete(cacheKey);
  }
}

export function revokePermissionForDemo(
  reason = "Permission revoked by user",
  advancedPermissionGrant?: AdvancedPermissionGrant | null
) {
  const revokedAt = nowIso();
  const permission = markPermissionRevoked(
    reason,
    revokedAt,
    advancedPermissionGrant
  );
  const ledgerEntry = appendLedgerEntry({
    amountAtomic: "0",
    endpoint: permission.allowedEndpoint,
    occurredAt: revokedAt,
    permissionId: permission.id,
    policyId: permission.policyId,
    reason,
    service: permission.service,
    serviceId: permission.serviceId,
    status: "revoked",
    token: permission.token,
    tokenDecimals: permission.tokenDecimals
  });

  return {
    ledgerEntry,
    permission
  };
}
