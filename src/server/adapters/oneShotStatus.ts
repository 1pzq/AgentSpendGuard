export type NormalizedOneShotStatus =
  | {
      checkedAt: string;
      confirmedAt: string;
      quoteId: string;
      status: "confirmed";
      taskId: string;
      txHash: string;
    }
  | {
      checkedAt: string;
      confirmedAt: null;
      quoteId: string;
      status: "pending";
      taskId: string;
      txHash: null;
    }
  | {
      checkedAt: string;
      confirmedAt: null;
      errorMessage?: string;
      quoteId: string;
      status: "failed";
      taskId: string;
      txHash: null;
    };

export function normalizeOneShotStatus(
  quoteId: string,
  status: unknown
): NormalizedOneShotStatus {
  const record =
    status && typeof status === "object" ? (status as Record<string, unknown>) : {};
  const receipt =
    record.receipt && typeof record.receipt === "object" && !Array.isArray(record.receipt)
      ? record.receipt as Record<string, unknown>
      : {};
  const rawStatus =
    typeof record.status === "string"
      ? record.status
      : typeof record.status === "number"
        ? String(record.status)
        : typeof record.state === "string"
          ? record.state
          : "pending";
  const normalized = rawStatus.toLowerCase();
  const taskId =
    typeof record.id === "string"
      ? record.id
      : typeof record.taskId === "string"
        ? record.taskId
        : quoteId;
  const txHash =
    typeof record.txHash === "string"
      ? record.txHash
      : typeof record.transactionHash === "string"
        ? record.transactionHash
        : typeof receipt.transactionHash === "string"
          ? receipt.transactionHash
          : null;
  const checkedAt = new Date().toISOString();

  if (
    normalized === "confirmed" ||
    normalized === "complete" ||
    normalized === "completed" ||
    normalized === "done" ||
    normalized === "executed" ||
    normalized === "finalized" ||
    normalized === "mined" ||
    normalized === "success" ||
    normalized === "succeeded" ||
    normalized === "200"
  ) {
    return {
      checkedAt,
      confirmedAt: checkedAt,
      quoteId,
      status: "confirmed",
      taskId,
      txHash: txHash ?? ""
    };
  }

  if (
    normalized === "failed" ||
    normalized === "rejected" ||
    normalized === "reverted" ||
    normalized === "400" ||
    normalized === "500"
  ) {
    return {
      checkedAt,
      confirmedAt: null,
      errorMessage:
        typeof record.error === "string"
          ? record.error
          : typeof record.message === "string"
            ? record.message
            : `1Shot task ended as ${rawStatus}.`,
      quoteId,
      status: "failed",
      taskId,
      txHash: null
    };
  }

  return {
    checkedAt,
    confirmedAt: null,
    quoteId,
    status: "pending",
    taskId,
    txHash: null
  };
}
