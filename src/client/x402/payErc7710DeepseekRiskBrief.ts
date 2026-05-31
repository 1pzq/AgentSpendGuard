"use client";

import { x402Erc7710Client } from "@metamask/x402";
import { createx402DelegationProvider } from "@metamask/smart-accounts-kit/experimental";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import type {
  Network,
  PaymentPayload,
  PaymentRequired,
  PaymentRequirements
} from "@x402/core/types";
import { getAddress, isAddress, isHex, type Hex } from "viem";
import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC
} from "@/shared/chain";
import type { AdvancedPermissionGrant, AiRiskBrief, ApiResponse } from "@/shared/types";
import { inspectErc7710RedeemerConstraint } from "@/shared/x402/erc7710DelegationInspector";
import { getStoredAdvancedPermissionSessionAccount } from "@/client/permissions/metamaskAdvancedPermissions";

type X402Network = `eip155:${number}`;

type ActiveAdvancedPermissionGrant = AdvancedPermissionGrant & {
  from: string;
};

export type Erc7710PaidPocStage =
  | "requesting_402"
  | "building_delegation_payload"
  | "preflighting_settlement"
  | "submitting_paid_request"
  | "settling";

export type PaidErc7710RiskBriefData = {
  brief: AiRiskBrief;
  paymentReceipt: {
    amountAtomic: string;
    chainId: number;
    paidAt: string;
    payer: string;
    payTo: string;
    requirementId: string;
    status: string;
    token: string;
    txHash: string | null;
  };
  x402: {
    amountAtomic: string;
    asset: string;
    assetTransferMethod: "erc7710";
    network: string;
    payTo: string;
    payer: string;
    requirementId: string;
    txHash: string | null;
  };
};

type PaidErc7710DeepSeekRiskBriefInput = {
  advancedPermissionGrant: AdvancedPermissionGrant | null;
  confirmAfterPreflight?: (result: Erc7710SettlementPreflightResult) => boolean | Promise<boolean>;
  expectedAmountAtomic: string;
  expectedPayTo: string;
  onStage?: (stage: Erc7710PaidPocStage) => void;
  walletAddress: string | null;
};

export type Erc7710SettlementPreflightResult = {
  okToSubmit: boolean;
  simulatedRedeemers: string[];
};

const X402_NETWORK: X402Network = `eip155:${BASE_SEPOLIA_CHAIN_ID}`;
const PAID_POC_ENDPOINT = "/api/x402/deepseek/risk-brief/erc7710-paid-poc";
const PAID_POC_PREFLIGHT_ENDPOINT =
  "/api/x402/deepseek/risk-brief/erc7710-paid-poc/preflight";

class Erc7710PaidPocError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Erc7710PaidPocError";
  }
}

function lowerHex(value: string | null | undefined) {
  return value ? value.toLowerCase() : null;
}

function assertAddress(value: string, label: string): Hex {
  if (!isAddress(value)) {
    throw new Erc7710PaidPocError(`${label} is not a valid EVM address.`);
  }

  return getAddress(value) as Hex;
}

function assertHex(value: string, label: string): Hex {
  if (!isHex(value) || value === "0x") {
    throw new Erc7710PaidPocError(`${label} is not valid non-empty hex data.`);
  }

  return value as Hex;
}

function amountEquals(value: string, expected: string) {
  try {
    return BigInt(value) === BigInt(expected) && BigInt(value) > BigInt(0);
  } catch {
    return false;
  }
}

function assertActiveGrant(
  grant: AdvancedPermissionGrant | null,
  expectedAmountAtomic: string
): ActiveAdvancedPermissionGrant {
  if (!grant) {
    throw new Erc7710PaidPocError(
      "No stored MetaMask Advanced Permission grant is available for the paid ERC-7710 PoC."
    );
  }

  if (grant.source !== "metamask-erc7715") {
    throw new Erc7710PaidPocError("Stored permission is not a MetaMask ERC-7715 grant.");
  }

  if (grant.status !== "granted" || grant.expiry <= Math.floor(Date.now() / 1000)) {
    throw new Erc7710PaidPocError(
      "Stored MetaMask Advanced Permission grant is expired or revoked."
    );
  }

  if (grant.chainId !== BASE_SEPOLIA_CHAIN_ID) {
    throw new Erc7710PaidPocError("Stored grant is not scoped to Base Sepolia.");
  }

  if (!grant.from) {
    throw new Erc7710PaidPocError(
      "Stored grant does not include the delegator address needed for ERC-7710 x402."
    );
  }

  assertAddress(grant.from, "Grant delegator");
  assertAddress(grant.to, "Grant redeemer");
  assertAddress(grant.sessionAccount, "Stored session account");
  assertAddress(grant.delegationManager, "Grant delegation manager");
  assertHex(grant.context, "Grant permission context");

  if (lowerHex(grant.to) !== lowerHex(grant.sessionAccount)) {
    throw new Erc7710PaidPocError(
      "Stored grant redeemer does not match the local session account."
    );
  }

  if (lowerHex(grant.tokenAddress) !== lowerHex(BASE_SEPOLIA_USDC.address)) {
    throw new Erc7710PaidPocError("Stored grant is not scoped to Base Sepolia USDC.");
  }

  if (BigInt(grant.periodAmountAtomic) < BigInt(expectedAmountAtomic)) {
    throw new Erc7710PaidPocError(
      "Stored grant limit is lower than the requested ERC-7710 x402 amount."
    );
  }

  return grant as ActiveAdvancedPermissionGrant;
}

function selectedRequirementFromPayload(
  paymentPayload: PaymentPayload,
  expectedAmountAtomic: string
) {
  const requirement = paymentPayload.accepted;

  if (requirement.extra?.assetTransferMethod !== "erc7710") {
    throw new Erc7710PaidPocError(
      "The selected x402 requirement did not request ERC-7710 payment."
    );
  }

  if (!amountEquals(requirement.amount, expectedAmountAtomic)) {
    throw new Erc7710PaidPocError(
      `The selected x402 requirement was ${requirement.amount} atomic USDC, not the expected ${expectedAmountAtomic}.`
    );
  }

  return requirement;
}

function facilitatorAddressesFromRequirement(requirement: PaymentRequirements) {
  const value = requirement.extra?.facilitatorAddresses;

  if (!Array.isArray(value)) return [];

  return value.filter((item): item is string => typeof item === "string");
}

function permissionContextFromPayload(paymentPayload: PaymentPayload) {
  const permissionContext = paymentPayload.payload.permissionContext;

  if (typeof permissionContext !== "string") {
    throw new Erc7710PaidPocError(
      "The ERC-7710 x402 payload did not include a permission context."
    );
  }

  return assertHex(permissionContext, "Generated permission context");
}

function assertFacilitatorRedeemerConstraint(
  paymentPayload: PaymentPayload,
  requirement: PaymentRequirements
) {
  const facilitatorAddresses = facilitatorAddressesFromRequirement(requirement);
  if (facilitatorAddresses.length === 0) return;

  const permissionContext = permissionContextFromPayload(paymentPayload);
  const inspection = inspectErc7710RedeemerConstraint(
    permissionContext,
    facilitatorAddresses
  );

  if (!inspection.decoded) {
    throw new Erc7710PaidPocError(
      `Generated ERC-7710 x402 permission context could not be decoded for RedeemerEnforcer validation: ${inspection.error ?? "unknown decode error"}.`
    );
  }

  if (!inspection.hasRedeemerEnforcer) {
    throw new Erc7710PaidPocError(
      "Generated ERC-7710 x402 payload is missing the RedeemerEnforcer caveat required by the facilitator addresses."
    );
  }

  if (!inspection.hasAllRequiredRedeemers) {
    throw new Erc7710PaidPocError(
      `Generated ERC-7710 x402 payload is missing facilitator redeemer address(es): ${inspection.missingRequiredRedeemers.join(", ")}.`
    );
  }
}

function addressFromPayload(
  paymentPayload: PaymentPayload,
  field: "delegationManager" | "delegator",
  label: string
) {
  const value = paymentPayload.payload[field];

  if (typeof value !== "string") {
    throw new Erc7710PaidPocError(`The ERC-7710 x402 payload did not include ${label}.`);
  }

  return assertAddress(value, label);
}

function assertPayloadMatchesGrant(
  paymentPayload: PaymentPayload,
  grant: ActiveAdvancedPermissionGrant
) {
  const delegationManager = addressFromPayload(
    paymentPayload,
    "delegationManager",
    "payload delegation manager"
  );
  const delegator = addressFromPayload(paymentPayload, "delegator", "payload delegator");

  if (lowerHex(delegationManager) !== lowerHex(grant.delegationManager)) {
    throw new Erc7710PaidPocError(
      "Generated ERC-7710 x402 payload delegation manager does not match the MetaMask grant."
    );
  }

  if (lowerHex(delegator) !== lowerHex(grant.from)) {
    throw new Erc7710PaidPocError(
      "Generated ERC-7710 x402 payload delegator does not match the MetaMask grant."
    );
  }
}

function createPaidPocHttpClient(input: {
  expectedAmountAtomic: string;
  expectedPayTo: string;
  grant: ActiveAdvancedPermissionGrant;
}) {
  const sessionAccount = getStoredAdvancedPermissionSessionAccount();

  if (lowerHex(sessionAccount.address) !== lowerHex(input.grant.sessionAccount)) {
    throw new Erc7710PaidPocError(
      "Stored session account does not match the Advanced Permission grant."
    );
  }

  const delegationProvider = createx402DelegationProvider({
    account: sessionAccount,
    from: assertAddress(input.grant.to, "Grant redeemer"),
    parentPermissionContext: assertHex(
      input.grant.context,
      "Grant permission context"
    ),
    caveats: [{ type: "limitedCalls", limit: 1 }],
    expirySeconds: (requirement) => requirement.maxTimeoutSeconds
  });
  const client = new x402Client();

  client.register(
    X402_NETWORK as Network,
    new x402Erc7710Client({
      delegationProvider
    })
  );
  client.registerPolicy((_version, requirements) =>
    requirements.filter(
      (requirement) =>
        requirement.scheme === "exact" &&
        requirement.network === X402_NETWORK &&
        requirement.extra?.assetTransferMethod === "erc7710" &&
        lowerHex(requirement.asset) === lowerHex(BASE_SEPOLIA_USDC.address) &&
        lowerHex(requirement.payTo) === lowerHex(input.expectedPayTo) &&
        amountEquals(requirement.amount, input.expectedAmountAtomic)
    )
  );

  return new x402HTTPClient(client);
}

async function parseApiResponse(
  response: Response
): Promise<ApiResponse<PaidErc7710RiskBriefData>> {
  try {
    const json = (await response.json()) as Partial<ApiResponse<PaidErc7710RiskBriefData>>;

    if (json.ok === true && "data" in json) {
      return json as ApiResponse<PaidErc7710RiskBriefData>;
    }

    if (
      json.ok === false &&
      json.error &&
      typeof json.error === "object" &&
      typeof json.error.message === "string"
    ) {
      return json as ApiResponse<PaidErc7710RiskBriefData>;
    }

    return {
      ok: false,
      error: {
        code: "INVALID_RESPONSE",
        message: paymentRequiredError(response) ?? `Protected endpoint returned HTTP ${response.status} without a SpendGuard JSON envelope.`
      }
    };
  } catch {
    return {
      ok: false,
      error: {
        code: "INVALID_RESPONSE",
        message: paymentRequiredError(response) ?? `Protected endpoint returned HTTP ${response.status} without JSON.`
      }
    };
  }
}

function paymentRequiredError(response: Response) {
  if (response.status !== 402) return null;

  const header = response.headers.get("PAYMENT-REQUIRED");
  if (!header) return null;

  try {
    const decoded = JSON.parse(atob(header)) as { error?: unknown };
    return typeof decoded.error === "string"
      ? `x402 payment verification failed: ${decoded.error}`
      : null;
  } catch {
    return null;
  }
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return typeof error === "string" ? error : "Unknown error";
}

function explainErc7710Failure(message: string) {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("facilitator settle failed (504)") ||
    normalized.includes("<!doctype html") ||
    normalized.includes("<html")
  ) {
    return "MetaMask ERC-7710 facilitator settlement returned HTTP 504 before producing a tx hash. No SpendGuard ledger entry was recorded.";
  }

  if (
    normalized.includes("invalid_exact_evm_erc7710_account_no") ||
    normalized.includes("invalid_exact_evm_erc7710_account_not")
  ) {
    return `${message}. The ERC-7710 facilitator rejected the delegator account because it is not executable on Base Sepolia. Enable or deploy the MetaMask smart account / EIP-7702 account, then request a fresh Advanced Permission grant. No SpendGuard ledger entry was recorded.`;
  }

  return message;
}

function readPaymentRequired(
  httpClient: x402HTTPClient,
  response: Response,
  responseBody: ApiResponse<PaidErc7710RiskBriefData>
): PaymentRequired {
  return httpClient.getPaymentRequiredResponse(
    (name) => response.headers.get(name),
    responseBody
  );
}

async function assertSettlementPreflight(
  paymentPayload: PaymentPayload
): Promise<Erc7710SettlementPreflightResult> {
  const response = await fetch(PAID_POC_PREFLIGHT_ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      paymentPayload
    })
  });
  const json = (await response.json()) as ApiResponse<Erc7710SettlementPreflightResult>;

  if (!json.ok) {
    throw new Erc7710PaidPocError(json.error.message);
  }

  if (!json.data.okToSubmit) {
    throw new Erc7710PaidPocError(
      "ERC-7710 local settlement preflight did not approve submission."
    );
  }

  return json.data;
}

export async function payErc7710DeepseekRiskBrief(
  input: PaidErc7710DeepSeekRiskBriefInput
): Promise<PaidErc7710RiskBriefData> {
  const grant = assertActiveGrant(
    input.advancedPermissionGrant,
    input.expectedAmountAtomic
  );
  const httpClient = createPaidPocHttpClient({
    expectedAmountAtomic: input.expectedAmountAtomic,
    expectedPayTo: input.expectedPayTo,
    grant
  });
  const requestInit = {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      walletAddress: input.walletAddress ?? grant.from
    })
  } satisfies RequestInit;

  input.onStage?.("requesting_402");
  const unpaidResponse = await fetch(PAID_POC_ENDPOINT, requestInit);
  const unpaidBody = await parseApiResponse(unpaidResponse);

  if (unpaidResponse.status !== 402) {
    if (!unpaidBody.ok) throw new Error(unpaidBody.error.message);
    return unpaidBody.data;
  }

  const paymentRequired = readPaymentRequired(httpClient, unpaidResponse, unpaidBody);
  let paymentPayload;
  try {
    input.onStage?.("building_delegation_payload");
    paymentPayload = await httpClient.createPaymentPayload(paymentRequired);
    const selectedRequirement = selectedRequirementFromPayload(
      paymentPayload,
      input.expectedAmountAtomic
    );
    assertPayloadMatchesGrant(paymentPayload, grant);
    assertFacilitatorRedeemerConstraint(paymentPayload, selectedRequirement);
  } catch (error) {
    throw new Error(`ERC-7710 x402 payment payload failed: ${errorMessage(error)}`);
  }

  try {
    input.onStage?.("preflighting_settlement");
    const preflight = await assertSettlementPreflight(paymentPayload);
    const shouldSubmit = input.confirmAfterPreflight
      ? await input.confirmAfterPreflight(preflight)
      : true;

    if (!shouldSubmit) {
      throw new Erc7710PaidPocError(
        "Settlement submission cancelled after successful local preflight. No paid request was submitted."
      );
    }
  } catch (error) {
    throw new Error(`ERC-7710 settlement preflight failed: ${errorMessage(error)}`);
  }

  input.onStage?.("submitting_paid_request");
  const paidResponse = await fetch(PAID_POC_ENDPOINT, {
    ...requestInit,
    headers: {
      ...requestInit.headers,
      ...httpClient.encodePaymentSignatureHeader(paymentPayload)
    }
  });
  const json = await parseApiResponse(paidResponse);

  if (paidResponse.status !== 200) {
    const message = json.ok
      ? `Protected endpoint failed with HTTP ${paidResponse.status}.`
      : json.error.message;

    throw new Error(explainErc7710Failure(message));
  }

  try {
    input.onStage?.("settling");
    await httpClient.processPaymentResult(
      paymentPayload,
      (name) => paidResponse.headers.get(name),
      paidResponse.status
    );
  } catch (error) {
    throw new Error(
      `ERC-7710 x402 settlement processing failed: ${explainErc7710Failure(
        errorMessage(error)
      )}`
    );
  }

  if (!json.ok) {
    throw new Error(
      explainErc7710Failure(json.error.message)
    );
  }

  return json.data;
}
