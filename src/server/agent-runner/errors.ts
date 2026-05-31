export type AgentRunnerErrorCode =
  | "ADAPTER_NOT_CONFIGURED"
  | "AI_FAILED"
  | "BUDGET_EXCEEDED"
  | "CONFIG_MISMATCH"
  | "INVALID_ACTION"
  | "INVALID_AMOUNT"
  | "PAYMENT_FAILED"
  | "PERMISSION_EXPIRED"
  | "PERMISSION_NOT_FOUND"
  | "PERMISSION_REVOKED"
  | "PERMISSION_STATUS_NOT_ALLOWED"
  | "POLICY_MISMATCH"
  | "PRICE_EXCEEDED"
  | "REQUIREMENT_EXPIRED"
  | "REQUIREMENT_NOT_ALLOWED"
  | "REQUIREMENT_STATUS_INVALID"
  | "RUN_IN_PROGRESS"
  | "VENICE_FAILED";

export type AgentRunnerErrorOptions = {
  blocked?: boolean;
  cause?: unknown;
  details?: Record<string, unknown>;
};

export class AgentRunnerError extends Error {
  readonly blocked: boolean;
  readonly code: AgentRunnerErrorCode;
  readonly details: Record<string, unknown>;
  readonly originalError?: unknown;

  constructor(
    code: AgentRunnerErrorCode,
    message: string,
    options: AgentRunnerErrorOptions = {}
  ) {
    super(message);
    this.name = "AgentRunnerError";
    this.blocked = options.blocked ?? false;
    this.code = code;
    this.details = options.details ?? {};
    this.originalError = options.cause;
  }
}

export function isAgentRunnerError(error: unknown): error is AgentRunnerError {
  return error instanceof AgentRunnerError;
}

export function adapterNotConfigured(method: string): AgentRunnerError {
  return new AgentRunnerError(
    "ADAPTER_NOT_CONFIGURED",
    `Agent runner adapter is not configured: ${method}`,
    {
      details: { method }
    }
  );
}

export function formatRunnerError(error: unknown): string {
  if (isAgentRunnerError(error)) {
    return `${error.code}: ${error.message}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown agent runner error";
}
