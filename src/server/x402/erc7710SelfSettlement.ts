import { DelegationManager } from "@metamask/delegation-abis";
import {
  decodeRevertReason,
  encodeExecutionCalldatas
} from "@metamask/smart-accounts-kit/utils";
import type { FacilitatorClient } from "@x402/core/server";
import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  SupportedResponse,
  VerifyResponse
} from "@x402/core/types";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  erc20Abi,
  getAddress,
  http,
  isAddress,
  isHex,
  type Address,
  type Hex
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { spendguardConfig } from "@/server/config/spendguard";
import { BASE_SEPOLIA_PUBLIC_RPC_URL } from "@/shared/chain";

const SINGLE_DEFAULT_MODE =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

type PreflightOk = {
  ok: true;
  redeemer: Address;
};

type PreflightFailure = {
  ok: false;
  redeemer: Address;
  error: string;
};

export type Erc7710SettlementPreflightResult = PreflightOk | PreflightFailure;

type SettlementCache = {
  confirmed: Map<string, SettleResponse>;
  inflight: Map<string, Promise<SettleResponse>>;
};

type SettlementGlobal = typeof globalThis & {
  __spendguardErc7710SettlementCache?: SettlementCache;
};

function settlementGlobal(): SettlementGlobal {
  return globalThis as SettlementGlobal;
}

function getSettlementCache(): SettlementCache {
  const store = settlementGlobal();

  if (!store.__spendguardErc7710SettlementCache) {
    store.__spendguardErc7710SettlementCache = {
      confirmed: new Map(),
      inflight: new Map()
    };
  }

  return store.__spendguardErc7710SettlementCache;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function lowerHex(value: string | null | undefined) {
  return value ? value.toLowerCase() : null;
}

function addressValue(value: unknown, label: string): Address {
  if (typeof value !== "string" || !isAddress(value)) {
    throw new Error(`${label} is not a valid EVM address.`);
  }

  return getAddress(value) as Address;
}

function hexValue(value: unknown, label: string): Hex {
  if (typeof value !== "string" || !isHex(value) || value === "0x") {
    throw new Error(`${label} is not valid non-empty hex data.`);
  }

  return value as Hex;
}

function stringValue(value: unknown, label: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} is missing.`);
  }

  return value;
}

function amountMatches(value: string, expected: string) {
  try {
    return BigInt(value) === BigInt(expected) && BigInt(value) > BigInt(0);
  } catch {
    return false;
  }
}

function getBaseSepoliaTransport() {
  return http(spendguardConfig.chain.rpcUrl ?? BASE_SEPOLIA_PUBLIC_RPC_URL);
}

function getBaseSepoliaPublicClient() {
  return createPublicClient({
    chain: baseSepolia,
    transport: getBaseSepoliaTransport()
  });
}

function privateKeyFromEnv(): Hex {
  const value = process.env.FACILITATOR_PRIVATE_KEY?.trim();

  if (!value || !isHex(value) || value.length !== 66) {
    throw new Error(
      "FACILITATOR_PRIVATE_KEY must be a 32-byte 0x-prefixed private key."
    );
  }

  return value as Hex;
}

function getSelfSettlementAccount() {
  if (!spendguardConfig.erc7710PaidPoc.selfSettle.enabled) {
    throw new Error("ERC-7710 self-settlement is disabled.");
  }

  const account = privateKeyToAccount(privateKeyFromEnv());
  const configured = spendguardConfig.erc7710PaidPoc.selfSettle.facilitatorAddress;

  if (configured && lowerHex(configured) !== lowerHex(account.address)) {
    throw new Error(
      "FACILITATOR_ADDRESS does not match FACILITATOR_PRIVATE_KEY."
    );
  }

  return account;
}

function selfSettlementFacilitatorAddress(): Address {
  const configured = spendguardConfig.erc7710PaidPoc.selfSettle.facilitatorAddress;

  if (!configured) {
    throw new Error("FACILITATOR_ADDRESS is required for ERC-7710 self-settlement.");
  }

  return addressValue(configured, "FACILITATOR_ADDRESS");
}

export function facilitatorAddressesFromPayment(
  paymentPayload: PaymentPayload
): Address[] {
  const acceptedExtra = asRecord(paymentPayload.accepted.extra);
  const fromPayload = Array.isArray(acceptedExtra?.facilitatorAddresses)
    ? acceptedExtra.facilitatorAddresses
    : [];
  const addresses = fromPayload.length > 0
    ? fromPayload
    : spendguardConfig.erc7710PaidPoc.facilitatorAddresses;

  return addresses
    .filter((value): value is string => typeof value === "string")
    .map((value) => addressValue(value, "Facilitator redeemer"));
}

export function assertAcceptedRequirement(paymentPayload: PaymentPayload) {
  const accepted = paymentPayload.accepted;
  const mismatches: string[] = [];

  if (accepted.scheme !== "exact") mismatches.push("scheme");
  if (accepted.network !== spendguardConfig.x402Network) mismatches.push("network");
  if (lowerHex(accepted.asset) !== lowerHex(spendguardConfig.token.address)) {
    mismatches.push("asset");
  }
  if (!amountMatches(accepted.amount, spendguardConfig.erc7710PaidPoc.priceAtomic)) {
    mismatches.push("amount");
  }
  if (lowerHex(accepted.payTo) !== lowerHex(spendguardConfig.x402PayTo)) {
    mismatches.push("payTo");
  }
  if (accepted.extra?.assetTransferMethod !== "erc7710") {
    mismatches.push("assetTransferMethod");
  }

  if (mismatches.length > 0) {
    throw new Error(`ERC-7710 payment requirement mismatch: ${mismatches.join(", ")}.`);
  }
}

function assertSelfFacilitatorSelected(paymentPayload: PaymentPayload) {
  const selfAddress = selfSettlementFacilitatorAddress();
  const selected = facilitatorAddressesFromPayment(paymentPayload);

  if (!selected.some((address) => lowerHex(address) === lowerHex(selfAddress))) {
    throw new Error(
      "ERC-7710 payload is not constrained to the configured self-settlement facilitator."
    );
  }
}

export function assertPayloadAcceptedMatchesRequirements(
  paymentPayload: PaymentPayload,
  paymentRequirements: PaymentRequirements
) {
  const accepted = paymentPayload.accepted;
  const mismatches: string[] = [];

  if (accepted.scheme !== paymentRequirements.scheme) mismatches.push("scheme");
  if (accepted.network !== paymentRequirements.network) mismatches.push("network");
  if (lowerHex(accepted.asset) !== lowerHex(paymentRequirements.asset)) {
    mismatches.push("asset");
  }
  if (accepted.amount !== paymentRequirements.amount) mismatches.push("amount");
  if (lowerHex(accepted.payTo) !== lowerHex(paymentRequirements.payTo)) {
    mismatches.push("payTo");
  }
  if (
    accepted.extra?.assetTransferMethod !==
    paymentRequirements.extra?.assetTransferMethod
  ) {
    mismatches.push("assetTransferMethod");
  }

  if (mismatches.length > 0) {
    throw new Error(
      `ERC-7710 accepted requirement does not match payment requirements: ${mismatches.join(", ")}.`
    );
  }
}

export function extractDelegator(paymentPayload: PaymentPayload): Address | undefined {
  const payload = asRecord(paymentPayload.payload);
  const delegator = payload?.delegator;

  if (typeof delegator !== "string" || !isAddress(delegator)) return undefined;

  return getAddress(delegator) as Address;
}

function settlementIntentKey(paymentPayload: PaymentPayload) {
  const payload = asRecord(paymentPayload.payload);
  const permissionContext = stringValue(
    payload?.permissionContext,
    "Payload permission context"
  );

  return [
    paymentPayload.x402Version,
    paymentPayload.accepted.network,
    paymentPayload.accepted.asset,
    paymentPayload.accepted.payTo,
    paymentPayload.accepted.amount,
    permissionContext
  ].join(":").toLowerCase();
}

export function buildErc7710TransferExecution(paymentPayload: PaymentPayload) {
  assertAcceptedRequirement(paymentPayload);

  const payload = asRecord(paymentPayload.payload);
  const permissionContext = hexValue(
    payload?.permissionContext,
    "Payload permission context"
  );
  const asset = addressValue(paymentPayload.accepted.asset, "Accepted asset");
  const payTo = addressValue(paymentPayload.accepted.payTo, "Accepted payTo");
  const amount = BigInt(stringValue(paymentPayload.accepted.amount, "Accepted amount"));
  const transferCalldata = encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [payTo, amount]
  });

  return {
    execution: {
      target: asset,
      value: "0x0",
      data: transferCalldata
    },
    permissionContext
  };
}

export function buildErc7710RedeemDelegationsCalldata(
  paymentPayload: PaymentPayload
) {
  const payload = asRecord(paymentPayload.payload);
  const delegationManager = addressValue(
    payload?.delegationManager,
    "Payload delegation manager"
  );
  const { execution, permissionContext } =
    buildErc7710TransferExecution(paymentPayload);

  return {
    data: encodeFunctionData({
      abi: DelegationManager,
      functionName: "redeemDelegations",
      args: [
        [permissionContext],
        [SINGLE_DEFAULT_MODE],
        encodeExecutionCalldatas([[
          {
            target: execution.target,
            value: BigInt(execution.value),
            callData: execution.data
          }
        ]])
      ]
    }),
    delegationManager
  };
}

export function erc7710SettlementErrorMessage(error: unknown) {
  const decoded = decodeRevertReason(error);
  if (decoded?.message) return decoded.message;
  if (decoded?.errorName) return decoded.errorName;
  if (error instanceof Error && error.message) return error.message;
  return typeof error === "string" ? error : "Unknown ERC-7710 settlement error";
}

export async function runErc7710SettlementPreflight(
  paymentPayload: PaymentPayload,
  redeemers = facilitatorAddressesFromPayment(paymentPayload)
): Promise<Erc7710SettlementPreflightResult[]> {
  const { data, delegationManager } =
    buildErc7710RedeemDelegationsCalldata(paymentPayload);
  const client = getBaseSepoliaPublicClient();

  return Promise.all(
    redeemers.map(async (redeemer) => {
      try {
        await client.call({
          account: redeemer,
          to: delegationManager,
          data
        });

        return {
          ok: true,
          redeemer
        } satisfies PreflightOk;
      } catch (error) {
        return {
          ok: false,
          redeemer,
          error: erc7710SettlementErrorMessage(error)
        } satisfies PreflightFailure;
      }
    })
  );
}

function failedSettleResponse(input: {
  amount: string;
  error: string;
  network: PaymentRequirements["network"];
  payer?: Address;
  phase: string;
  transaction?: Hex;
}): SettleResponse {
  return {
    success: false,
    amount: input.amount,
    errorMessage: `[${input.phase}] ${input.error}`,
    errorReason: input.error,
    network: input.network,
    payer: input.payer,
    transaction: input.transaction ?? "",
    extra: {
      phase: input.phase
    }
  };
}

export class Erc7710SelfSettlingFacilitatorClient implements FacilitatorClient {
  constructor(private readonly delegate: FacilitatorClient) {}

  async verify(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements
  ): Promise<VerifyResponse> {
    const payer = extractDelegator(paymentPayload);

    try {
      assertPayloadAcceptedMatchesRequirements(paymentPayload, paymentRequirements);
      assertAcceptedRequirement(paymentPayload);
      assertSelfFacilitatorSelected(paymentPayload);

      const selfAddress = selfSettlementFacilitatorAddress();
      const results = await runErc7710SettlementPreflight(paymentPayload, [
        selfAddress
      ]);
      const passing = results.filter((result) => result.ok);

      if (passing.length === 0) {
        return {
          isValid: false,
          invalidMessage:
            results.find((result) => !result.ok)?.error ??
            "ERC-7710 self-settlement simulation failed.",
          invalidReason: "invalid_exact_evm_erc7710_self_settle_simulation_failed",
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
        invalidReason: "invalid_exact_evm_erc7710_self_settle_validate_failed",
        payer,
        extra: {
          phase: "validate"
        }
      };
    }
  }

  async getSupported(): Promise<SupportedResponse> {
    try {
      return await this.delegate.getSupported();
    } catch (error) {
      if (!spendguardConfig.erc7710PaidPoc.selfSettle.enabled) throw error;

      const facilitator = selfSettlementFacilitatorAddress();

      return {
        extensions: [],
        kinds: [
          {
            x402Version: 2,
            scheme: "exact",
            network: spendguardConfig.x402Network,
            extra: {
              assetTransferMethod: "erc7710"
            }
          }
        ],
        signers: {
          [spendguardConfig.x402Network]: [facilitator]
        }
      };
    }
  }

  async settle(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements
  ): Promise<SettleResponse> {
    const cache = getSettlementCache();
    const key = settlementIntentKey(paymentPayload);
    const confirmed = cache.confirmed.get(key);

    if (confirmed) {
      console.info("ERC-7710 self-settlement returning cached receipt.", {
        transaction: confirmed.transaction,
        amount: confirmed.amount,
        network: confirmed.network
      });
      return confirmed;
    }

    const inflight = cache.inflight.get(key);
    if (inflight) return inflight;

    const promise = this.settleFresh(paymentPayload, paymentRequirements);
    cache.inflight.set(key, promise);

    try {
      const result = await promise;
      if (result.success) cache.confirmed.set(key, result);
      return result;
    } finally {
      cache.inflight.delete(key);
    }
  }

  private async settleFresh(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements
  ): Promise<SettleResponse> {
    const payer = extractDelegator(paymentPayload);

    try {
      assertAcceptedRequirement(paymentPayload);
      assertSelfFacilitatorSelected(paymentPayload);
    } catch (error) {
      return failedSettleResponse({
        amount: paymentRequirements.amount,
        error: erc7710SettlementErrorMessage(error),
        network: paymentRequirements.network,
        payer,
        phase: "validate"
      });
    }

    let account: ReturnType<typeof getSelfSettlementAccount>;

    try {
      account = getSelfSettlementAccount();
    } catch (error) {
      return failedSettleResponse({
        amount: paymentRequirements.amount,
        error: erc7710SettlementErrorMessage(error),
        network: paymentRequirements.network,
        payer,
        phase: "validate"
      });
    }

    const { data, delegationManager } =
      buildErc7710RedeemDelegationsCalldata(paymentPayload);
    const publicClient = getBaseSepoliaPublicClient();
    const walletClient = createWalletClient({
      account,
      chain: baseSepolia,
      transport: getBaseSepoliaTransport()
    });

    console.info("ERC-7710 self-settlement preflight starting.", {
      amount: paymentRequirements.amount,
      asset: paymentRequirements.asset,
      facilitator: account.address,
      network: paymentRequirements.network,
      payTo: paymentRequirements.payTo,
      payer
    });

    try {
      await publicClient.call({
        account: account.address,
        to: delegationManager,
        data
      });
    } catch (error) {
      return failedSettleResponse({
        amount: paymentRequirements.amount,
        error: erc7710SettlementErrorMessage(error),
        network: paymentRequirements.network,
        payer,
        phase: "preflight"
      });
    }

    let transaction: Hex;

    try {
      console.info("ERC-7710 self-settlement submitting transaction.", {
        facilitator: account.address,
        to: delegationManager
      });
      transaction = await walletClient.sendTransaction({
        account,
        chain: baseSepolia,
        data,
        to: delegationManager,
        value: BigInt(0)
      });
    } catch (error) {
      return failedSettleResponse({
        amount: paymentRequirements.amount,
        error: erc7710SettlementErrorMessage(error),
        network: paymentRequirements.network,
        payer,
        phase: "submit"
      });
    }

    try {
      console.info("ERC-7710 self-settlement waiting for receipt.", {
        transaction
      });
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: transaction,
        pollingInterval:
          spendguardConfig.erc7710PaidPoc.selfSettle.receiptPollingMs,
        timeout: spendguardConfig.erc7710PaidPoc.selfSettle.receiptTimeoutMs
      });

      if (receipt.status !== "success") {
        return failedSettleResponse({
          amount: paymentRequirements.amount,
          error: `Settlement transaction receipt status was ${receipt.status}.`,
          network: paymentRequirements.network,
          payer,
          phase: "receipt",
          transaction
        });
      }

      console.info("ERC-7710 self-settlement receipt confirmed.", {
        blockNumber: receipt.blockNumber.toString(),
        gasUsed: receipt.gasUsed.toString(),
        transaction
      });

      return {
        success: true,
        amount: paymentRequirements.amount,
        network: paymentRequirements.network,
        payer,
        transaction,
        extra: {
          blockNumber: receipt.blockNumber.toString(),
          facilitator: account.address,
          gasUsed: receipt.gasUsed.toString(),
          phase: "confirmed",
          status: receipt.status
        }
      };
    } catch (error) {
      return failedSettleResponse({
        amount: paymentRequirements.amount,
        error: erc7710SettlementErrorMessage(error),
        network: paymentRequirements.network,
        payer,
        phase: "receipt",
        transaction
      });
    }
  }
}
