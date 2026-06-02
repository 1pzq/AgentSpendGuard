import type { AgentRunnerAdapters } from "@/server/agent-runner/runAgentWithPermission";
import { decideAgentSpend } from "./agentSpendDecisionAdapter";
import { runConfiguredAiRiskBrief } from "./aiAdapter";
import { getMockX402Requirement } from "./mockX402Adapter";
import { payMockRequirement } from "./mockPaymentAdapter";
import { runMockAiRiskBrief } from "./mockVeniceAdapter";

export { agentSpendDecisionAdapter, decideAgentSpend } from "./agentSpendDecisionAdapter";
export { configuredAiAdapter, runConfiguredAiRiskBrief } from "./aiAdapter";
export { deepseekAdapter, runRealDeepSeek } from "./deepseekAdapter";
export { getMockX402Requirement, mockX402Adapter } from "./mockX402Adapter";
export {
  MOCK_ONESHOT_FEE,
  createOneShotTimeline,
  getOneShotPaymentStatus,
  mockOneShotAdapter,
  quoteOneShotPayment,
  submitOneShotPayment
} from "./mockOneShotAdapter";
export {
  mockPaymentAdapter,
  payMockRequirement,
  type MockPaymentReceipt
} from "./mockPaymentAdapter";
export { mockVeniceAdapter, runMockAiRiskBrief, runMockVenice } from "./mockVeniceAdapter";

export const mockAgentRunnerAdapters: AgentRunnerAdapters = {
  decideAgentSpend,
  getRequirement: getMockX402Requirement,
  payRequirement: payMockRequirement,
  runAiRiskBrief: runMockAiRiskBrief
};

export const demoAgentRunnerAdapters: AgentRunnerAdapters = {
  decideAgentSpend,
  getRequirement: getMockX402Requirement,
  payRequirement: payMockRequirement,
  runAiRiskBrief: runConfiguredAiRiskBrief
};

export const mockAdapters = mockAgentRunnerAdapters;

export default mockAgentRunnerAdapters;
