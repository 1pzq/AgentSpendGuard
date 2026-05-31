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
import { getAddress, isAddress, isHex, keccak256, size, type Hex } from "viem";
import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC
} from "@/shared/chain";
import type { AdvancedPermissionGrant } from "@/shared/types";
import { getStoredAdvancedPermissionSessionAccount } from "@/client/permissions/metamaskAdvancedPermissions";

type X402Network = `eip155:${number}`;

type DryRunInput = {
  advancedPermissionGrant: AdvancedPermissionGrant | null;
  expectedPayTo: string;
  maxAmountAtomic: string;
  walletAddress: string | null;
};

type ActiveAdvancedPermissionGrant = AdvancedPermissionGrant & {
  from: string;
};

type SanitizedRequirement = {
  x402Version: number;
  scheme: string;
  network: string;
  asset: string;
  amountAtomic: string;
  payTo: string;
  maxTimeoutSeconds: number;
  assetTransferMethod: "erc7710";
  facilitatorAddresses: string[];
  resourceUrl: string | null;
  description: string | null;
};

export type Erc7710DryRunPreview = {
  createdAt: string;
  endpoint: string;
  method: "POST";
  requirement: SanitizedRequirement;
  grant: {
    delegator: string;
    sessionAccount: string;
    delegationManager: string;
    parentPermissionContextHash: string;
    parentPermissionContextBytes: number;
    tokenAddress: string;
    tokenLimitAtomic: string;
    expiresAt: string;
  };
  payload: {
    x402Version: number;
    accepted: SanitizedRequirement;
    delegationManager: string;
    delegator: string;
    permissionContextHash: string;
    permissionContextBytes: number;
  };
  safeguards: {
    fetched402Only: true;
    paidRequestSubmitted: false;
    paymentSignatureHeaderSubmitted: false;
    walletRequestExecutionPermissionsCalled: false;
    ethSendTransactionCalled: false;
    rawPermissionContextReturned: false;
  };
};

const X402_NETWORK: X402Network = `eip155:${BASE_SEPOLIA_CHAIN_ID}`;
const DRY_RUN_ENDPOINT = "/api/x402/deepseek/risk-brief/dry-run";

class Erc7710DryRunError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Erc7710DryRunError";
  }
}

function lowerHex(value: string | null | undefined) {
  return value ? value.toLowerCase() : null;
}

function assertAddress(value: string, label: string): Hex {
  if (!isAddress(value)) {
    throw new Erc7710DryRunError(`${label} is not a valid EVM address.`);
  }

  return getAddress(value) as Hex;
}

function assertHex(value: string, label: string): Hex {
  if (!isHex(value) || value === "0x") {
    throw new Erc7710DryRunError(`${label} is not valid non-empty hex data.`);
  }

  return value as Hex;
}

function assertActiveGrant(
  grant: AdvancedPermissionGrant | null
): ActiveAdvancedPermissionGrant {
  if (!grant) {
    throw new Erc7710DryRunError(
      "No stored MetaMask Advanced Permission grant is available for the dry run."
    );
  }

  if (grant.source !== "metamask-erc7715") {
    throw new Erc7710DryRunError("Stored permission is not a MetaMask ERC-7715 grant.");
  }

  if (grant.status !== "granted" || grant.expiry <= Math.floor(Date.now() / 1000)) {
    throw new Erc7710DryRunError(
      "Stored MetaMask Advanced Permission grant is expired or revoked."
    );
  }

  if (grant.chainId !== BASE_SEPOLIA_CHAIN_ID) {
    throw new Erc7710DryRunError("Stored grant is not scoped to Base Sepolia.");
  }

  if (!grant.from) {
    throw new Erc7710DryRunError(
      "Stored grant does not include the delegator address needed for ERC-7710 x402."
    );
  }

  assertAddress(grant.from, "Grant delegator");
  assertAddress(grant.to, "Grant redeemer");
  assertAddress(grant.sessionAccount, "Stored session account");
  assertAddress(grant.delegationManager, "Grant delegation manager");
  assertHex(grant.context, "Grant permission context");

  if (lowerHex(grant.to) !== lowerHex(grant.sessionAccount)) {
    throw new Erc7710DryRunError(
      "Stored grant redeemer does not match the local session account."
    );
  }

  if (lowerHex(grant.tokenAddress) !== lowerHex(BASE_SEPOLIA_USDC.address)) {
    throw new Erc7710DryRunError("Stored grant is not scoped to Base Sepolia USDC.");
  }

  return grant as ActiveAdvancedPermissionGrant;
}

function paymentAmountAllowed(amount: string, maxAmountAtomic: string) {
  try {
    return BigInt(amount) > BigInt(0) && BigInt(amount) <= BigInt(maxAmountAtomic);
  } catch {
    return false;
  }
}

function facilitatorAddresses(requirement: PaymentRequirements) {
  const value = requirement.extra?.facilitatorAddresses;
  if (!Array.isArray(value)) return [];

  return value.filter((item): item is string => typeof item === "string" && isAddress(item));
}

function sanitizeRequirement(
  x402Version: number,
  requirement: PaymentRequirements,
  paymentRequired: PaymentRequired
): SanitizedRequirement {
  return {
    x402Version,
    scheme: requirement.scheme,
    network: requirement.network,
    asset: requirement.asset,
    amountAtomic: requirement.amount,
    payTo: requirement.payTo,
    maxTimeoutSeconds: requirement.maxTimeoutSeconds,
    assetTransferMethod: "erc7710",
    facilitatorAddresses: facilitatorAddresses(requirement),
    resourceUrl: paymentRequired.resource?.url ?? null,
    description: paymentRequired.resource?.description ?? null
  };
}

function selectedRequirementFromPayload(paymentPayload: PaymentPayload) {
  const requirement = paymentPayload.accepted;

  if (requirement.extra?.assetTransferMethod !== "erc7710") {
    throw new Erc7710DryRunError(
      "The selected x402 requirement did not request ERC-7710 payment."
    );
  }

  return requirement;
}

function permissionContextFromPayload(paymentPayload: PaymentPayload) {
  const permissionContext = paymentPayload.payload.permissionContext;
  if (typeof permissionContext !== "string") {
    throw new Erc7710DryRunError(
      "The ERC-7710 x402 payload did not include a permission context."
    );
  }

  return assertHex(permissionContext, "Generated permission context");
}

function addressFromPayload(
  paymentPayload: PaymentPayload,
  field: "delegationManager" | "delegator",
  label: string
) {
  const value = paymentPayload.payload[field];

  if (typeof value !== "string") {
    throw new Erc7710DryRunError(`The ERC-7710 x402 payload did not include ${label}.`);
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
    throw new Erc7710DryRunError(
      "Generated ERC-7710 x402 payload delegation manager does not match the MetaMask grant."
    );
  }

  if (lowerHex(delegator) !== lowerHex(grant.from)) {
    throw new Erc7710DryRunError(
      "Generated ERC-7710 x402 payload delegator does not match the MetaMask grant."
    );
  }

  return {
    delegationManager,
    delegator
  };
}

function createDryRunHttpClient(input: {
  grant: ActiveAdvancedPermissionGrant;
  maxAmountAtomic: string;
  expectedPayTo: string;
}) {
  const sessionAccount = getStoredAdvancedPermissionSessionAccount();

  if (lowerHex(sessionAccount.address) !== lowerHex(input.grant.sessionAccount)) {
    throw new Erc7710DryRunError(
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
        paymentAmountAllowed(requirement.amount, input.maxAmountAtomic)
    )
  );

  return new x402HTTPClient(client);
}

async function parseUnknownJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

export async function dryRunErc7710Payment(
  input: DryRunInput
): Promise<Erc7710DryRunPreview> {
  const grant = assertActiveGrant(input.advancedPermissionGrant);
  const parentPermissionContext = assertHex(
    grant.context,
    "Grant permission context"
  );
  const httpClient = createDryRunHttpClient({
    expectedPayTo: input.expectedPayTo,
    grant,
    maxAmountAtomic: input.maxAmountAtomic
  });
  const response = await fetch(DRY_RUN_ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      walletAddress: input.walletAddress ?? grant.from
    })
  });
  const responseBody = await parseUnknownJson(response);

  if (response.status !== 402) {
    throw new Erc7710DryRunError(
      `Expected an unpaid x402 requirement for dry run, but the endpoint returned HTTP ${response.status}.`
    );
  }

  const paymentRequired = httpClient.getPaymentRequiredResponse(
    (name) => response.headers.get(name),
    responseBody
  );
  const paymentPayload = await httpClient.createPaymentPayload(paymentRequired);
  const selectedRequirement = selectedRequirementFromPayload(paymentPayload);
  const permissionContext = permissionContextFromPayload(paymentPayload);
  const payloadAddresses = assertPayloadMatchesGrant(paymentPayload, grant);
  const requirement = sanitizeRequirement(
    paymentRequired.x402Version,
    selectedRequirement,
    paymentRequired
  );

  return {
    createdAt: new Date().toISOString(),
    endpoint: DRY_RUN_ENDPOINT,
    method: "POST",
    requirement,
    grant: {
      delegator: grant.from,
      sessionAccount: grant.sessionAccount,
      delegationManager: grant.delegationManager,
      parentPermissionContextHash: keccak256(parentPermissionContext),
      parentPermissionContextBytes: size(parentPermissionContext),
      tokenAddress: grant.tokenAddress,
      tokenLimitAtomic: grant.periodAmountAtomic,
      expiresAt: grant.expiresAt
    },
    payload: {
      x402Version: paymentPayload.x402Version,
      accepted: sanitizeRequirement(
        paymentPayload.x402Version,
        selectedRequirement,
        paymentRequired
      ),
      delegationManager: payloadAddresses.delegationManager,
      delegator: payloadAddresses.delegator,
      permissionContextHash: keccak256(permissionContext),
      permissionContextBytes: size(permissionContext)
    },
    safeguards: {
      fetched402Only: true,
      paidRequestSubmitted: false,
      paymentSignatureHeaderSubmitted: false,
      walletRequestExecutionPermissionsCalled: false,
      ethSendTransactionCalled: false,
      rawPermissionContextReturned: false
    }
  };
}
