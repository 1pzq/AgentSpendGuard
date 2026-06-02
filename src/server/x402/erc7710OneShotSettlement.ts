import type { FacilitatorClient } from "@x402/core/server";
import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  SupportedResponse,
  VerifyResponse
} from "@x402/core/types";
import { decodeDelegations } from "@metamask/smart-accounts-kit/utils";
import {
  encodeFunctionData,
  erc20Abi,
  getAddress,
  isAddress,
  keccak256,
  parseUnits,
  type Address,
  type Hex
} from "viem";
import { spendguardConfig } from "@/server/config/spendguard";
import {
  oneShotAdapter,
  type OneShotFeeData,
  type OneShot7710Request,
  type OneShot7710Execution,
  type OneShotStatus
} from "@/server/adapters/oneShotAdapter";
import {
  assertAcceptedRequirement,
  assertPayloadAcceptedMatchesRequirements,
  buildErc7710TransferExecution,
  erc7710SettlementErrorMessage,
  extractDelegator,
  facilitatorAddressesFromPayment,
  runErc7710SettlementPreflight
} from "@/server/x402/erc7710SelfSettlement";

type OneShotSettlementExtra = {
  estimate?: {
    relayerFeeAmount?: string;
    relayerFeeCollector?: string;
    gasUsed?: string | Record<string, string>;
    requiredPaymentAmount?: string;
  };
  oneShot?: {
    estimate?: {
      relayerFeeAmount?: string;
      relayerFeeCollector?: string;
      gasUsed?: string | Record<string, string>;
      requiredPaymentAmount?: string;
    };
    quoteId: string;
    status: "submitted" | "pending" | "confirmed" | "failed";
    taskId: string;
    txHash: string | null;
  };
  phase: string;
};

function lowerHex(value: string | null | undefined) {
  return value ? value.toLowerCase() : null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function failedSettleResponse(input: {
  amount: string;
  error: string;
  extra?: OneShotSettlementExtra;
  network: PaymentRequirements["network"];
  payer?: Address;
  phase: string;
  transaction?: Hex;
}): SettleResponse {
  return {
    success: false,
    amount: input.amount,
    errorMessage: `[1shot:${input.phase}] ${input.error}`,
    errorReason: input.error,
    network: input.network,
    payer: input.payer,
    transaction: input.transaction ?? "",
    extra: input.extra ?? {
      phase: input.phase
    }
  };
}

function oneShotTargetAddress(): Address {
  const targetAddress = spendguardConfig.oneShot.targetAddress;

  if (!targetAddress) {
    throw new Error(
      "ONESHOT_TARGET_ADDRESS is required for ERC-7710 1Shot settlement."
    );
  }

  return targetAddress as Address;
}

function oneShotFeeCollectorAddress(feeData?: OneShotFeeData): Address {
  const feeCollector =
    feeData?.feeCollector ?? spendguardConfig.oneShot.feeCollector;

  if (!feeCollector || !isAddress(feeCollector)) {
    throw new Error(
      "ONESHOT_FEE_COLLECTOR or relayer_getFeeData.feeCollector is required for ERC-7710 1Shot fee payment."
    );
  }

  return getAddress(feeCollector) as Address;
}

function positiveAtomicAmount(value: string | null | undefined, label: string) {
  if (!value || !/^\d+$/.test(value) || BigInt(value) <= BigInt(0)) {
    throw new Error(`${label} must be a positive integer atomic token amount.`);
  }

  return value;
}

function minFeeAtomicAmount(feeData: OneShotFeeData) {
  const minFee = feeData.minFee ?? "0";

  if (/^\d+\.\d+$/.test(minFee)) {
    return parseUnits(minFee, spendguardConfig.token.decimals).toString();
  }

  if (/^\d+$/.test(minFee)) {
    return parseUnits(minFee, spendguardConfig.token.decimals).toString();
  }

  throw new Error("1Shot relayer_getFeeData.minFee is not a valid token amount.");
}

function initialRelayerFeeAtomic(feeData: OneShotFeeData) {
  const minFee = BigInt(minFeeAtomicAmount(feeData));

  return (minFee > BigInt(0) ? minFee : BigInt(1)).toString();
}

function assertFeeTokenMatchesAcceptedPayment(
  paymentPayload: PaymentPayload,
  feeData: OneShotFeeData
) {
  const feeToken = feeData.token?.address;

  if (feeToken && lowerHex(feeToken) !== lowerHex(paymentPayload.accepted.asset)) {
    throw new Error(
      "1Shot fee token does not match the ERC-7710 x402 accepted asset."
    );
  }
}

function assertOneShotRedeemerSelected(paymentPayload: PaymentPayload) {
  const targetAddress = oneShotTargetAddress();
  const selected = facilitatorAddressesFromPayment(paymentPayload);

  if (!selected.some((address) => lowerHex(address) === lowerHex(targetAddress))) {
    throw new Error(
      "ERC-7710 payload is not constrained to the configured 1Shot relayer target address."
    );
  }
}

function oneShotTaskId(paymentPayload: PaymentPayload) {
  const payload = paymentPayload.payload as { permissionContext?: unknown };
  const permissionContext =
    typeof payload.permissionContext === "string" ? payload.permissionContext : null;

  if (permissionContext?.startsWith("0x")) {
    return keccak256(permissionContext as Hex);
  }

  return undefined;
}

function buildOneShot7710Request(
  paymentPayload: PaymentPayload,
  input: {
    context?: unknown;
    relayerFeeAmountAtomic: string;
    relayerFeeCollector: Address;
  }
): OneShot7710Request {
  const { execution, permissionContext } =
    buildErc7710TransferExecution(paymentPayload);
  const relayerFeeExecution: OneShot7710Execution = {
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [
        input.relayerFeeCollector,
        BigInt(positiveAtomicAmount(input.relayerFeeAmountAtomic, "1Shot relayer fee"))
      ]
    }),
    target: execution.target,
    value: "0x0"
  };

  return {
    chainId: String(spendguardConfig.chain.id),
    context: typeof input.context === "string" ? input.context : undefined,
    memo: "AgentSpendGuard ERC-7710 x402 payment relay",
    taskId: oneShotTaskId(paymentPayload),
    transactions: [
      {
        executions: [
          {
            data: execution.data,
            target: execution.target,
            value: execution.value
          },
          relayerFeeExecution
        ],
        permissionContext: decodeDelegations(permissionContext)
      }
    ]
  };
}

function estimateFailureResponse(input: {
  amount: string;
  estimate: {
    error?: string;
    gasUsed?: string | Record<string, string>;
    requiredPaymentAmount?: string;
  };
  network: PaymentRequirements["network"];
  payer?: Address;
  relayerFeeAmountAtomic: string;
  relayerFeeCollector: Address;
}) {
  return failedSettleResponse({
    amount: input.amount,
    error:
      input.estimate.error ??
      "1Shot estimate did not accept the ERC-7710 relay request.",
    extra: {
      estimate: {
        gasUsed: input.estimate.gasUsed,
        relayerFeeAmount: input.relayerFeeAmountAtomic,
        relayerFeeCollector: input.relayerFeeCollector,
        requiredPaymentAmount: input.estimate.requiredPaymentAmount
      },
      phase: "estimate"
    },
    network: input.network,
    payer: input.payer,
    phase: "estimate"
  });
}

function supportedResponse(): SupportedResponse {
  const targetAddress = oneShotTargetAddress();

  return {
    extensions: [],
    kinds: [
      {
        x402Version: 2,
        scheme: "exact",
        network: spendguardConfig.x402Network,
        extra: {
          assetTransferMethod: "erc7710",
          facilitatorAddresses: [targetAddress]
        }
      }
    ],
    signers: {
      [spendguardConfig.x402Network]: [targetAddress]
    }
  };
}

export class Erc7710OneShotSettlingFacilitatorClient implements FacilitatorClient {
  async verify(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements
  ): Promise<VerifyResponse> {
    const payer = extractDelegator(paymentPayload);

    try {
      assertPayloadAcceptedMatchesRequirements(paymentPayload, paymentRequirements);
      assertAcceptedRequirement(paymentPayload);
      assertOneShotRedeemerSelected(paymentPayload);

      const targetAddress = oneShotTargetAddress();
      const results = await runErc7710SettlementPreflight(paymentPayload, [
        targetAddress
      ]);
      const passing = results.filter((result) => result.ok);

      if (passing.length === 0) {
        return {
          isValid: false,
          invalidMessage:
            results.find((result) => !result.ok)?.error ??
            "ERC-7710 1Shot settlement simulation failed.",
          invalidReason: "invalid_exact_evm_erc7710_1shot_simulation_failed",
          payer,
          extra: {
            phase: "preflight",
            results
          }
        };
      }

      return {
        isValid: true,
        payer,
        extra: {
          phase: "verified",
          simulatedRedeemers: passing.map((result) => result.redeemer)
        }
      };
    } catch (error) {
      return {
        isValid: false,
        invalidMessage: erc7710SettlementErrorMessage(error),
        invalidReason: "invalid_exact_evm_erc7710_1shot_validate_failed",
        payer,
        extra: {
          phase: "validate"
        }
      };
    }
  }

  async getSupported(): Promise<SupportedResponse> {
    return supportedResponse();
  }

  async settle(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements
  ): Promise<SettleResponse> {
    const payer = extractDelegator(paymentPayload);

    try {
      assertAcceptedRequirement(paymentPayload);
      assertOneShotRedeemerSelected(paymentPayload);
    } catch (error) {
      return failedSettleResponse({
        amount: paymentRequirements.amount,
        error: erc7710SettlementErrorMessage(error),
        network: paymentRequirements.network,
        payer,
        phase: "validate"
      });
    }

    let estimate;
    let relayerFeeCollector: Address;
    let relayerFeeAmountAtomic: string;

    try {
      const feeData = await oneShotAdapter.getFeeData({
        chainId: spendguardConfig.chain.id,
        token: spendguardConfig.token.address
      });

      assertFeeTokenMatchesAcceptedPayment(paymentPayload, feeData);
      relayerFeeCollector = oneShotFeeCollectorAddress(feeData);
      relayerFeeAmountAtomic = initialRelayerFeeAtomic(feeData);
    } catch (error) {
      return failedSettleResponse({
        amount: paymentRequirements.amount,
        error: erc7710SettlementErrorMessage(error),
        network: paymentRequirements.network,
        payer,
        phase: "fee_quote"
      });
    }

    try {
      estimate = await oneShotAdapter.estimate7710(
        buildOneShot7710Request(paymentPayload, {
          relayerFeeAmountAtomic,
          relayerFeeCollector
        })
      );
    } catch (error) {
      return failedSettleResponse({
        amount: paymentRequirements.amount,
        error: erc7710SettlementErrorMessage(error),
        network: paymentRequirements.network,
        payer,
        phase: "estimate"
      });
    }

    if (!estimate.success) {
      return estimateFailureResponse({
        amount: paymentRequirements.amount,
        network: paymentRequirements.network,
        payer,
        estimate,
        relayerFeeAmountAtomic,
        relayerFeeCollector
      });
    }

    if (estimate.requiredPaymentAmount) {
      const requiredPaymentAmount = positiveAtomicAmount(
        estimate.requiredPaymentAmount,
        "1Shot estimate.requiredPaymentAmount"
      );

      if (requiredPaymentAmount !== relayerFeeAmountAtomic) {
        relayerFeeAmountAtomic = requiredPaymentAmount;

        try {
          estimate = await oneShotAdapter.estimate7710(
            buildOneShot7710Request(paymentPayload, {
              relayerFeeAmountAtomic,
              relayerFeeCollector
            })
          );
        } catch (error) {
          return failedSettleResponse({
            amount: paymentRequirements.amount,
            error: erc7710SettlementErrorMessage(error),
            network: paymentRequirements.network,
            payer,
            phase: "estimate"
          });
        }

        if (!estimate.success) {
          return estimateFailureResponse({
            amount: paymentRequirements.amount,
            network: paymentRequirements.network,
            payer,
            estimate,
            relayerFeeAmountAtomic,
            relayerFeeCollector
          });
        }
      }
    }

    const request = buildOneShot7710Request(paymentPayload, {
      context: estimate.context,
      relayerFeeAmountAtomic,
      relayerFeeCollector
    });
    let submission;

    try {
      submission = await oneShotAdapter.send7710(request);
    } catch (error) {
      return failedSettleResponse({
        amount: paymentRequirements.amount,
        error: erc7710SettlementErrorMessage(error),
        extra: {
          estimate: {
            gasUsed: estimate.gasUsed,
            relayerFeeAmount: relayerFeeAmountAtomic,
            relayerFeeCollector,
            requiredPaymentAmount: estimate.requiredPaymentAmount
          },
          phase: "send"
        },
        network: paymentRequirements.network,
        payer,
        phase: "send"
      });
    }

    let latestStatus: {
      quoteId: string;
      status: "submitted" | OneShotStatus["status"];
      taskId: string;
      txHash: string | null;
    } = {
      quoteId: submission.quoteId,
      status: submission.status,
      taskId: submission.taskId,
      txHash: null
    };

    for (let attempt = 0; attempt < spendguardConfig.oneShot.statusMaxPolls; attempt += 1) {
      if (attempt > 0) await sleep(spendguardConfig.oneShot.statusPollMs);

      try {
        const status = await oneShotAdapter.getStatus(submission);
        latestStatus = status;

        if (status.status === "confirmed") {
          return {
            success: true,
            amount: paymentRequirements.amount,
            network: paymentRequirements.network,
            payer,
            transaction: status.txHash as Hex,
            extra: {
              phase: "confirmed",
              oneShot: {
                estimate: {
                  gasUsed: estimate.gasUsed,
                  relayerFeeAmount: relayerFeeAmountAtomic,
                  relayerFeeCollector,
                  requiredPaymentAmount: estimate.requiredPaymentAmount
                },
                quoteId: status.quoteId,
                status: status.status,
                taskId: status.taskId,
                txHash: status.txHash
              }
            }
          };
        }

        if (status.status === "failed") {
          return failedSettleResponse({
            amount: paymentRequirements.amount,
            error: status.errorMessage ?? "1Shot task failed.",
            extra: {
              estimate: {
                gasUsed: estimate.gasUsed,
                relayerFeeAmount: relayerFeeAmountAtomic,
                relayerFeeCollector,
                requiredPaymentAmount: estimate.requiredPaymentAmount
              },
              phase: "status",
              oneShot: {
                quoteId: status.quoteId,
                status: status.status,
                taskId: status.taskId,
                txHash: null
              }
            },
            network: paymentRequirements.network,
            payer,
            phase: "status"
          });
        }
      } catch (error) {
        return failedSettleResponse({
          amount: paymentRequirements.amount,
          error: erc7710SettlementErrorMessage(error),
          extra: {
            estimate: {
              gasUsed: estimate.gasUsed,
              relayerFeeAmount: relayerFeeAmountAtomic,
              relayerFeeCollector,
              requiredPaymentAmount: estimate.requiredPaymentAmount
            },
            phase: "status",
            oneShot: {
              quoteId: submission.quoteId,
              status: "pending",
              taskId: submission.taskId,
              txHash: null
            }
          },
          network: paymentRequirements.network,
          payer,
          phase: "status"
        });
      }
    }

    return failedSettleResponse({
      amount: paymentRequirements.amount,
      error: `1Shot task did not confirm after ${spendguardConfig.oneShot.statusMaxPolls} bounded status check(s).`,
      extra: {
        estimate: {
          gasUsed: estimate.gasUsed,
          relayerFeeAmount: relayerFeeAmountAtomic,
          relayerFeeCollector,
          requiredPaymentAmount: estimate.requiredPaymentAmount
        },
        phase: "status_pending",
        oneShot: latestStatus
      },
      network: paymentRequirements.network,
      payer,
      phase: "status_pending"
    });
  }
}
