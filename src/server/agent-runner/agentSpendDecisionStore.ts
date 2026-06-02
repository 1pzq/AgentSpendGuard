import { readJsonFile, writeJsonFile } from "@/server/storage/jsonFile";
import type { AgentSpendDecision } from "@/shared/types";

const DECISION_FILE = "agent-spend-decision.json";

type DecisionSnapshot = {
  current: AgentSpendDecision | null;
};

type AgentDecisionGlobal = typeof globalThis & {
  __spendguardAgentSpendDecision?: AgentSpendDecision | null;
  __spendguardAgentSpendDecisionLoaded?: boolean;
};

function decisionGlobal(): AgentDecisionGlobal {
  return globalThis as AgentDecisionGlobal;
}

function isAgentSpendDecision(value: unknown): value is AgentSpendDecision {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as AgentSpendDecision).decision === "string" &&
    typeof (value as AgentSpendDecision).reason === "string" &&
    typeof (value as AgentSpendDecision).estimatedCostAtomic === "string" &&
    typeof (value as AgentSpendDecision).budgetBeforeAtomic === "string" &&
    typeof (value as AgentSpendDecision).policyCheck === "string"
  );
}

function cloneDecision(
  decision: AgentSpendDecision | null | undefined
): AgentSpendDecision | null {
  return decision ? { ...decision } : null;
}

function readDecisionSnapshot(): AgentSpendDecision | null {
  const snapshot = readJsonFile<Partial<DecisionSnapshot>>(DECISION_FILE, {});

  return isAgentSpendDecision(snapshot.current) ? cloneDecision(snapshot.current) : null;
}

function ensureDecisionLoaded() {
  const store = decisionGlobal();

  if (store.__spendguardAgentSpendDecisionLoaded) return;

  store.__spendguardAgentSpendDecision = readDecisionSnapshot();
  store.__spendguardAgentSpendDecisionLoaded = true;
}

function setDecisionState(decision: AgentSpendDecision | null) {
  const store = decisionGlobal();
  store.__spendguardAgentSpendDecision = cloneDecision(decision);
  store.__spendguardAgentSpendDecisionLoaded = true;
  writeJsonFile(DECISION_FILE, { current: decision });
}

export function getCurrentAgentSpendDecision(): AgentSpendDecision | null {
  ensureDecisionLoaded();
  return cloneDecision(decisionGlobal().__spendguardAgentSpendDecision);
}

export function setCurrentAgentSpendDecision(
  decision: AgentSpendDecision | null
): AgentSpendDecision | null {
  setDecisionState(decision);
  return cloneDecision(decision);
}

export function clearCurrentAgentSpendDecision() {
  setDecisionState(null);
}
