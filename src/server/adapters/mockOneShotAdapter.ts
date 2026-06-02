import { spendguardConfig } from "@/server/config/spendguard";
import type {
  OneShotAdapter,
  OneShotCapabilities,
  OneShotConfirmedStatus,
  OneShotEstimate,
  OneShotFeeData,
  OneShotFeeDataInput,
  OneShot7710Request,
  OneShotQuote,
  OneShotQuoteInput,
  OneShotStatus,
  OneShotSubmission
} from "@/server/adapters/oneShotAdapter";
import type {
  IsoDateTime,
  OneShotPaymentTimeline
} from "@/shared/types";

export const MOCK_ONESHOT_FEE = "0.0021 ETH sponsored";

function nowIso(): IsoDateTime {
  return new Date().toISOString();
}

export async function quoteOneShotPayment(
  input: OneShotQuoteInput
): Promise<OneShotQuote> {
  return {
    ...input,
    quoteId: spendguardConfig.mockIds.quoteId,
    fee: MOCK_ONESHOT_FEE,
    status: "quoted",
    createdAt: nowIso()
  };
}

export async function getMockOneShotCapabilities(
  chainIds: string[]
): Promise<OneShotCapabilities> {
  return Object.fromEntries(
    chainIds.map((chainId) => [
      chainId,
      {
        feeCollector: spendguardConfig.x402PayTo,
        targetAddress: spendguardConfig.x402PayTo,
        tokens: [
          {
            address: spendguardConfig.token.address,
            decimals: spendguardConfig.token.decimals,
            symbol: spendguardConfig.token.symbol
          }
        ]
      }
    ])
  );
}

export async function getMockOneShotFeeData({
  chainId,
  token
}: OneShotFeeDataInput): Promise<OneShotFeeData> {
  return {
    chainId: String(chainId),
    context: {
      mode: "mock"
    },
    expiry: Math.floor(Date.now() / 1000) + 300,
    feeCollector: spendguardConfig.x402PayTo,
    minFee: "0",
    targetAddress: spendguardConfig.x402PayTo,
    token: {
      address: token,
      decimals: spendguardConfig.token.decimals,
      symbol: spendguardConfig.token.symbol
    }
  };
}

export async function estimateMockOneShot7710(
  input: OneShot7710Request
): Promise<OneShotEstimate> {
  return {
    context: `mock:${input.transactions.length}`,
    gasUsed: "0",
    raw: {
      chainId: String(input.chainId),
      mode: "mock"
    },
    requiredPaymentAmount: "0",
    success: true
  };
}

export async function submitOneShotPayment(
  quote: OneShotQuote
): Promise<OneShotSubmission> {
  return {
    quoteId: quote.quoteId,
    taskId: spendguardConfig.mockIds.relayerTaskId,
    status: "submitted",
    submittedAt: nowIso()
  };
}

export async function sendMockOneShot7710(
  input: OneShot7710Request
): Promise<OneShotSubmission> {
  return {
    quoteId: input.taskId ?? spendguardConfig.mockIds.quoteId,
    taskId: spendguardConfig.mockIds.relayerTaskId,
    status: "submitted",
    submittedAt: nowIso()
  };
}

export async function getOneShotPaymentStatus(
  submission: OneShotSubmission
): Promise<OneShotConfirmedStatus> {
  const checkedAt = nowIso();

  return {
    quoteId: submission.quoteId,
    taskId: submission.taskId,
    status: "confirmed",
    txHash: spendguardConfig.mockIds.txHash,
    confirmedAt: checkedAt,
    checkedAt
  };
}

export function createOneShotTimeline({
  quote,
  status
}: {
  quote: OneShotQuote;
  status: OneShotStatus;
}): OneShotPaymentTimeline {
  return {
    quoteId: quote.quoteId,
    fee: quote.fee,
    taskId: status.taskId,
    status: status.status,
    txHash: status.txHash ?? ""
  };
}

export const mockOneShotAdapter = {
  estimate7710: estimateMockOneShot7710,
  getCapabilities: getMockOneShotCapabilities,
  getFeeData: getMockOneShotFeeData,
  getStatus: getOneShotPaymentStatus,
  quote: quoteOneShotPayment,
  send7710: sendMockOneShot7710,
  submit: submitOneShotPayment
} satisfies OneShotAdapter;
