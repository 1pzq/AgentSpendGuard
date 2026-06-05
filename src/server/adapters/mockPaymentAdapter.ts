import { spendguardConfig } from "@/server/config/spendguard";
import type { PayRequirementInput } from "@/server/agent-runner/runAgentWithPermission";
import type { OneShotPaymentTimeline, PaymentReceipt } from "@/shared/types";
import {
  createOneShotTimeline,
  getOneShotPaymentStatus,
  quoteOneShotPayment,
  submitOneShotPayment
} from "./mockOneShotAdapter";

export type MockPaymentReceipt = PaymentReceipt & {
  oneShot: OneShotPaymentTimeline;
};

function resolvePayer({
  permission
}: Pick<PayRequirementInput, "permission">): string {
  return (
    permission.wallet.smartAccount ??
    permission.wallet.eoa ??
    spendguardConfig.mockIds.smartAccount
  );
}

function uniqueMockTxHash() {
  const entropy = `${Date.now().toString(16)}${Math.floor(
    Math.random() * Number.MAX_SAFE_INTEGER
  ).toString(16)}`;

  return `0x${entropy.padStart(64, "0").slice(-64)}`;
}

export async function payMockRequirement(
  input: PayRequirementInput
): Promise<MockPaymentReceipt> {
  const payer = resolvePayer(input);
  const quote = await quoteOneShotPayment({
    amountAtomic: input.paymentRequirement.amountAtomic,
    chainId: input.paymentRequirement.chainId,
    payer,
    payTo: input.paymentRequirement.payTo,
    token: input.paymentRequirement.token
  });
  const submission = await submitOneShotPayment(quote);
  const status = await getOneShotPaymentStatus(submission);
  const txHash = uniqueMockTxHash();
  const oneShot = {
    ...createOneShotTimeline({ quote, status }),
    txHash
  };

  return {
    id: `${spendguardConfig.mockIds.paymentReceiptId}-${Date.now().toString(16)}`,
    requirementId: input.paymentRequirement.id,
    status: "paid",
    amountAtomic: input.paymentRequirement.amountAtomic,
    token: input.paymentRequirement.token,
    chainId: input.paymentRequirement.chainId,
    payer,
    payTo: input.paymentRequirement.payTo,
    txHash,
    paidAt: status.confirmedAt,
    oneShot
  };
}

export const mockPaymentAdapter = {
  payRequirement: payMockRequirement
};
