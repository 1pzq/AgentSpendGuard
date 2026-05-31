import { AGENT_RUNNER_ACTION, precheckPolicyGuard } from "@/server/agent-runner/policyGuard";
import { isAgentRunnerError } from "@/server/agent-runner/errors";
import { spendguardConfig } from "@/server/config/spendguard";
import { appendLedgerEntry } from "@/server/ledger/store";
import { getPermissionRecord } from "@/server/permissions/store";
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

  try {
    precheckPolicyGuard({
      action: body.action ?? AGENT_RUNNER_ACTION,
      amountAtomic: requestedAmountAtomic(body, permission.pricePerCallAtomic),
      permissionRecord: permission,
      policyId: spendguardConfig.policy.id
    });

    setDemoPhase("running");

    return jsonOk({
      state: buildDashboardState()
    });
  } catch (error) {
    if (isAgentRunnerError(error)) {
      if (error.blocked) {
        appendLedgerEntry({
          amountAtomic: requestedAmountAtomic(body, permission.pricePerCallAtomic),
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
