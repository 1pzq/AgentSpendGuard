import {
  normalizeAgentSpendDecision,
  type AgentSpendDecisionInput,
  type AgentSpendDecisionIntent
} from "@/server/agent-runner/agentSpendDecision";
import { spendguardConfig } from "@/server/config/spendguard";
import type { AgentSpendDecision } from "@/shared/types";

type DeepSeekMessage = {
  content?: string | null;
};

type DeepSeekChoice = {
  message?: DeepSeekMessage;
};

type DeepSeekChatResponse = {
  choices?: DeepSeekChoice[];
};

type DecisionJson = {
  confidence?: unknown;
  decision?: unknown;
  estimatedCostAtomic?: unknown;
  reason?: unknown;
};

function endpointUrl() {
  const base = spendguardConfig.deepseekApiBase.replace(/\/+$/, "");
  const path = spendguardConfig.endpoint.aiPath.startsWith("/")
    ? spendguardConfig.endpoint.aiPath
    : `/${spendguardConfig.endpoint.aiPath}`;

  return `${base}${path}`;
}

function parseJsonContent(content: string): DecisionJson | null {
  try {
    return JSON.parse(content) as DecisionJson;
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return null;

    try {
      return JSON.parse(match[0]) as DecisionJson;
    } catch {
      return null;
    }
  }
}

function mockIntent(input: AgentSpendDecisionInput): AgentSpendDecisionIntent {
  const successfulCalls = input.recentLedgerEntries.filter(
    (entry) => entry.status === "success" || entry.status === "paid_ai_failed"
  ).length;

  return {
    decision: "spend",
    reason: [
      `${input.service} wallet risk brief requires one paid analysis call.`,
      `The requested endpoint ${input.allowedEndpoint} is in scope and this would be paid call #${successfulCalls + 1}.`,
      "SpendGuard must still enforce budget, endpoint, token, network, and payTo before any x402 header is submitted."
    ].join(" "),
    estimatedCostAtomic: input.amountAtomic,
    confidence: "high"
  };
}

function buildMessages(input: AgentSpendDecisionInput) {
  return [
    {
      role: "system",
      content:
        "You are the spending decision layer for Agent SpendGuard. Return only compact valid JSON with fields decision, reason, estimatedCostAtomic, confidence. decision must be spend, skip, or blocked. confidence must be low, medium, or high. Do not claim payment is allowed; SpendGuard enforces policy separately."
    },
    {
      role: "user",
      content: [
        `User goal: ${input.userGoal}`,
        `Agent action: ${input.action}`,
        `Current remaining budget: ${input.permission.remainingSpendAtomic} atomic ${input.token}`,
        `Single-call price: ${input.amountAtomic} atomic ${input.token}`,
        `Allowed endpoint: ${input.allowedMethod} ${input.allowedEndpoint}`,
        `Network: ${input.network}`,
        `Token decimals: ${input.tokenDecimals}`,
        `payTo: ${input.payTo}`,
        `Recent ledger statuses: ${input.recentLedgerEntries
          .slice(0, 5)
          .map((entry) => `${entry.status}:${entry.amountAtomic}`)
          .join(", ") || "none"}`,
        "Decide whether the paid call is worthwhile for the user goal. Return JSON only."
      ].join("\n")
    }
  ];
}

async function runRealDecisionIntent(
  input: AgentSpendDecisionInput
): Promise<AgentSpendDecisionIntent> {
  if (!spendguardConfig.deepseekApiKey) {
    throw new Error("DeepSeek API key is not configured.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(endpointUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${spendguardConfig.deepseekApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: spendguardConfig.deepseekModel,
        messages: buildMessages(input),
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 400
      }),
      signal: controller.signal
    });
    const responseText = await response.text();

    if (!response.ok) {
      throw new Error(`DeepSeek spending decision failed with HTTP ${response.status}.`);
    }

    const payload = JSON.parse(responseText) as DeepSeekChatResponse;
    const content = payload.choices?.[0]?.message?.content;
    const parsed = content?.trim() ? parseJsonContent(content) : null;

    if (!parsed) {
      throw new Error("DeepSeek spending decision did not return JSON.");
    }

    return {
      decision: parsed.decision === "skip" || parsed.decision === "blocked"
        ? parsed.decision
        : "spend",
      reason:
        typeof parsed.reason === "string"
          ? parsed.reason
          : mockIntent(input).reason,
      estimatedCostAtomic:
        typeof parsed.estimatedCostAtomic === "string"
          ? parsed.estimatedCostAtomic
          : input.amountAtomic,
      confidence:
        parsed.confidence === "low" ||
        parsed.confidence === "medium" ||
        parsed.confidence === "high"
          ? parsed.confidence
          : "medium"
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function decideAgentSpend(
  input: AgentSpendDecisionInput
): Promise<AgentSpendDecision> {
  let intent: AgentSpendDecisionIntent;

  if (
    spendguardConfig.aiProvider === "deepseek" &&
    spendguardConfig.deepseekMode === "real"
  ) {
    try {
      intent = await runRealDecisionIntent(input);
    } catch (error) {
      console.warn(
        "DeepSeek spending decision unavailable; using mock fallback.",
        error
      );
      intent = mockIntent(input);
    }
  } else {
    intent = mockIntent(input);
  }

  return normalizeAgentSpendDecision(input, intent);
}

export const agentSpendDecisionAdapter = {
  decideAgentSpend
};
