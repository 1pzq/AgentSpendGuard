import { spendguardConfig } from "@/server/config/spendguard";
import type {
  AgentSpendDecision,
  AgentSpendDecisionConfidence,
  AgentSpendDecisionKind,
  AgentSpendDecisionPolicyCheck,
  AtomicAmount,
  HttpMethod,
  LedgerEntry,
  PermissionRecord,
  SpendGuardServiceId,
  TokenSymbol
} from "@/shared/types";

export type AgentSpendDecisionInput = {
  action: string;
  amountAtomic: AtomicAmount;
  allowedEndpoint: string;
  allowedMethod: HttpMethod;
  network: string;
  payTo: string;
  permission: PermissionRecord;
  policyId: string;
  recentLedgerEntries: LedgerEntry[];
  service: string;
  serviceId: SpendGuardServiceId;
  token: TokenSymbol;
  tokenDecimals: number;
  userGoal: string;
};

export type AgentSpendDecisionIntent = {
  decision: AgentSpendDecisionKind;
  reason: string;
  estimatedCostAtomic: AtomicAmount;
  confidence: AgentSpendDecisionConfidence;
};

export type AgentSpendDecisionOverride = Partial<AgentSpendDecisionIntent>;

const DECISION_KINDS: AgentSpendDecisionKind[] = ["spend", "skip", "blocked"];
const CONFIDENCE_LEVELS: AgentSpendDecisionConfidence[] = [
  "low",
  "medium",
  "high"
];

function nowIso() {
  return new Date().toISOString();
}

function validAtomicAmount(value: unknown): value is AtomicAmount {
  return typeof value === "string" && /^\d+$/.test(value);
}

function atomicOrFallback(value: unknown, fallback: AtomicAmount): AtomicAmount {
  return validAtomicAmount(value) ? value : fallback;
}

function normalizeDecisionKind(value: unknown): AgentSpendDecisionKind {
  return DECISION_KINDS.includes(value as AgentSpendDecisionKind)
    ? value as AgentSpendDecisionKind
    : "blocked";
}

function normalizeConfidence(value: unknown): AgentSpendDecisionConfidence {
  return CONFIDENCE_LEVELS.includes(value as AgentSpendDecisionConfidence)
    ? value as AgentSpendDecisionConfidence
    : "medium";
}

function normalizeReason(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;

  return trimmed.length > 500 ? `${trimmed.slice(0, 500)}...` : trimmed;
}

function subtractAtomicOrNull(
  left: AtomicAmount,
  right: AtomicAmount
): AtomicAmount | null {
  const result = BigInt(left) - BigInt(right);

  return result >= BigInt(0) ? result.toString() : null;
}

function budgetAfterForDecision(
  decision: AgentSpendDecisionKind,
  budgetBeforeAtomic: AtomicAmount,
  estimatedCostAtomic: AtomicAmount
): AtomicAmount | null {
  if (decision === "blocked") return null;
  if (decision === "skip") return budgetBeforeAtomic;

  return subtractAtomicOrNull(budgetBeforeAtomic, estimatedCostAtomic);
}

function defaultReason(input: AgentSpendDecisionInput) {
  return `${input.service} ${input.userGoal} requires the paid risk-brief endpoint and should be checked by SpendGuard before payment.`;
}

export function buildAgentSpendDecisionInput({
  action,
  amountAtomic,
  permission,
  policyId,
  recentLedgerEntries,
  userGoal = "检查钱包风险"
}: {
  action: string;
  amountAtomic: AtomicAmount;
  permission: PermissionRecord;
  policyId: string;
  recentLedgerEntries: LedgerEntry[];
  userGoal?: string;
}): AgentSpendDecisionInput {
  return {
    action,
    amountAtomic,
    allowedEndpoint: permission.allowedEndpoint,
    allowedMethod: permission.allowedMethods[0] ?? spendguardConfig.endpoint.method,
    network: `eip155:${permission.chainId}`,
    payTo: permission.payTo,
    permission,
    policyId,
    recentLedgerEntries,
    service: permission.service,
    serviceId: permission.serviceId,
    token: permission.token,
    tokenDecimals: permission.tokenDecimals,
    userGoal
  };
}

export function normalizeAgentSpendDecision(
  input: AgentSpendDecisionInput,
  intent: Partial<AgentSpendDecisionIntent>
): AgentSpendDecision {
  const decision = normalizeDecisionKind(intent.decision);
  const estimatedCostAtomic = atomicOrFallback(
    intent.estimatedCostAtomic,
    input.amountAtomic
  );
  const budgetBeforeAtomic = input.permission.remainingSpendAtomic;

  return {
    decision,
    reason: normalizeReason(intent.reason, defaultReason(input)),
    estimatedCostAtomic,
    budgetBeforeAtomic,
    budgetAfterAtomic: budgetAfterForDecision(
      decision,
      budgetBeforeAtomic,
      estimatedCostAtomic
    ),
    confidence: normalizeConfidence(intent.confidence),
    policyCheck: "denied",
    decidedAt: nowIso()
  };
}

export function applyAgentDecisionPolicyCheck(
  decision: AgentSpendDecision,
  policyCheck: AgentSpendDecisionPolicyCheck
): AgentSpendDecision {
  return {
    ...decision,
    policyCheck,
    budgetAfterAtomic:
      decision.decision === "spend" && policyCheck === "denied"
        ? null
        : decision.budgetAfterAtomic
  };
}

export function agentDecisionAllowsPayment(decision: AgentSpendDecision) {
  return decision.decision === "spend" && decision.policyCheck === "allowed";
}

export function applyAgentSpendDecisionOverride(
  decision: AgentSpendDecision,
  override: AgentSpendDecisionOverride | null | undefined
): AgentSpendDecision {
  if (!override) return decision;
  const nextDecision = normalizeDecisionKind(override.decision ?? decision.decision);
  const estimatedCostAtomic = atomicOrFallback(
    override.estimatedCostAtomic,
    decision.estimatedCostAtomic
  );

  return {
    ...decision,
    confidence: normalizeConfidence(override.confidence ?? decision.confidence),
    decision: nextDecision,
    estimatedCostAtomic,
    budgetAfterAtomic: budgetAfterForDecision(
      nextDecision,
      decision.budgetBeforeAtomic,
      estimatedCostAtomic
    ),
    reason: normalizeReason(override.reason, decision.reason)
  };
}
