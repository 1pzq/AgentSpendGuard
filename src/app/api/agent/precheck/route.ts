import { AGENT_RUNNER_ACTION, precheckPolicyGuard } from "@/server/agent-runner/policyGuard";
import { AgentRunnerError, isAgentRunnerError } from "@/server/agent-runner/errors";
import {
  agentDecisionAllowsPayment,
  applyAgentDecisionPolicyCheck,
  applyAgentSpendDecisionOverride,
  buildAgentSpendDecisionInput,
  type AgentSpendDecisionOverride
} from "@/server/agent-runner/agentSpendDecision";
import { setCurrentAgentSpendDecision } from "@/server/agent-runner/agentSpendDecisionStore";
import { decideAgentSpend } from "@/server/adapters/agentSpendDecisionAdapter";
import { spendguardConfig } from "@/server/config/spendguard";
import { appendLedgerEntry, listLedgerEntries } from "@/server/ledger/store";
import { getPermissionRecord } from "@/server/permissions/store";
import type { AgentSpendDecision } from "@/shared/types";
import {
  buildDashboardState,
  getDemoPhase,
  jsonError,
  jsonOk,
  setDemoPhase
} from "../../_lib/demoState";

type PrecheckRequestBody = {
  action?: string;
  amountAtomic?: unknown;
  decisionOverride?: unknown;
  recordBlockedOnly?: unknown;
};

async function readBody(request: Request): Promise<PrecheckRequestBody> {
  try {
    return (await request.json()) as PrecheckRequestBody;
  } catch {
    return {};
  }
}

function requestedAmountAtomic(body: PrecheckRequestBody, fallback: string) {
  return typeof body.amountAtomic === "string" && /^\d+$/.test(body.amountAtomic)
    ? body.amountAtomic
    : fallback;
}

function shouldReturnBlockedState(body: PrecheckRequestBody) {
  return body.recordBlockedOnly === true;
}

function decisionOverride(body: PrecheckRequestBody): AgentSpendDecisionOverride | null {
  if (
    !body.decisionOverride ||
    typeof body.decisionOverride !== "object" ||
    Array.isArray(body.decisionOverride)
  ) {
    return null;
  }

  return body.decisionOverride as AgentSpendDecisionOverride;
}

function blockedAgentDecisionError(agentDecision: {
  decision: "spend" | "skip" | "blocked";
  reason: string;
}) {
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

export async function POST(request: Request) {
  const body = await readBody(request);
  const permission = getPermissionRecord();
  let agentDecisionForLedger: AgentSpendDecision | null = null;

  if (
    getDemoPhase() === "initial" &&
    permission.status !== "active" &&
    permission.status !== "fallback_local"
  ) {
    return jsonError(
      "WALLET_NOT_CONNECTED",
      "Connect a Base Sepolia wallet before running the agent.",
      { status: 409 }
    );
  }

  try {
    const amountAtomic = requestedAmountAtomic(
      body,
      permission.pricePerCallAtomic
    );
    const decisionInput = buildAgentSpendDecisionInput({
      action: body.action ?? AGENT_RUNNER_ACTION,
      amountAtomic,
      permission,
      policyId: spendguardConfig.policy.id,
      recentLedgerEntries: listLedgerEntries()
    });
    let agentDecision = applyAgentSpendDecisionOverride(
      await decideAgentSpend(decisionInput),
      decisionOverride(body)
    );
    agentDecisionForLedger = agentDecision;
    setCurrentAgentSpendDecision(agentDecision);

    if (agentDecision.decision !== "spend") {
      agentDecision = applyAgentDecisionPolicyCheck(agentDecision, "denied");
      agentDecisionForLedger = agentDecision;
      setCurrentAgentSpendDecision(agentDecision);

      throw blockedAgentDecisionError(agentDecision);
    }

    precheckPolicyGuard({
      action: body.action ?? AGENT_RUNNER_ACTION,
      amountAtomic: agentDecision.estimatedCostAtomic,
      permissionRecord: permission,
      policyId: spendguardConfig.policy.id
    });

    agentDecision = applyAgentDecisionPolicyCheck(agentDecision, "allowed");
    agentDecisionForLedger = agentDecision;
    setCurrentAgentSpendDecision(agentDecision);

    if (!agentDecisionAllowsPayment(agentDecision)) {
      throw blockedAgentDecisionError(agentDecision);
    }

    setDemoPhase("running");

    return jsonOk({
      state: buildDashboardState()
    });
  } catch (error) {
    if (isAgentRunnerError(error)) {
      if (error.blocked) {
        if (agentDecisionForLedger) {
          agentDecisionForLedger = applyAgentDecisionPolicyCheck(
            agentDecisionForLedger,
            "denied"
          );
          setCurrentAgentSpendDecision(agentDecisionForLedger);
        }

        appendLedgerEntry({
          amountAtomic:
            agentDecisionForLedger?.estimatedCostAtomic ??
            requestedAmountAtomic(body, permission.pricePerCallAtomic),
          agentDecision: agentDecisionForLedger,
          endpoint: permission.allowedEndpoint,
          permissionId: permission.id,
          policyId: permission.policyId,
          reason: error.message,
          service: permission.service,
          serviceId: permission.serviceId,
          status: "blocked",
          token: permission.token,
          tokenDecimals: permission.tokenDecimals
        });

        if (shouldReturnBlockedState(body)) {
          setDemoPhase("run_completed");

          return jsonOk({
            state: buildDashboardState()
          });
        }
      }

      return jsonError(
        error.code,
        error.message,
        { status: error.blocked ? 409 : 500 },
        error.details
      );
    }

    return jsonError(
      "PRECHECK_FAILED",
      error instanceof Error ? error.message : "Agent precheck failed",
      { status: 500 }
    );
  }
}
