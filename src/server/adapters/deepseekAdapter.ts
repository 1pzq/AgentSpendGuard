import { AgentRunnerError, adapterNotConfigured } from "@/server/agent-runner/errors";
import type { RunAiRiskBriefInput } from "@/server/agent-runner/runAgentWithPermission";
import { spendguardConfig } from "@/server/config/spendguard";
import type { AiRiskBrief, RiskLevel } from "@/shared/types";

type DeepSeekMessage = {
  content?: string | null;
};

type DeepSeekChoice = {
  message?: DeepSeekMessage;
};

type DeepSeekChatResponse = {
  choices?: DeepSeekChoice[];
};

type RiskBriefJson = {
  title?: unknown;
  summary?: unknown;
  findings?: unknown;
  riskLevel?: unknown;
};

function endpointUrl() {
  const base = spendguardConfig.deepseekApiBase.replace(/\/+$/, "");
  const path = spendguardConfig.endpoint.aiPath.startsWith("/")
    ? spendguardConfig.endpoint.aiPath
    : `/${spendguardConfig.endpoint.aiPath}`;

  return `${base}${path}`;
}

function shortAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function resolveWalletAddress(input: RunAiRiskBriefInput): string {
  return (
    input.permission.wallet.eoa ??
    input.permission.wallet.smartAccount ??
    spendguardConfig.mockIds.walletEoa
  );
}

function normalizeRiskLevel(value: unknown): RiskLevel {
  return value === "low" || value === "medium" || value === "high"
    ? value
    : "unknown";
}

function normalizeFindings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((finding): finding is string => typeof finding === "string")
    .map((finding) => finding.trim())
    .filter(Boolean)
    .slice(0, 5);
}

function parseJsonContent(content: string): RiskBriefJson | null {
  try {
    return JSON.parse(content) as RiskBriefJson;
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return null;

    try {
      return JSON.parse(match[0]) as RiskBriefJson;
    } catch {
      return null;
    }
  }
}

function fallbackBrief({
  content,
  walletAddress,
  paymentReceiptId
}: {
  content: string;
  walletAddress: string;
  paymentReceiptId: string;
}): Pick<AiRiskBrief, "title" | "summary" | "findings" | "riskLevel"> {
  return {
    title: "钱包风险简报",
    summary:
      content.trim() ||
      `DeepSeek 在 x402 支付 ${paymentReceiptId} 后没有返回可用内容SpendGuard 已为钱包 ${shortAddress(walletAddress)} 生成本地兜底简报，保证付费流程可以完整结束`,
    findings: [
      "在主网使用该钱包前，请复核原始模型摘要",
      "在生产级策略签名启用前，继续将该 agent 限制在每天 1.00 USDC 预算内"
    ],
    riskLevel: "unknown"
  };
}

function normalizeBrief({
  content,
  input,
  walletAddress
}: {
  content: string;
  input: RunAiRiskBriefInput;
  walletAddress: string;
}): AiRiskBrief {
  const parsed = parseJsonContent(content);
  const fallback = fallbackBrief({
    content,
    paymentReceiptId: input.paymentReceipt.id,
    walletAddress
  });
  const findings = normalizeFindings(parsed?.findings);

  return {
    id: `${spendguardConfig.mockIds.aiBriefId}:${input.paymentReceipt.id}`,
    title: typeof parsed?.title === "string" ? parsed.title : fallback.title,
    summary:
      typeof parsed?.summary === "string" ? parsed.summary : fallback.summary,
    findings: findings.length > 0 ? findings : fallback.findings,
    walletAddress,
    riskLevel: normalizeRiskLevel(parsed?.riskLevel),
    model: spendguardConfig.deepseekModel,
    createdAt: new Date().toISOString()
  };
}

function buildMessages(input: RunAiRiskBriefInput, walletAddress: string) {
  return [
    {
      role: "system",
      content:
        "你是 Agent SpendGuard 的付费钱包风险分析员只返回紧凑合法 JSON，字段必须是 title、summary、findings、riskLeveltitle、summary、findings 使用中文；riskLevel 必须是 low、medium、high 或 unknown"
    },
    {
      role: "user",
      content: [
        `为钱包 ${walletAddress} 生成一份简洁的钱包风险简报`,
        `支付凭证：${input.paymentReceipt.id}`,
        `支付金额：${input.paymentReceipt.amountAtomic} atomic ${input.paymentReceipt.token}`,
        `预算上限：${input.permission.maxSpendAtomic} atomic ${input.permission.token}`,
        `本次报告前已支出：${input.permission.spentAtomic} atomic ${input.permission.token}`,
        "请使用审慎措辞，因为这是 Base Sepolia 演示，没有拉取完整交易历史"
      ].join("\n")
    }
  ];
}

export async function runRealDeepSeek(
  input: RunAiRiskBriefInput
): Promise<AiRiskBrief> {
  if (!spendguardConfig.deepseekApiKey) {
    throw adapterNotConfigured("runRealDeepSeek");
  }

  const walletAddress = resolveWalletAddress(input);
  let sawEmptyContent = false;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    try {
      const response = await fetch(endpointUrl(), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${spendguardConfig.deepseekApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: spendguardConfig.deepseekModel,
          messages: buildMessages(input, walletAddress),
          response_format: { type: "json_object" },
          temperature: 0.2,
          max_tokens: 700
        }),
        signal: controller.signal
      });

      const responseText = await response.text();

      if (!response.ok) {
        throw new AgentRunnerError(
          "AI_FAILED",
          `DeepSeek API failed with HTTP ${response.status}`,
          {
            details: {
              provider: "deepseek",
              status: response.status,
              response: responseText.slice(0, 500)
            }
          }
        );
      }

      const payload = JSON.parse(responseText) as DeepSeekChatResponse;
      const content = payload.choices?.[0]?.message?.content;

      if (content?.trim()) {
        return normalizeBrief({ content, input, walletAddress });
      }

      sawEmptyContent = true;
    } catch (error) {
      if (error instanceof AgentRunnerError) throw error;

      throw new AgentRunnerError(
        "AI_FAILED",
        error instanceof Error ? error.message : "DeepSeek request failed",
        {
          cause: error,
          details: {
            provider: "deepseek"
          }
        }
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  if (sawEmptyContent) {
    console.warn("DeepSeek returned empty message content twice; using fallback brief.");
  }

  return normalizeBrief({ content: "", input, walletAddress });
}

export const deepseekAdapter = {
  runAiRiskBrief: runRealDeepSeek
};
