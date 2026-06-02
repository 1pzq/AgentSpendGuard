import { spendguardConfig } from "@/server/config/spendguard";
import type { AtomicAmount, IsoDateTime, TokenSymbol } from "@/shared/types";
import { mockOneShotAdapter } from "./mockOneShotAdapter";
import { normalizeOneShotStatus } from "./oneShotStatus";

export type OneShotQuoteInput = {
  amountAtomic: AtomicAmount;
  chainId: number;
  payTo: string;
  payer: string;
  token: TokenSymbol;
};

export type OneShotQuote = OneShotQuoteInput & {
  quoteId: string;
  fee: string;
  status: "quoted";
  createdAt: IsoDateTime;
};

export type OneShotSubmission = {
  quoteId: string;
  taskId: string;
  status: "submitted";
  submittedAt: IsoDateTime;
};

export type OneShotConfirmedStatus = {
  quoteId: string;
  taskId: string;
  status: "confirmed";
  txHash: string;
  confirmedAt: IsoDateTime;
  checkedAt: IsoDateTime;
};

export type OneShotPendingStatus = {
  quoteId: string;
  taskId: string;
  status: "pending";
  txHash: null;
  confirmedAt: null;
  checkedAt: IsoDateTime;
};

export type OneShotFailedStatus = {
  quoteId: string;
  taskId: string;
  status: "failed";
  txHash: null;
  confirmedAt: null;
  checkedAt: IsoDateTime;
  errorMessage?: string;
};

export type OneShotStatus =
  | OneShotConfirmedStatus
  | OneShotPendingStatus
  | OneShotFailedStatus;

export type OneShotCapabilities = Record<
  string,
  {
    feeCollector?: string;
    targetAddress?: string;
    tokens?: Array<{
      address: string;
      decimals: number | string;
      symbol: string;
    }>;
  }
>;

export type OneShotFeeDataInput = {
  chainId: number | string;
  token: string;
};

export type OneShotFeeData = {
  chainId: string;
  context?: unknown;
  expiry?: number;
  feeCollector?: string;
  gasPrice?: string;
  minFee?: string;
  rate?: number;
  targetAddress?: string;
  token?: {
    address: string;
    decimals: number;
    name?: string;
    symbol: string;
  };
};

export type OneShot7710Execution = {
  data: string;
  target: string;
  value: string;
};

export type OneShot7710Transaction = {
  executions: OneShot7710Execution[];
  permissionContext: unknown[];
};

export type OneShot7710Request = {
  authorizationList?: unknown[];
  chainId: string;
  context?: string;
  destinationUrl?: string;
  memo?: string;
  taskId?: string;
  transactions: OneShot7710Transaction[];
};

export type OneShotEstimate = {
  context?: string;
  error?: string;
  gasUsed?: string | Record<string, string>;
  raw: unknown;
  requiredPaymentAmount?: string;
  success: boolean;
};

export type OneShotAdapter = {
  estimate7710(input: OneShot7710Request): Promise<OneShotEstimate>;
  getCapabilities(chainIds: string[]): Promise<OneShotCapabilities>;
  getFeeData(input: OneShotFeeDataInput): Promise<OneShotFeeData>;
  getStatus(submission: OneShotSubmission): Promise<OneShotStatus>;
  quote(input: OneShotQuoteInput): Promise<OneShotQuote>;
  send7710(input: OneShot7710Request): Promise<OneShotSubmission>;
  submit(quote: OneShotQuote): Promise<OneShotSubmission>;
};

export class OneShotRealCallsDisabledError extends Error {
  constructor(operation: string, reason: string) {
    super(`Refusing real 1Shot ${operation}: ${reason}`);
    this.name = "OneShotRealCallsDisabledError";
  }
}

export class OneShotRpcError extends Error {
  readonly code?: number;
  readonly data?: unknown;

  constructor(method: string, error: JsonRpcFailure["error"]) {
    super(`1Shot ${method} failed: ${error.message ?? "JSON-RPC error"}`);
    this.name = "OneShotRpcError";
    this.code = error.code;
    this.data = error.data;
  }
}

type JsonRpcSuccess<T> = {
  id: number;
  jsonrpc: "2.0";
  result: T;
};

type JsonRpcFailure = {
  error: {
    code?: number;
    data?: unknown;
    message?: string;
  };
  id: number | null;
  jsonrpc: "2.0";
};

function requireRealOneShotConfig(operation: string): {
  baseUrl: string;
} {
  const { oneShot } = spendguardConfig;

  if (oneShot.mode !== "real") {
    throw new OneShotRealCallsDisabledError(
      operation,
      "ONESHOT_MODE must be set to real"
    );
  }

  if (!oneShot.realCallsEnabled) {
    throw new OneShotRealCallsDisabledError(
      operation,
      "ONESHOT_REAL_CALLS_ENABLED must be true"
    );
  }

  if (!oneShot.baseUrl) {
    throw new OneShotRealCallsDisabledError(
      operation,
      "ONESHOT_BASE_URL must be configured server-side"
    );
  }

  return {
    baseUrl: oneShot.baseUrl
  };
}

function isJsonRpcFailure(value: unknown): value is JsonRpcFailure {
  return (
    !!value &&
    typeof value === "object" &&
    "error" in value &&
    !!(value as { error?: unknown }).error
  );
}

async function requestOneShotRpc<T>({
  method,
  operation,
  params
}: {
  method: string;
  operation: string;
  params: unknown;
}): Promise<T> {
  const { baseUrl } = requireRealOneShotConfig(operation);
  const response = await fetch(baseUrl, {
    body: JSON.stringify({
      id: Date.now(),
      jsonrpc: "2.0",
      method,
      params
    }),
    cache: "no-store",
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  });
  const text = await response.text();
  let payload: unknown = null;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`1Shot ${operation} returned non-JSON HTTP ${response.status}.`);
  }

  if (!response.ok) {
    throw new Error(`1Shot ${operation} returned HTTP ${response.status}.`);
  }

  if (isJsonRpcFailure(payload)) {
    throw new OneShotRpcError(method, payload.error);
  }

  return (payload as JsonRpcSuccess<T>).result;
}

export const realOneShotAdapter: OneShotAdapter = {
  async estimate7710(input) {
    const result = await requestOneShotRpc<Record<string, unknown>>({
      method: "relayer_estimate7710Transaction",
      operation: "estimate",
      params: input
    });

    return {
      context: typeof result.context === "string" ? result.context : undefined,
      error: typeof result.error === "string" ? result.error : undefined,
      gasUsed:
        typeof result.gasUsed === "string" ||
        (result.gasUsed &&
          typeof result.gasUsed === "object" &&
          !Array.isArray(result.gasUsed))
          ? result.gasUsed as string | Record<string, string>
          : undefined,
      raw: result,
      requiredPaymentAmount:
        typeof result.requiredPaymentAmount === "string"
          ? result.requiredPaymentAmount
          : undefined,
      success: result.success === true
    };
  },
  async getCapabilities(chainIds) {
    return requestOneShotRpc<OneShotCapabilities>({
      method: "relayer_getCapabilities",
      operation: "capabilities",
      params: chainIds
    });
  },
  async getFeeData(input) {
    return requestOneShotRpc<OneShotFeeData>({
      method: "relayer_getFeeData",
      operation: "fee data",
      params: {
        chainId: String(input.chainId),
        token: input.token
      }
    });
  },
  async getStatus(submission) {
    const result = await requestOneShotRpc<unknown>({
      method: "relayer_getStatus",
      operation: "status",
      params: {
        id: submission.taskId,
        logs: false
      }
    });

    return normalizeOneShotStatus(submission.quoteId, result);
  },
  async quote(input) {
    const feeData = await realOneShotAdapter.getFeeData({
      chainId: input.chainId,
      token: spendguardConfig.token.address
    });
    const fee = feeData.minFee
      ? `${feeData.minFee} ${feeData.token?.symbol ?? input.token}`
      : "quoted";

    return {
      ...input,
      amountAtomic: feeData.minFee ?? input.amountAtomic,
      createdAt: new Date().toISOString(),
      fee,
      payTo: feeData.feeCollector ?? input.payTo,
      quoteId: `${String(input.chainId)}:${feeData.expiry ?? Date.now()}`,
      status: "quoted"
    };
  },
  async send7710(input) {
    const taskId = await requestOneShotRpc<string>({
      method: "relayer_send7710Transaction",
      operation: "send",
      params: input
    });

    return {
      quoteId: input.taskId ?? taskId,
      status: "submitted",
      submittedAt: new Date().toISOString(),
      taskId
    };
  },
  async submit() {
    throw new OneShotRealCallsDisabledError(
      "submit",
      "real submit requires an ERC-7710 request; use send7710"
    );
  }
};

export function getConfiguredOneShotAdapter(): OneShotAdapter {
  return spendguardConfig.oneShot.mode === "real"
    ? realOneShotAdapter
    : mockOneShotAdapter;
}

export const oneShotAdapter = getConfiguredOneShotAdapter();
