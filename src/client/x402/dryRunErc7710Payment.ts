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
import type { AdvancedPermissionGrant, Erc7710PayloadProof } from "@/shared/types";
import { buildErc7710PayloadProof } from "@/shared/x402/erc7710DelegationInspector";
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
    childDelegationTarget: string | null;
    delegationCount: number | null;
    permissionContextHash: string;
    permissionContextBytes: number;
  };
  payloadProof: Erc7710PayloadProof;
  safeguards: {
    fetched402Only: true;
    paidRequestSubmitted: false;
    paymentSignatureHeaderSubmitted: false;
    payloadValidatedAgainstGrant: true;
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
    throw new Erc7710DryRunError(`${label} 不是有效的 EVM 地址`);
  }

  return getAddress(value) as Hex;
}

function assertHex(value: string, label: string): Hex {
  if (!isHex(value) || value === "0x") {
    throw new Erc7710DryRunError(`${label} 不是有效的非空 hex 数据`);
  }

  return value as Hex;
}

function assertActiveGrant(
  grant: AdvancedPermissionGrant | null
): ActiveAdvancedPermissionGrant {
  if (!grant) {
    throw new Erc7710DryRunError(
      "当前没有可用于 dry run 的 MetaMask Advanced Permission 授权"
    );
  }

  if (grant.source !== "metamask-erc7715") {
    throw new Erc7710DryRunError("已保存权限不是 MetaMask ERC-7715 授权");
  }

  if (grant.status !== "granted" || grant.expiry <= Math.floor(Date.now() / 1000)) {
    throw new Erc7710DryRunError(
      "已保存的 MetaMask Advanced Permission 授权已过期或已撤销"
    );
  }

  if (grant.chainId !== BASE_SEPOLIA_CHAIN_ID) {
    throw new Erc7710DryRunError("已保存授权未限定到 Base Sepolia");
  }

  if (!grant.from) {
    throw new Erc7710DryRunError(
      "已保存授权缺少 ERC-7710 x402 所需的 delegator 地址"
    );
  }

  assertAddress(grant.from, "授权 delegator");
  assertAddress(grant.to, "授权 redeemer");
  assertAddress(grant.sessionAccount, "已保存会话账户");
  assertAddress(grant.delegationManager, "授权 delegation manager");
  assertHex(grant.context, "授权 permission context");

  if (lowerHex(grant.to) !== lowerHex(grant.sessionAccount)) {
    throw new Erc7710DryRunError(
      "已保存授权的 redeemer 与本地会话账户不匹配"
    );
  }

  if (lowerHex(grant.tokenAddress) !== lowerHex(BASE_SEPOLIA_USDC.address)) {
    throw new Erc7710DryRunError("已保存授权未限定到 Base Sepolia USDC");
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
      "选中的 x402 requirement 没有请求 ERC-7710 支付"
    );
  }

  return requirement;
}

function permissionContextFromPayload(paymentPayload: PaymentPayload) {
  const permissionContext = paymentPayload.payload.permissionContext;
  if (typeof permissionContext !== "string") {
    throw new Erc7710DryRunError(
      "ERC-7710 x402 payload 未包含 permission context"
    );
  }

  return assertHex(permissionContext, "生成的 permission context");
}

function addressFromPayload(
  paymentPayload: PaymentPayload,
  field: "delegationManager" | "delegator",
  label: string
) {
  const value = paymentPayload.payload[field];

  if (typeof value !== "string") {
    throw new Erc7710DryRunError(`ERC-7710 x402 payload 未包含 ${label}`);
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
      "生成的 ERC-7710 x402 payload delegation manager 与 MetaMask 授权不匹配"
    );
  }

  if (lowerHex(delegator) !== lowerHex(grant.from)) {
    throw new Erc7710DryRunError(
      "生成的 ERC-7710 x402 payload delegator 与 MetaMask 授权不匹配"
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
      "已保存会话账户与 Advanced Permission 授权不匹配"
    );
  }

  const delegationProvider = createx402DelegationProvider({
    account: sessionAccount,
    from: assertAddress(input.grant.to, "授权 redeemer"),
    parentPermissionContext: assertHex(
      input.grant.context,
      "授权 permission context"
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
    "授权 permission context"
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
      `Dry run 预期收到未支付的 x402 requirement，但接口返回 HTTP ${response.status}`
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
  const payloadProof = buildErc7710PayloadProof({
    localPayloadMatchesGrant: true,
    permissionContext,
    redeemerConstraint: null,
    serverPayloadMatchesGrant: null,
    settlementPreflight: false,
    validationSource: "client_local"
  });
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
      childDelegationTarget: payloadProof.childDelegationTarget,
      delegationCount: payloadProof.delegationCount,
      permissionContextHash: keccak256(permissionContext),
      permissionContextBytes: size(permissionContext)
    },
    payloadProof,
    safeguards: {
      fetched402Only: true,
      paidRequestSubmitted: false,
      paymentSignatureHeaderSubmitted: false,
      payloadValidatedAgainstGrant: true,
      walletRequestExecutionPermissionsCalled: false,
      ethSendTransactionCalled: false,
      rawPermissionContextReturned: false
    }
  };
}
