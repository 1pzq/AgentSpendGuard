import { spendguardConfig } from "@/server/config/spendguard";
import type {
  AtomicAmount,
  IsoDateTime,
  OneShotPaymentTimeline,
  TokenSymbol
} from "@/shared/types";

export const MOCK_ONESHOT_FEE = "0.0021 ETH sponsored";

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

export type OneShotStatus = {
  quoteId: string;
  taskId: string;
  status: "confirmed";
  txHash: string;
  confirmedAt: IsoDateTime;
};

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

export async function getOneShotPaymentStatus(
  submission: OneShotSubmission
): Promise<OneShotStatus> {
  return {
    quoteId: submission.quoteId,
    taskId: submission.taskId,
    status: "confirmed",
    txHash: spendguardConfig.mockIds.txHash,
    confirmedAt: nowIso()
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
    txHash: status.txHash
  };
}

export const mockOneShotAdapter = {
  getStatus: getOneShotPaymentStatus,
  quote: quoteOneShotPayment,
  submit: submitOneShotPayment
};
