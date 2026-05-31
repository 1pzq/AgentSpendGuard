import { AGENT_RUNNER_ACTION } from "@/server/agent-runner/policyGuard";
import {
  runAgentWithPermission,
  type RunAgentWithPermissionInput
} from "@/server/agent-runner/runAgentWithPermission";
import { spendguardConfig } from "@/server/config/spendguard";
import { resetLedgerDemoState } from "@/server/ledger/store";
import { resetPermissionDemoState } from "@/server/permissions/store";
import { demoAgentRunnerAdapters } from "./mockAdapters";

export type RunMockDemoInput = Partial<
  Pick<RunAgentWithPermissionInput, "action" | "idempotencyKey">
> & {
  resetState?: boolean;
};

export async function runMockAdapterDemo(input: RunMockDemoInput = {}) {
  if (input.resetState ?? true) {
    resetPermissionDemoState();
    resetLedgerDemoState();
  }

  return runAgentWithPermission(
    {
      action: input.action ?? AGENT_RUNNER_ACTION,
      idempotencyKey: input.idempotencyKey,
      permissionRecordId: spendguardConfig.mockIds.permissionId,
      policyId: spendguardConfig.policy.id
    },
    demoAgentRunnerAdapters
  );
}
