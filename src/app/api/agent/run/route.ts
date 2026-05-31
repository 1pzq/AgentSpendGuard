import { demoAgentRunnerAdapters } from "@/server/adapters/mockAdapters";
import { AGENT_RUNNER_ACTION } from "@/server/agent-runner/policyGuard";
import { isAgentRunnerError } from "@/server/agent-runner/errors";
import { runAgentWithPermission } from "@/server/agent-runner/runAgentWithPermission";
import { spendguardConfig } from "@/server/config/spendguard";
import { getPermissionRecord, updatePermissionRecord } from "@/server/permissions/store";
import type { DashboardState, RunnerSpendResult } from "@/shared/types";
import {
  buildDashboardState,
  getDemoPhase,
  jsonError,
  jsonOk,
  setDemoPhase
} from "../../_lib/demoState";

type RunRequestBody = {
  action?: string;
  idempotencyKey?: string;
};

type AgentRunResponseData = RunnerSpendResult & {
  state: DashboardState;
};

async function readBody(request: Request): Promise<RunRequestBody> {
  try {
    return (await request.json()) as RunRequestBody;
  } catch {
    return {};
  }
}

export async function POST(request: Request) {
  const body = await readBody(request);
  const permission = getPermissionRecord();

  if (getDemoPhase() === "initial") {
    return jsonError(
      "WALLET_NOT_CONNECTED",
      "Connect a Base Sepolia wallet before running the agent.",
      { status: 409 }
    );
  }

  if (permission.status === "revoked") {
    return jsonError(
      "PERMISSION_REVOKED",
      "Permission has been revoked. Reset the demo to run again.",
      { status: 409 }
    );
  }

  if (permission.status !== "active" && permission.status !== "fallback_local") {
    return jsonError(
      "PERMISSION_NOT_ACTIVE",
      "Approve the scoped permission before running the agent.",
      { status: 409 }
    );
  }

  setDemoPhase("running");

  try {
    const result = await runAgentWithPermission(
      {
        action: body.action ?? AGENT_RUNNER_ACTION,
        idempotencyKey: body.idempotencyKey,
        permissionRecordId: permission.id,
        policyId: spendguardConfig.policy.id
      },
      demoAgentRunnerAdapters
    );

    if (!result.blockedReason && result.permission.status === "redeemed") {
      updatePermissionRecord({
        status: "active"
      });
    }

    setDemoPhase("run_completed");

    return jsonOk<AgentRunResponseData>({
      ...result,
      state: buildDashboardState()
    });
  } catch (error) {
    setDemoPhase("run_completed");

    if (isAgentRunnerError(error)) {
      return jsonError(
        error.code,
        error.message,
        { status: error.blocked ? 409 : 500 },
        error.details
      );
    }

    return jsonError(
      "RUNNER_FAILED",
      error instanceof Error ? error.message : "Agent runner failed",
      { status: 500 }
    );
  }
}
