import { spendguardConfig } from "@/server/config/spendguard";
import { appendLedgerEntry } from "@/server/ledger/store";
import {
  getPermissionRecord,
  markPermissionRevoked,
  updatePermissionSpend
} from "@/server/permissions/store";
import type {
  AiRiskBrief,
  AdvancedPermissionGrant,
  LedgerEntry,
  PaymentReceipt,
  PermissionRecord,
  RunnerSpendResult
} from "@/shared/types";
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
  getRequirement(input: GetRequirementInput): Promise<RunnerPaymentRequirement>;
  payRequirement(input: PayRequirementInput): Promise<PaymentReceipt>;
  runAiRiskBrief(input: RunAiRiskBriefInput): Promise<AiRiskBrief>;
};

export type AgentRunnerAdapterOverrides = Partial<AgentRunnerAdapters> & {
  runVenice?(input: RunVeniceInput): Promise<AiRiskBrief>;
};

export const defaultAgentRunnerAdapters: AgentRunnerAdapters = {
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
  veniceRiskBrief = null
}: {
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
    veniceRiskBrief
  };
}

function appendBlockedLedger({
  error,
  input,
  paymentReceipt = null,
  paymentRequirement = null,
  permission
}: {
  error: unknown;
  input: RunAgentWithPermissionInput;
  paymentReceipt?: PaymentReceipt | null;
  paymentRequirement?: RunnerPaymentRequirement | null;
  permission: PermissionRecord;
}): RunnerSpendResult {
  const reason = formatRunnerError(error);
  const ledgerEntry = appendLedgerEntry({
    amountAtomic:
      paymentRequirement?.amountAtomic ?? permission.pricePerCallAtomic,
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
    permission
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
}): RunnerSpendResult {
  const reason = formatRunnerError(error);
  const spentAt = paymentReceipt.paidAt || nowIso();
  const updatedPermission = updatePermissionSpend({
    amountAtomic: paymentReceipt.amountAtomic,
    permissionId: permission.id,
    spentAt
  });
  const ledgerEntry = appendLedgerEntry({
    amountAtomic: paymentReceipt.amountAtomic,
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
    permission: updatedPermission
  });
}

function appendSuccessLedger({
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
}): RunnerSpendResult {
  const spentAt = paymentReceipt.paidAt || nowIso();
  const updatedPermission = updatePermissionSpend({
    amountAtomic: paymentReceipt.amountAtomic,
    permissionId: permission.id,
    spentAt
  });
  const ledgerEntry = appendLedgerEntry({
    amountAtomic: paymentReceipt.amountAtomic,
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
    veniceRiskBrief
  });
}

async function executeRun(
  input: RunAgentWithPermissionInput,
  adapters: AgentRunnerAdapters
): Promise<RunnerSpendResult> {
  const permission = readPermissionOrThrow(input);
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
    try {
      precheckPolicyGuard({
        action: input.action,
        amountAtomic: permission.pricePerCallAtomic,
        permissionRecord: permission,
        policyId: input.policyId
      });
    } catch (error) {
      if (isAgentRunnerError(error) && error.blocked) {
        return appendBlockedLedger({ error, input, permission });
      }

      throw error;
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
        error: paymentError,
        input,
        paymentRequirement,
        permission
      });
    }

    if (!isPaidReceipt(paymentReceipt)) {
      return appendBlockedLedger({
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
        input,
        paymentReceipt,
        paymentRequirement,
        permission,
        veniceRiskBrief
      });
    } catch (error) {
      return appendPaidAiFailedLedger({
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
