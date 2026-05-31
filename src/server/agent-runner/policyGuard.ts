import { spendguardConfig } from "@/server/config/spendguard";
import type {
  AtomicAmount,
  PaymentRequirement,
  PermissionRecord
} from "@/shared/types";
import {
  AgentRunnerError,
  type AgentRunnerErrorCode,
  isAgentRunnerError
} from "./errors";

export const AGENT_RUNNER_ACTION = "ai-risk-brief" as const;

export type AgentRunnerAction = typeof AGENT_RUNNER_ACTION;

export type RunnerPaymentRequirement = PaymentRequirement & {
  facilitator?: string | null;
  resource?: string | null;
};

export type PolicyGuardInput = {
  action: string;
  amountAtomic?: AtomicAmount;
  now?: Date;
  paymentRequirement?: RunnerPaymentRequirement | null;
  permissionRecord: PermissionRecord | null | undefined;
  policyId: string;
};

export type PolicyGuardDecision = {
  action: AgentRunnerAction;
  amountAtomic: AtomicAmount;
  paymentRequirement: RunnerPaymentRequirement | null;
  permissionRecord: PermissionRecord;
};

export type PolicyGuardResult =
  | ({ allowed: true } & PolicyGuardDecision)
  | {
      allowed: false;
      error: AgentRunnerError;
    };

type ExtendedAllowlist = typeof spendguardConfig.allowlist & {
  facilitators?: readonly string[];
  resources?: readonly string[];
};

const allowlist = spendguardConfig.allowlist as ExtendedAllowlist;

function blockedError(
  code: AgentRunnerErrorCode,
  message: string,
  details: Record<string, unknown> = {}
): AgentRunnerError {
  return new AgentRunnerError(code, message, {
    blocked: true,
    details
  });
}

function assertAtomicAmount(amountAtomic: AtomicAmount, field: string): bigint {
  if (!/^\d+$/.test(amountAtomic)) {
    throw blockedError("INVALID_AMOUNT", `${field} must be an unsigned atomic amount`, {
      amountAtomic,
      field
    });
  }

  return BigInt(amountAtomic);
}

function assertNotExpired(expiresAt: string | null, now: Date, field: string) {
  if (!expiresAt) return;

  const expiry = Date.parse(expiresAt);

  if (Number.isNaN(expiry)) {
    throw blockedError("CONFIG_MISMATCH", `${field} is not a valid ISO timestamp`, {
      expiresAt,
      field
    });
  }

  if (expiry <= now.getTime()) {
    throw blockedError("PERMISSION_EXPIRED", "Permission is expired", {
      expiresAt,
      field,
      now: now.toISOString()
    });
  }
}

function assertAllowedText(
  value: string,
  allowed: readonly string[],
  message: string,
  details: Record<string, unknown>,
  caseInsensitive = false,
  code: AgentRunnerErrorCode = "REQUIREMENT_NOT_ALLOWED"
) {
  const isAllowed = caseInsensitive
    ? allowed.some((item) => item.toLowerCase() === value.toLowerCase())
    : allowed.includes(value);

  if (!isAllowed) {
    throw blockedError(code, message, {
      ...details,
      allowed: [...allowed],
      value
    });
  }
}

function assertPermissionMatchesConfig(permissionRecord: PermissionRecord) {
  const mismatches: string[] = [];
  const { endpoint, policy, token, chain } = spendguardConfig;

  if (permissionRecord.policyId !== policy.id) mismatches.push("policyId");
  if (permissionRecord.serviceId !== endpoint.serviceId) mismatches.push("serviceId");
  if (permissionRecord.service !== endpoint.service) mismatches.push("service");
  if (permissionRecord.chainId !== chain.id) mismatches.push("chainId");
  if (permissionRecord.chainName !== chain.name) mismatches.push("chainName");
  if (permissionRecord.token !== token.symbol) mismatches.push("token");
  if (permissionRecord.tokenDecimals !== token.decimals) mismatches.push("tokenDecimals");
  if (permissionRecord.allowedEndpoint !== endpoint.path) mismatches.push("endpoint");
  if (!permissionRecord.allowedMethods.includes(endpoint.method)) {
    mismatches.push("method");
  }

  if (!allowlist.services.includes(permissionRecord.serviceId)) {
    mismatches.push("allowlist.services");
  }
  if (!allowlist.endpoints.includes(permissionRecord.allowedEndpoint)) {
    mismatches.push("allowlist.endpoints");
  }
  if (!allowlist.methods.includes(endpoint.method)) {
    mismatches.push("allowlist.methods");
  }
  if (!allowlist.chainIds.includes(permissionRecord.chainId)) {
    mismatches.push("allowlist.chainIds");
  }
  if (!allowlist.tokens.includes(permissionRecord.token)) {
    mismatches.push("allowlist.tokens");
  }

  assertAllowedText(
    permissionRecord.payTo,
    allowlist.payTo,
    "Permission payTo is not allowlisted",
    { field: "payTo" },
    true,
    "CONFIG_MISMATCH"
  );

  if (mismatches.length > 0) {
    throw blockedError(
      "CONFIG_MISMATCH",
      "Permission does not match SpendGuard config",
      {
        mismatches,
        permissionId: permissionRecord.id
      }
    );
  }
}

function assertAdvancedPermissionGrant(permissionRecord: PermissionRecord, now: Date) {
  if (permissionRecord.status === "fallback_local") return;

  const grant = permissionRecord.advancedPermissionGrant;

  if (!grant) {
    throw blockedError(
      "PERMISSION_STATUS_NOT_ALLOWED",
      "MetaMask Advanced Permission grant is required for agent spending",
      {
        permissionId: permissionRecord.id
      }
    );
  }

  if (grant.source !== "metamask-erc7715" || grant.permissionType !== "erc20-token-periodic") {
    throw blockedError(
      "PERMISSION_STATUS_NOT_ALLOWED",
      "Stored permission is not a MetaMask ERC-20 periodic Advanced Permission",
      {
        permissionId: permissionRecord.id,
        permissionType: grant.permissionType,
        source: grant.source
      }
    );
  }

  if (grant.status !== "granted") {
    throw blockedError("PERMISSION_REVOKED", "MetaMask Advanced Permission is not granted", {
      grantStatus: grant.status,
      permissionId: permissionRecord.id
    });
  }

  assertNotExpired(grant.expiresAt, now, "advancedPermissionGrant.expiresAt");

  if (grant.expiry <= Math.floor(now.getTime() / 1000)) {
    throw blockedError("PERMISSION_EXPIRED", "MetaMask Advanced Permission is expired", {
      expiry: grant.expiry,
      now: now.toISOString(),
      permissionId: permissionRecord.id
    });
  }

  const expectedPeriodDuration = permissionRecord.windowHours * 60 * 60;
  const mismatches: string[] = [];

  if (grant.chainId !== permissionRecord.chainId) mismatches.push("chainId");
  if (grant.tokenSymbol !== permissionRecord.token) mismatches.push("token");
  if (grant.tokenDecimals !== permissionRecord.tokenDecimals) {
    mismatches.push("tokenDecimals");
  }
  if (grant.periodAmountAtomic !== permissionRecord.maxSpendAtomic) {
    mismatches.push("periodAmountAtomic");
  }
  if (grant.periodDuration !== expectedPeriodDuration) {
    mismatches.push("periodDuration");
  }
  if (grant.isAdjustmentAllowed) mismatches.push("isAdjustmentAllowed");
  if (grant.to.toLowerCase() !== grant.sessionAccount.toLowerCase()) {
    mismatches.push("sessionAccount");
  }
  if (
    permissionRecord.wallet.eoa &&
    grant.from &&
    grant.from.toLowerCase() !== permissionRecord.wallet.eoa.toLowerCase()
  ) {
    mismatches.push("from");
  }

  assertAllowedText(
    grant.tokenAddress,
    [spendguardConfig.token.address],
    "Advanced Permission token is not the configured spend token",
    { field: "advancedPermissionGrant.tokenAddress" },
    true,
    "CONFIG_MISMATCH"
  );

  if (mismatches.length > 0) {
    throw blockedError(
      "CONFIG_MISMATCH",
      "Advanced Permission grant does not match SpendGuard policy",
      {
        mismatches,
        permissionId: permissionRecord.id
      }
    );
  }
}

function assertPaymentRequirementMatchesConfig(
  permissionRecord: PermissionRecord,
  paymentRequirement: RunnerPaymentRequirement,
  now: Date
) {
  const { endpoint, token, chain } = spendguardConfig;
  const mismatches: string[] = [];

  if (paymentRequirement.status !== "required") {
    throw blockedError(
      "REQUIREMENT_STATUS_INVALID",
      "Payment requirement is not payable",
      {
        requirementId: paymentRequirement.id,
        status: paymentRequirement.status
      }
    );
  }

  if (paymentRequirement.expiresAt) {
    const expiry = Date.parse(paymentRequirement.expiresAt);

    if (Number.isNaN(expiry)) {
      throw blockedError(
        "CONFIG_MISMATCH",
        "Payment requirement expiry is not a valid ISO timestamp",
        {
          expiresAt: paymentRequirement.expiresAt,
          requirementId: paymentRequirement.id
        }
      );
    }

    if (expiry <= now.getTime()) {
      throw blockedError("REQUIREMENT_EXPIRED", "Payment requirement is expired", {
        expiresAt: paymentRequirement.expiresAt,
        now: now.toISOString(),
        requirementId: paymentRequirement.id
      });
    }
  }

  if (paymentRequirement.endpoint !== endpoint.path) mismatches.push("endpoint");
  if (paymentRequirement.endpoint !== permissionRecord.allowedEndpoint) {
    mismatches.push("permission.endpoint");
  }
  if (paymentRequirement.method !== endpoint.method) mismatches.push("method");
  if (!permissionRecord.allowedMethods.includes(paymentRequirement.method)) {
    mismatches.push("permission.method");
  }
  if (paymentRequirement.chainId !== chain.id) mismatches.push("chainId");
  if (paymentRequirement.chainId !== permissionRecord.chainId) {
    mismatches.push("permission.chainId");
  }
  if (paymentRequirement.token !== token.symbol) mismatches.push("token");
  if (paymentRequirement.token !== permissionRecord.token) {
    mismatches.push("permission.token");
  }
  if (paymentRequirement.tokenDecimals !== token.decimals) {
    mismatches.push("tokenDecimals");
  }

  assertAllowedText(
    paymentRequirement.payTo,
    allowlist.payTo,
    "Payment requirement payTo is not allowlisted",
    {
      field: "payTo",
      requirementId: paymentRequirement.id
    },
    true
  );
  assertAllowedText(
    paymentRequirement.payTo,
    [permissionRecord.payTo],
    "Payment requirement payTo does not match permission",
    {
      field: "payTo",
      permissionPayTo: permissionRecord.payTo,
      requirementId: paymentRequirement.id
    },
    true
  );

  const resource = paymentRequirement.resource ?? paymentRequirement.endpoint;
  assertAllowedText(
    resource,
    allowlist.resources ?? allowlist.endpoints,
    "Payment requirement resource is not allowlisted",
    {
      field: "resource",
      requirementId: paymentRequirement.id
    }
  );

  if (paymentRequirement.facilitator) {
    assertAllowedText(
      paymentRequirement.facilitator,
      allowlist.facilitators ?? [],
      "Payment requirement facilitator is not allowlisted",
      {
        field: "facilitator",
        requirementId: paymentRequirement.id
      }
    );
  }

  if (mismatches.length > 0) {
    throw blockedError(
      "CONFIG_MISMATCH",
      "Payment requirement does not match SpendGuard config",
      {
        mismatches,
        requirementId: paymentRequirement.id
      }
    );
  }
}

export function assertPolicyGuard(input: PolicyGuardInput): PolicyGuardDecision {
  const now = input.now ?? new Date();
  const { permissionRecord } = input;

  if (input.action !== AGENT_RUNNER_ACTION) {
    throw blockedError("INVALID_ACTION", "Agent action is not allowed", {
      action: input.action,
      allowedAction: AGENT_RUNNER_ACTION
    });
  }

  if (!permissionRecord) {
    throw blockedError("PERMISSION_NOT_FOUND", "Permission record was not found", {
      permissionRecordId: null,
      policyId: input.policyId
    });
  }

  if (permissionRecord.policyId !== input.policyId) {
    throw blockedError("POLICY_MISMATCH", "Permission policyId does not match request", {
      permissionPolicyId: permissionRecord.policyId,
      requestedPolicyId: input.policyId
    });
  }

  if (permissionRecord.status === "revoked" || permissionRecord.revokedAt) {
    throw blockedError("PERMISSION_REVOKED", "Permission has been revoked", {
      permissionId: permissionRecord.id,
      revokedAt: permissionRecord.revokedAt,
      revokedReason: permissionRecord.revokedReason
    });
  }

  if (
    permissionRecord.status !== "active" &&
    permissionRecord.status !== "fallback_local"
  ) {
    throw blockedError(
      "PERMISSION_STATUS_NOT_ALLOWED",
      "Permission is not active for agent spending",
      {
        permissionId: permissionRecord.id,
        status: permissionRecord.status
      }
    );
  }

  assertNotExpired(permissionRecord.expiresAt, now, "permission.expiresAt");
  assertPermissionMatchesConfig(permissionRecord);
  assertAdvancedPermissionGrant(permissionRecord, now);

  const paymentRequirement = input.paymentRequirement ?? null;
  const amountAtomic =
    input.amountAtomic ??
    paymentRequirement?.amountAtomic ??
    permissionRecord.pricePerCallAtomic;
  const amount = assertAtomicAmount(amountAtomic, "amountAtomic");
  const maxPrice = assertAtomicAmount(permissionRecord.pricePerCallAtomic, "maxPriceAtomic");
  const spent = assertAtomicAmount(permissionRecord.spentAtomic, "spentAtomic");
  const maxAmount = assertAtomicAmount(permissionRecord.maxSpendAtomic, "maxAmountAtomic");

  if (amount <= BigInt(0)) {
    throw blockedError("INVALID_AMOUNT", "Payment amount must be greater than zero", {
      amountAtomic
    });
  }

  if (amount > maxPrice) {
    throw blockedError("PRICE_EXCEEDED", "Payment amount exceeds max price", {
      amountAtomic,
      maxPriceAtomic: permissionRecord.pricePerCallAtomic,
      permissionId: permissionRecord.id
    });
  }

  if (spent + amount > maxAmount) {
    throw blockedError("BUDGET_EXCEEDED", "Payment amount exceeds remaining budget", {
      amountAtomic,
      maxAmountAtomic: permissionRecord.maxSpendAtomic,
      permissionId: permissionRecord.id,
      spentAtomic: permissionRecord.spentAtomic
    });
  }

  if (paymentRequirement) {
    assertPaymentRequirementMatchesConfig(permissionRecord, paymentRequirement, now);
  }

  return {
    action: AGENT_RUNNER_ACTION,
    amountAtomic,
    paymentRequirement,
    permissionRecord
  };
}

export function policyGuard(input: PolicyGuardInput): PolicyGuardResult {
  try {
    return {
      allowed: true,
      ...assertPolicyGuard(input)
    };
  } catch (error) {
    if (isAgentRunnerError(error)) {
      return {
        allowed: false,
        error
      };
    }

    throw error;
  }
}

export function precheckPolicyGuard(
  input: Omit<PolicyGuardInput, "paymentRequirement">
): PolicyGuardDecision {
  return assertPolicyGuard(input);
}

export function validateRequirement(
  input: PolicyGuardInput & {
    paymentRequirement: RunnerPaymentRequirement;
  }
): PolicyGuardDecision {
  return assertPolicyGuard({
    ...input,
    amountAtomic: input.paymentRequirement.amountAtomic
  });
}
