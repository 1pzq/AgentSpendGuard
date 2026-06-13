"use client";

import { x402Erc7710Client } from "@metamask/x402";
import {
  createDelegation,
  getSmartAccountsEnvironment
} from "@metamask/smart-accounts-kit";
import { signDelegation } from "@metamask/smart-accounts-kit/actions";
import {
  decodeDelegations,
  encodeDelegations,
  generateSalt
} from "@metamask/smart-accounts-kit/utils";
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
import type {
  AdvancedPermissionGrant,
  AiRiskBrief,
  ApiResponse,
  Erc7710PayloadProof,
  OneShotPaymentTimeline
} from "@/shared/types";
import {
  buildErc7710PayloadProof,
  inspectErc7710RedeemerConstraint
} from "@/shared/x402/erc7710DelegationInspector";
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
    erc7710Proof?: Erc7710PayloadProof | null;
    oneShot?: OneShotPaymentTimeline;
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
  onProof?: (proof: Erc7710PayloadProof) => void;
  onStage?: (stage: Erc7710PaidPocStage) => void;
  walletAddress: string | null;
};

export type Erc7710SettlementPreflightResult = {
  okToSubmit: boolean;
  simulatedRedeemers: string[];
};

type SettlementPreflightFailure = {
  error?: unknown;
  ok?: unknown;
  redeemer?: unknown;
};

const X402_NETWORK: X402Network = `eip155:${BASE_SEPOLIA_CHAIN_ID}`;
const PAID_POC_ENDPOINT = "/api/x402/deepseek/risk-brief/erc7710-paid-poc";
const PAID_POC_PREFLIGHT_ENDPOINT =
  "/api/x402/deepseek/risk-brief/erc7710-paid-poc/preflight";
const PAID_POC_ONESHOT_FEE_ENDPOINT =
  "/api/x402/deepseek/risk-brief/erc7710-paid-poc/one-shot-fee";
const ERC20_TRANSFER_SELECTOR = "transfer(address,uint256)";
// 1Shot exposes only minFee before estimate; keep bounded headroom for requiredPaymentAmount.
const ONESHOT_RELAY_FEE_BUDGET_MULTIPLIER = BigInt(2);

type OneShotFeeQuote = {
  chainId: string;
  feeBudgetAtomic: string;
  feeCollector: string;
  minFeeAtomic: string;
  targetAddress: string;
  tokenAddress: string;
};
type Erc7710PaymentRequirement = PaymentRequirements & {
  amount: string;
  asset: string;
  maxTimeoutSeconds: number;
  payTo: string;
};

type ExpectedChildErc20TransferAmountCaveat = {
  maxAmountAtomic: string;
  tokenAddress: string;
};

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
    throw new Erc7710PaidPocError(`${label} 不是有效的 EVM 地址`);
  }

  return getAddress(value) as Hex;
}

function assertHex(value: string, label: string): Hex {
  if (!isHex(value) || value === "0x") {
    throw new Erc7710PaidPocError(`${label} 不是有效的非空 hex 数据`);
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

function positiveAtomicBigInt(value: string, label: string) {
  if (!/^\d+$/.test(value)) {
    throw new Erc7710PaidPocError(`${label} 不是整数 atomic 金额`);
  }

  const parsed = BigInt(value);
  if (parsed <= BigInt(0)) {
    throw new Erc7710PaidPocError(`${label} 必须大于 0`);
  }

  return parsed;
}

function nonNegativeAtomicBigInt(value: string, label: string) {
  if (!/^\d+$/.test(value)) {
    throw new Erc7710PaidPocError(`${label} 不是整数 atomic 金额`);
  }

  return BigInt(value);
}

function maxBigInt(a: bigint, b: bigint) {
  return a > b ? a : b;
}

function minBigInt(a: bigint, b: bigint) {
  return a < b ? a : b;
}

function assertActiveGrant(
  grant: AdvancedPermissionGrant | null,
  expectedAmountAtomic: string
): ActiveAdvancedPermissionGrant {
  if (!grant) {
    throw new Erc7710PaidPocError(
      "当前没有可用于 ERC-7710 付费 PoC 的 MetaMask Advanced Permission 授权"
    );
  }

  if (grant.source !== "metamask-erc7715") {
    throw new Erc7710PaidPocError("已保存权限不是 MetaMask ERC-7715 授权");
  }

  if (grant.status !== "granted" || grant.expiry <= Math.floor(Date.now() / 1000)) {
    throw new Erc7710PaidPocError(
      "已保存的 MetaMask Advanced Permission 授权已过期或已撤销"
    );
  }

  if (grant.chainId !== BASE_SEPOLIA_CHAIN_ID) {
    throw new Erc7710PaidPocError("已保存授权未限定到 Base Sepolia");
  }

  if (!grant.from) {
    throw new Erc7710PaidPocError(
      "已保存授权缺少 ERC-7710 x402 所需的 delegator 地址"
    );
  }

  assertAddress(grant.from, "授权 delegator");
  assertAddress(grant.to, "授权 redeemer");
  assertAddress(grant.sessionAccount, "已保存会话账户");
  assertAddress(grant.delegationManager, "授权 delegation manager");
  assertHex(grant.context, "授权 permission context");

  if (lowerHex(grant.to) !== lowerHex(grant.sessionAccount)) {
    throw new Erc7710PaidPocError(
      "已保存授权的 redeemer 与本地会话账户不匹配"
    );
  }

  if (lowerHex(grant.tokenAddress) !== lowerHex(BASE_SEPOLIA_USDC.address)) {
    throw new Erc7710PaidPocError("已保存授权未限定到 Base Sepolia USDC");
  }

  if (BigInt(grant.periodAmountAtomic) < BigInt(expectedAmountAtomic)) {
    throw new Erc7710PaidPocError(
      "已保存授权额度低于本次 ERC-7710 x402 请求金额"
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
      "选中的 x402 requirement 没有请求 ERC-7710 支付"
    );
  }

  if (!amountEquals(requirement.amount, expectedAmountAtomic)) {
    throw new Erc7710PaidPocError(
      `选中的 x402 requirement 金额为 ${requirement.amount} atomic USDC，不是预期的 ${expectedAmountAtomic}`
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
      "ERC-7710 x402 payload 未包含 permission context"
    );
  }

  return assertHex(permissionContext, "生成的 permission context");
}

function assertFacilitatorRedeemerConstraint(
  paymentPayload: PaymentPayload,
  requirement: PaymentRequirements
) {
  const facilitatorAddresses = facilitatorAddressesFromRequirement(requirement);
  if (facilitatorAddresses.length === 0) return;

  const permissionContext = permissionContextFromPayload(paymentPayload);
  const delegations = decodeDelegations(permissionContext);
  const firstDelegation = delegations[0];
  const facilitatorKeys = new Set(
    facilitatorAddresses.map((address) => assertAddress(address, "Facilitator redeemer 地址").toLowerCase())
  );
  const hasTargetDelegate =
    !!firstDelegation &&
    facilitatorKeys.has(assertAddress(firstDelegation.delegate, "ERC-7710 delegate 地址").toLowerCase());
  const inspection = inspectErc7710RedeemerConstraint(
    permissionContext,
    facilitatorAddresses
  );

  if (!inspection.decoded) {
    throw new Erc7710PaidPocError(
      `生成的 ERC-7710 x402 permission context 无法用于 RedeemerEnforcer 验证：${inspection.error ?? "未知解码错误"}`
    );
  }

  if (!hasTargetDelegate) {
    throw new Erc7710PaidPocError(
      `生成的 ERC-7710 x402 payload 第一条 delegation delegate 为 ${firstDelegation?.delegate ?? "缺失"}，不是 1Shot facilitator 地址`
    );
  }

  if (inspection.hasRedeemerEnforcer && !inspection.hasAllRequiredRedeemers) {
    throw new Erc7710PaidPocError(
      `生成的 ERC-7710 x402 payload 缺少 facilitator redeemer 地址：${inspection.missingRequiredRedeemers.join(", ")}`
    );
  }
}

async function fetchOneShotFeeQuote(input: {
  expectedAmountAtomic: string;
  grant: ActiveAdvancedPermissionGrant;
}): Promise<OneShotFeeQuote> {
  const response = await fetch(PAID_POC_ONESHOT_FEE_ENDPOINT, {
    cache: "no-store",
    headers: {
      Accept: "application/json"
    }
  });
  const json = (await response.json()) as ApiResponse<Omit<OneShotFeeQuote, "feeBudgetAtomic">>;

  if (!json.ok) {
    throw new Erc7710PaidPocError(json.error.message);
  }

  const minFeeAtomic = nonNegativeAtomicBigInt(
    json.data.minFeeAtomic,
    "1Shot 最低费用"
  );
  const paymentAmount = positiveAtomicBigInt(
    input.expectedAmountAtomic,
    "ERC-7710 x402 金额"
  );
  const grantLimit = positiveAtomicBigInt(
    input.grant.periodAmountAtomic,
    "Advanced Permission 授权额度"
  );
  const availableForRelayFee = grantLimit - paymentAmount;

  if (availableForRelayFee < minFeeAtomic) {
    throw new Erc7710PaidPocError(
      "已保存授权额度低于本次 x402 金额加 1Shot 费用报价"
    );
  }

  const baseFeeBudget = maxBigInt(minFeeAtomic, paymentAmount);
  const feeBudget = minBigInt(
    baseFeeBudget * ONESHOT_RELAY_FEE_BUDGET_MULTIPLIER,
    availableForRelayFee
  );

  return {
    ...json.data,
    feeBudgetAtomic: feeBudget.toString()
  };
}

function oneShotScopedRequirement(
  requirement: Erc7710PaymentRequirement,
  feeQuote: OneShotFeeQuote
): Erc7710PaymentRequirement {
  const paymentAmount = positiveAtomicBigInt(
    requirement.amount,
    "ERC-7710 x402 requirement 金额"
  );
  const feeBudget = nonNegativeAtomicBigInt(
    feeQuote.feeBudgetAtomic,
    "1Shot 费用预算"
  );
  const target = assertAddress(feeQuote.targetAddress, "1Shot target redeemer 地址");

  assertAddress(feeQuote.feeCollector, "1Shot fee collector 地址");

  if (lowerHex(feeQuote.tokenAddress) !== lowerHex(requirement.asset)) {
    throw new Erc7710PaidPocError(
      "1Shot 费用 token 与选中的 x402 ERC-7710 资产不匹配"
    );
  }

  return {
    ...requirement,
    amount: (paymentAmount + feeBudget).toString(),
    extra: {
      ...(requirement.extra ?? {}),
      facilitatorAddresses: [target]
    }
  };
}

async function signFirstDelegation(input: {
  delegationManager: string;
  sessionAccount: ReturnType<typeof getStoredAdvancedPermissionSessionAccount>;
  unsignedDelegation: ReturnType<typeof decodeDelegations>[number];
}) {
  return signDelegation(
    {
      account: input.sessionAccount,
      chain: {
        id: BASE_SEPOLIA_CHAIN_ID
      },
      signTypedData: (typedData: unknown) =>
        input.sessionAccount.signTypedData(
          typedData as Parameters<typeof input.sessionAccount.signTypedData>[0]
        )
    } as Parameters<typeof signDelegation>[0],
    {
      account: input.sessionAccount,
      allowInsecureUnrestrictedDelegation: true,
      chainId: BASE_SEPOLIA_CHAIN_ID,
      delegation: input.unsignedDelegation,
      delegationManager: assertAddress(
        input.delegationManager,
        "payload delegation manager"
      )
    }
  );
}

async function createOneShotDelegationPayload(input: {
  feeQuote: OneShotFeeQuote;
  grant: ActiveAdvancedPermissionGrant;
  requirement: Erc7710PaymentRequirement;
  sessionAccount: ReturnType<typeof getStoredAdvancedPermissionSessionAccount>;
}) {
  const target = assertAddress(input.feeQuote.targetAddress, "1Shot target redeemer 地址");
  const tokenAddress = assertAddress(BASE_SEPOLIA_USDC.address, "USDC token 地址");
  const childTransferAmountCap = positiveAtomicBigInt(
    input.requirement.amount,
    "child delegation ERC-20 transfer amount cap"
  );
  const environment = getSmartAccountsEnvironment(BASE_SEPOLIA_CHAIN_ID);
  const parentDelegations = decodeDelegations(
    assertHex(input.grant.context, "授权 permission context")
  );
  const parentDelegation = parentDelegations[0];

  if (!parentDelegation) {
    throw new Erc7710PaidPocError(
      "已保存的 MetaMask Advanced Permission 授权不包含父 delegation"
    );
  }

  const targetedDelegation = createDelegation({
    caveats: [
      { type: "limitedCalls", limit: 2 },
      { type: "valueLte", maxValue: BigInt(0) },
      {
        type: "erc20TransferAmount",
        tokenAddress,
        maxAmount: childTransferAmountCap
      },
      {
        type: "allowedTargets",
        targets: [tokenAddress]
      },
      {
        type: "allowedMethods",
        selectors: [ERC20_TRANSFER_SELECTOR]
      },
      {
        type: "timestamp",
        afterThreshold: 0,
        beforeThreshold:
          Math.floor(Date.now() / 1000) + input.requirement.maxTimeoutSeconds
      }
    ],
    environment,
    from: assertAddress(input.grant.to, "授权 redeemer"),
    parentDelegation,
    salt: generateSalt(),
    to: target
  });
  const signature = await signFirstDelegation({
    delegationManager: input.grant.delegationManager,
    sessionAccount: input.sessionAccount,
    unsignedDelegation: targetedDelegation
  });
  const permissionContext = encodeDelegations([
    {
      ...targetedDelegation,
      signature
    },
    ...parentDelegations
  ]);
  const [firstDelegation] = decodeDelegations(permissionContext);

  if (lowerHex(firstDelegation?.delegate) !== lowerHex(target)) {
    throw new Erc7710PaidPocError(
      `生成的 ERC-7710 x402 payload 第一条 delegation delegate 为 ${firstDelegation?.delegate ?? "缺失"}，不是 1Shot relayer target`
    );
  }

  return {
    delegationManager: assertAddress(
      input.grant.delegationManager,
      "授权 delegation manager"
    ),
    delegator: assertAddress(input.grant.from, "授权 delegator"),
    permissionContext
  };
}

function addressFromPayload(
  paymentPayload: PaymentPayload,
  field: "delegationManager" | "delegator",
  label: string
) {
  const value = paymentPayload.payload[field];

  if (typeof value !== "string") {
    throw new Erc7710PaidPocError(`ERC-7710 x402 payload 未包含 ${label}`);
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
      "生成的 ERC-7710 x402 payload delegation manager 与 MetaMask 授权不匹配"
    );
  }

  if (lowerHex(delegator) !== lowerHex(grant.from)) {
    throw new Erc7710PaidPocError(
      "生成的 ERC-7710 x402 payload delegator 与 MetaMask 授权不匹配"
    );
  }
}

function combinePayloadProofs(
  localProof: Erc7710PayloadProof | null,
  serverProof: Erc7710PayloadProof | null | undefined
): Erc7710PayloadProof | null {
  if (!localProof) return serverProof ?? null;
  if (!serverProof) return localProof;

  return {
    ...localProof,
    childCaveats: localProof.childCaveats ?? serverProof.childCaveats,
    childDelegationDelegator:
      localProof.childDelegationDelegator ?? serverProof.childDelegationDelegator,
    childDelegationTarget:
      localProof.childDelegationTarget ?? serverProof.childDelegationTarget,
    childErc20TransferAmount:
      localProof.childErc20TransferAmount ??
      serverProof.childErc20TransferAmount,
    delegationCount: localProof.delegationCount ?? serverProof.delegationCount,
    permissionContextBytes:
      localProof.permissionContextBytes ?? serverProof.permissionContextBytes,
    permissionContextHash:
      localProof.permissionContextHash ?? serverProof.permissionContextHash,
    serverPayloadMatchesGrant: serverProof.serverPayloadMatchesGrant,
    validationSource: serverProof.serverPayloadMatchesGrant
      ? "client_and_server"
      : localProof.validationSource
  };
}

function assertChildErc20TransferAmountCaveat(
  proof: Erc7710PayloadProof,
  expected: ExpectedChildErc20TransferAmountCaveat | null
) {
  if (!expected) {
    throw new Erc7710PaidPocError(
      "生成的 ERC-7710 x402 payload 未记录本次 child delegation 金额上限"
    );
  }

  const caveat = proof.childErc20TransferAmount;

  if (!caveat) {
    throw new Erc7710PaidPocError(
      "生成的 ERC-7710 x402 payload 缺少 erc20TransferAmount child caveat"
    );
  }

  if (lowerHex(caveat.tokenAddress) !== lowerHex(expected.tokenAddress)) {
    throw new Erc7710PaidPocError(
      "生成的 erc20TransferAmount child caveat token 与 x402 资产不匹配"
    );
  }

  if (!amountEquals(caveat.maxAmountAtomic, expected.maxAmountAtomic)) {
    throw new Erc7710PaidPocError(
      `生成的 erc20TransferAmount child caveat 上限为 ${caveat.maxAmountAtomic} atomic USDC，不是预期的 ${expected.maxAmountAtomic}`
    );
  }
}

function createPaidPocHttpClient(input: {
  expectedAmountAtomic: string;
  expectedPayTo: string;
  grant: ActiveAdvancedPermissionGrant;
}) {
  const sessionAccount = getStoredAdvancedPermissionSessionAccount();
  let expectedChildErc20TransferAmount: ExpectedChildErc20TransferAmountCaveat | null =
    null;

  if (lowerHex(sessionAccount.address) !== lowerHex(input.grant.sessionAccount)) {
    throw new Erc7710PaidPocError(
      "已保存会话账户与 Advanced Permission 授权不匹配"
    );
  }

  const delegationProvider = async (requirement: Erc7710PaymentRequirement) => {
    const feeQuote = await fetchOneShotFeeQuote({
      expectedAmountAtomic: input.expectedAmountAtomic,
      grant: input.grant
    });
    const scopedRequirement = oneShotScopedRequirement(requirement, feeQuote);

    expectedChildErc20TransferAmount = {
      maxAmountAtomic: scopedRequirement.amount,
      tokenAddress: requirement.asset
    };

    return createOneShotDelegationPayload({
      feeQuote,
      grant: input.grant,
      requirement: scopedRequirement,
      sessionAccount
    });
  };
  const client = new x402Client();

  client.register(
    X402_NETWORK as Network,
    new x402Erc7710Client({
      delegationProvider: delegationProvider as ConstructorParameters<
        typeof x402Erc7710Client
      >[0]["delegationProvider"]
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

  return {
    getExpectedChildErc20TransferAmount: () => expectedChildErc20TransferAmount,
    httpClient: new x402HTTPClient(client)
  };
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
        message: paymentRequiredError(response) ?? `受保护接口返回 HTTP ${response.status}，但没有 SpendGuard JSON envelope`
      }
    };
  } catch {
    return {
      ok: false,
      error: {
        code: "INVALID_RESPONSE",
        message: paymentRequiredError(response) ?? `受保护接口返回 HTTP ${response.status}，但没有 JSON`
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
      ? `x402 支付验证失败：${decoded.error}`
      : null;
  } catch {
    return null;
  }
}

function settlementPreflightFailureSummary(json: ApiResponse<unknown>) {
  if (json.ok) return null;

  const results = json.error.details?.results;
  if (!Array.isArray(results)) return null;

  const failures = results.filter(
    (item): item is SettlementPreflightFailure =>
      !!item && typeof item === "object" && (item as SettlementPreflightFailure).ok === false
  );
  const firstFailure = failures[0];
  const redeemer = typeof firstFailure?.redeemer === "string"
    ? firstFailure.redeemer
    : null;
  const error = typeof firstFailure?.error === "string"
    ? firstFailure.error
    : null;

  if (!redeemer && !error) return null;

  const redeemerCopy = redeemer ? `redeemer ${shortAddress(redeemer)}` : "facilitator redeemer";
  const reasonCopy = error ? `，原因：${error}` : "";

  return `${redeemerCopy} 模拟失败${reasonCopy}`;
}

function preflightErrorMessage(json: ApiResponse<unknown>) {
  if (json.ok) return null;

  const detail = settlementPreflightFailureSummary(json);
  const action =
    "请先撤销并重新批准 MetaMask Advanced Permission，确认钱包在 Base Sepolia 有足够 USDC，且 smart account / EIP-7702 账户可执行后再运行。";

  if (detail) {
    return `${json.error.message} ${detail}。${action}`;
  }

  if (json.error.code === "ERC7710_SETTLEMENT_PREFLIGHT_REVERTED") {
    return `${json.error.message} ${action}`;
  }

  return json.error.message;
}

function shortAddress(value: string) {
  return value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
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
  return typeof error === "string" ? error : "未知错误";
}

function explainErc7710Failure(message: string) {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("facilitator settle failed (504)") ||
    normalized.includes("<!doctype html") ||
    normalized.includes("<html")
  ) {
    return "MetaMask ERC-7710 facilitator settlement 在产生 tx hash 前返回 HTTP 504SpendGuard 没有记录账本条目";
  }

  if (
    normalized.includes("invalid_exact_evm_erc7710_account_no") ||
    normalized.includes("invalid_exact_evm_erc7710_account_not")
  ) {
    return `${message}ERC-7710 facilitator 拒绝了 delegator 账户，因为它在 Base Sepolia 上不可执行请启用或部署 MetaMask smart account / EIP-7702 账户，然后重新请求 Advanced Permission 授权SpendGuard 没有记录账本条目`;
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
    throw new Erc7710PaidPocError(preflightErrorMessage(json) ?? json.error.message);
  }

  if (!json.data.okToSubmit) {
    throw new Erc7710PaidPocError(
      "ERC-7710 本地结算预检未批准提交"
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
  const {
    getExpectedChildErc20TransferAmount,
    httpClient
  } = createPaidPocHttpClient({
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
  let localPayloadProof: Erc7710PayloadProof | null = null;
  try {
    input.onStage?.("building_delegation_payload");
    paymentPayload = await httpClient.createPaymentPayload(paymentRequired);
    const selectedRequirement = selectedRequirementFromPayload(
      paymentPayload,
      input.expectedAmountAtomic
    );
    const permissionContext = permissionContextFromPayload(paymentPayload);
    assertPayloadMatchesGrant(paymentPayload, grant);
    assertFacilitatorRedeemerConstraint(paymentPayload, selectedRequirement);
    localPayloadProof = buildErc7710PayloadProof({
      localPayloadMatchesGrant: true,
      permissionContext,
      redeemerConstraint: true,
      serverPayloadMatchesGrant: null,
      settlementPreflight: false,
      validationSource: "client_local"
    });
    assertChildErc20TransferAmountCaveat(
      localPayloadProof,
      getExpectedChildErc20TransferAmount()
    );
    input.onProof?.(localPayloadProof);
  } catch (error) {
    throw new Error(`ERC-7710 x402 payment payload 失败：${errorMessage(error)}`);
  }

  try {
    input.onStage?.("preflighting_settlement");
    const preflight = await assertSettlementPreflight(paymentPayload);
    if (localPayloadProof) {
      localPayloadProof = {
        ...localPayloadProof,
        settlementPreflight: true,
        validatedAt: new Date().toISOString()
      };
      input.onProof?.(localPayloadProof);
    }
    const shouldSubmit = input.confirmAfterPreflight
      ? await input.confirmAfterPreflight(preflight)
      : true;

    if (!shouldSubmit) {
      throw new Erc7710PaidPocError(
        "本地预检成功后取消了结算提交没有提交付费请求"
      );
    }
  } catch (error) {
    throw new Error(`ERC-7710 结算预检失败：${errorMessage(error)}`);
  }

  input.onStage?.("submitting_paid_request");
  const paidRequest = fetch(PAID_POC_ENDPOINT, {
    ...requestInit,
    headers: {
      ...requestInit.headers,
      ...httpClient.encodePaymentSignatureHeader(paymentPayload)
    }
  });
  input.onStage?.("settling");
  const paidResponse = await paidRequest;
  const json = await parseApiResponse(paidResponse);

  if (paidResponse.status !== 200) {
    const message = json.ok
      ? `受保护接口返回 HTTP ${paidResponse.status}`
      : json.error.message;

    throw new Error(explainErc7710Failure(message));
  }

  try {
    await httpClient.processPaymentResult(
      paymentPayload,
      (name) => paidResponse.headers.get(name),
      paidResponse.status
    );
  } catch (error) {
    throw new Error(
      `ERC-7710 x402 结算处理失败：${explainErc7710Failure(
        errorMessage(error)
      )}`
    );
  }

  if (!json.ok) {
    throw new Error(
      explainErc7710Failure(json.error.message)
    );
  }

  const combinedProof = combinePayloadProofs(
    localPayloadProof,
    json.data.paymentReceipt.erc7710Proof
  );

  return {
    ...json.data,
    paymentReceipt: {
      ...json.data.paymentReceipt,
      erc7710Proof: combinedProof
    }
  };
}
