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
  const oneShot = createOneShotTimeline({ quote, status });

  return {
    id: spendguardConfig.mockIds.paymentReceiptId,
    requirementId: input.paymentRequirement.id,
    status: "paid",
    amountAtomic: input.paymentRequirement.amountAtomic,
    token: input.paymentRequirement.token,
    chainId: input.paymentRequirement.chainId,
    payer,
    payTo: input.paymentRequirement.payTo,
    txHash: status.txHash,
    paidAt: status.confirmedAt,
    oneShot
  };
}

export const mockPaymentAdapter = {
  payRequirement: payMockRequirement
};
