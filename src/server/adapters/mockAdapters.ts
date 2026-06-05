import type { AgentRunnerAdapters } from "@/server/agent-runner/runAgentWithPermission";
import {
  normalizeAgentSpendDecision,
  type AgentSpendDecisionInput,
  type AgentSpendDecisionIntent
} from "@/server/agent-runner/agentSpendDecision";
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

async function decideMockAgentSpend(input: AgentSpendDecisionInput) {
  const successfulCalls = input.recentLedgerEntries.filter(
    (entry) => entry.status === "success" || entry.status === "paid_ai_failed"
  ).length;
  const intent: AgentSpendDecisionIntent = {
    confidence: "high",
    decision: "spend",
    estimatedCostAtomic: input.amountAtomic,
    reason: [
      `${input.service} wallet risk brief requires one paid analysis call.`,
      `The requested endpoint ${input.allowedEndpoint} is in scope and this would be paid call #${successfulCalls + 1}.`,
      "SpendGuard still enforces budget, endpoint, token, network, and payTo before any x402 header is submitted."
    ].join(" ")
  };

  return normalizeAgentSpendDecision(input, intent);
}

export const mockAgentRunnerAdapters: AgentRunnerAdapters = {
  decideAgentSpend: decideMockAgentSpend,
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
