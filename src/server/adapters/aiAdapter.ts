import type { RunAiRiskBriefInput } from "@/server/agent-runner/runAgentWithPermission";
import { spendguardConfig } from "@/server/config/spendguard";
import type { AiRiskBrief } from "@/shared/types";
import { runRealDeepSeek } from "./deepseekAdapter";
import { runMockAiRiskBrief } from "./mockVeniceAdapter";

export async function runConfiguredAiRiskBrief(
  input: RunAiRiskBriefInput
): Promise<AiRiskBrief> {
  if (
    spendguardConfig.aiProvider === "deepseek" &&
    spendguardConfig.deepseekMode === "real"
  ) {
    return runRealDeepSeek(input);
  }

  return runMockAiRiskBrief(input);
}

export const configuredAiAdapter = {
  runAiRiskBrief: runConfiguredAiRiskBrief
};
