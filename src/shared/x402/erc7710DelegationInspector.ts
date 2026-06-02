import { getSmartAccountsEnvironment } from "@metamask/smart-accounts-kit";
import type { Caveat } from "@metamask/smart-accounts-kit";
import {
  decodeCaveat,
  decodeDelegations
} from "@metamask/smart-accounts-kit/utils";
import {
  getAddress,
  isAddress,
  isHex,
  keccak256,
  size,
  type Address,
  type Hex
} from "viem";
import { BASE_SEPOLIA_CHAIN_ID } from "@/shared/chain";
import type {
  AdvancedPermissionGrant,
  Erc7710AllowedMethodsCaveatProof,
  Erc7710AllowedTargetsCaveatProof,
  Erc7710ChildCaveatProof,
  Erc7710DecodedCaveatProof,
  Erc7710LimitedCallsCaveatProof,
  Erc7710PayloadProof,
  Erc7710Proof,
  Erc7710ProofStatus,
  Erc7710TimestampCaveatProof,
  Erc7710TransferAmountCaveatProof,
  Erc7710ValueLteCaveatProof,
  IsoDateTime
} from "@/shared/types";

export type Erc7710RedeemerConstraintInspection = {
  acceptedRedeemers: Address[];
  allowedRedeemers: Address[];
  decoded: boolean;
  delegationCount: number;
  error: string | null;
  hasAcceptedFacilitatorRedeemer: boolean;
  hasAllRequiredRedeemers: boolean;
  hasRedeemerEnforcer: boolean;
  missingRequiredRedeemers: Address[];
  redeemerCaveatCount: number;
  redeemerEnforcer: Address | null;
};

export type Erc7710PermissionContextSummary = {
  childCaveats: Erc7710ChildCaveatProof | null;
  childDelegationDelegator: Address | null;
  childDelegationTarget: Address | null;
  childErc20TransferAmount: Erc7710TransferAmountCaveatProof | null;
  decoded: boolean;
  delegationCount: number;
  error: string | null;
  permissionContextBytes: number | null;
  permissionContextHash: Hex | null;
};

export type Erc7710RequiredChildCaveatValidationInput = {
  expectedAllowedTargets: readonly string[];
  expectedChildDelegationTargets?: readonly string[];
  expectedMaxTransferAmountAtomic?: string | null;
  expectedMinTransferAmountAtomic: string;
  expectedTokenAddress: string;
  maxLimitedCalls?: number;
  maxTimeoutSeconds?: number | null;
  nowSeconds?: number;
  payloadProof: Erc7710PayloadProof;
  timestampClockSkewSeconds?: number;
};

export type Erc7710RequiredChildCaveatValidation = {
  details: {
    allowedMethods: Erc7710AllowedMethodsCaveatProof | null;
    allowedTargets: Erc7710AllowedTargetsCaveatProof | null;
    amountCap: Erc7710TransferAmountCaveatProof | null;
    caveatCount: number | null;
    childDelegationTarget: string | null;
    expectedAllowedTargets: string[];
    expectedChildDelegationTargets: string[];
    expectedMaxTransferAmountAtomic: string | null;
    expectedMethodSelectors: string[];
    expectedMinTransferAmountAtomic: string;
    expectedTokenAddress: string;
    limitedCalls: Erc7710LimitedCallsCaveatProof | null;
    timestamp: Erc7710TimestampCaveatProof | null;
  };
  mismatches: string[];
  missing: string[];
  ok: boolean;
};

const ERC20_TRANSFER_FUNCTION = "transfer(address,uint256)";
const ERC20_TRANSFER_SELECTOR = "0xa9059cbb";

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

function normalizeAddress(value: string): Address | null {
  return isAddress(value) ? (getAddress(value) as Address) : null;
}

function uniqueAddresses(addresses: readonly string[]) {
  const seen = new Set<string>();
  const result: Address[] = [];

  for (const value of addresses) {
    const address = normalizeAddress(value);
    if (!address) continue;

    const key = address.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(address);
  }

  return result;
}

function normalizeAddressList(addresses: readonly string[]) {
  return uniqueAddresses(addresses).map((address) => address.toLowerCase());
}

function normalizedAddressMatches(value: string | null | undefined, expected: string) {
  const address = typeof value === "string" ? normalizeAddress(value) : null;
  const expectedAddress = normalizeAddress(expected);

  return (
    !!address &&
    !!expectedAddress &&
    address.toLowerCase() === expectedAddress.toLowerCase()
  );
}

function normalizeMethodSelector(selector: string) {
  const value = selector.trim();

  if (/^0x[a-fA-F0-9]{8}$/.test(value)) return value.toLowerCase();
  if (
    value === ERC20_TRANSFER_FUNCTION ||
    value === `function ${ERC20_TRANSFER_FUNCTION}`
  ) {
    return ERC20_TRANSFER_SELECTOR;
  }

  return value.toLowerCase();
}

function atomicGreaterThanOrEqual(value: string, minimum: string) {
  try {
    return BigInt(value) >= BigInt(minimum);
  } catch {
    return false;
  }
}

function atomicLessThanOrEqual(value: string, maximum: string) {
  try {
    return BigInt(value) <= BigInt(maximum);
  } catch {
    return false;
  }
}

function emptyContextSummary(error: string | null): Erc7710PermissionContextSummary {
  return {
    childCaveats: null,
    childDelegationDelegator: null,
    childDelegationTarget: null,
    childErc20TransferAmount: null,
    decoded: false,
    delegationCount: 0,
    error,
    permissionContextBytes: null,
    permissionContextHash: null
  };
}

function hexBytes(value: string | null | undefined) {
  return value && isHex(value) ? size(value) : null;
}

function caveatEnforcer(caveat: Caveat) {
  return normalizeAddress(caveat.enforcer) ?? caveat.enforcer;
}

function decodedRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function atomicString(value: unknown) {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value).toString();
  }
  if (typeof value === "string" && /^\d+$/.test(value)) return value;
  return null;
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return null;
}

function addressArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return uniqueAddresses(
    value.filter((item): item is string => typeof item === "string")
  );
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function caveatLabel(type: string) {
  switch (type) {
    case "allowedMethods":
      return "allowedMethods";
    case "allowedTargets":
      return "allowedTargets";
    case "erc20TransferAmount":
      return "erc20TransferAmount";
    case "limitedCalls":
      return "limitedCalls";
    case "timestamp":
      return "timestamp";
    case "valueLte":
      return "valueLte";
    default:
      return type || "unknown";
  }
}

function decodedCaveatSummary(type: string, record: Record<string, unknown>) {
  switch (type) {
    case "allowedMethods": {
      const selectors = stringArray(record.selectors);
      return selectors.length > 0 ? selectors.join(", ") : "未记录 method selector";
    }
    case "allowedTargets": {
      const targets = addressArray(record.targets);
      return targets.length > 0 ? targets.join(", ") : "未记录 target";
    }
    case "erc20TransferAmount": {
      const tokenAddress =
        typeof record.tokenAddress === "string"
          ? normalizeAddress(record.tokenAddress)
          : null;
      const maxAmount = atomicString(record.maxAmount);

      return tokenAddress && maxAmount
        ? `${maxAmount} atomic @ ${tokenAddress}`
        : "未记录 ERC-20 金额上限";
    }
    case "limitedCalls": {
      const limit = numberValue(record.limit);
      return limit === null ? "未记录调用次数上限" : `最多 ${limit} 次调用`;
    }
    case "timestamp": {
      const afterThreshold = numberValue(record.afterThreshold);
      const beforeThreshold = numberValue(record.beforeThreshold);
      return `after ${afterThreshold ?? "?"}, before ${beforeThreshold ?? "?"}`;
    }
    case "valueLte": {
      const maxValue = atomicString(record.maxValue);
      return maxValue === null
        ? "未记录 native value 上限"
        : `native value <= ${maxValue}`;
    }
    default:
      return "已解码，未纳入摘要";
  }
}

function decodedCaveatProof(
  caveat: Caveat,
  environment: ReturnType<typeof getSmartAccountsEnvironment>
): Erc7710DecodedCaveatProof {
  try {
    const decoded = decodeCaveat({ caveat, environment });
    const record = decodedRecord(decoded);
    const type =
      record && typeof record.type === "string" ? record.type : "unknown";

    return {
      decoded: true,
      enforcer: caveatEnforcer(caveat),
      label: caveatLabel(type),
      summary: record ? decodedCaveatSummary(type, record) : "已解码",
      termsBytes: hexBytes(caveat.terms),
      type
    };
  } catch (error) {
    return {
      decoded: false,
      enforcer: caveatEnforcer(caveat),
      label: "unknown",
      summary: errorMessage(error),
      termsBytes: hexBytes(caveat.terms),
      type: "unknown"
    };
  }
}

function summarizeKnownChildCaveat(
  caveat: Caveat,
  environment: ReturnType<typeof getSmartAccountsEnvironment>
):
  | {
      type: "allowedMethods";
      value: Erc7710AllowedMethodsCaveatProof;
    }
  | {
      type: "allowedTargets";
      value: Erc7710AllowedTargetsCaveatProof;
    }
  | {
      type: "erc20TransferAmount";
      value: Erc7710TransferAmountCaveatProof;
    }
  | {
      type: "limitedCalls";
      value: Erc7710LimitedCallsCaveatProof;
    }
  | {
      type: "timestamp";
      value: Erc7710TimestampCaveatProof;
    }
  | {
      type: "valueLte";
      value: Erc7710ValueLteCaveatProof;
    }
  | null {
  const decoded = decodedRecord(decodeCaveat({ caveat, environment }));
  const enforcer = caveatEnforcer(caveat);

  if (!decoded || typeof decoded.type !== "string") return null;

  switch (decoded.type) {
    case "allowedMethods":
      return {
        type: "allowedMethods",
        value: {
          enforcer,
          selectors: stringArray(decoded.selectors)
        }
      };
    case "allowedTargets":
      return {
        type: "allowedTargets",
        value: {
          enforcer,
          targets: addressArray(decoded.targets)
        }
      };
    case "erc20TransferAmount": {
      const tokenAddress =
        typeof decoded.tokenAddress === "string"
          ? normalizeAddress(decoded.tokenAddress)
          : null;
      const maxAmountAtomic = atomicString(decoded.maxAmount);

      if (!tokenAddress || maxAmountAtomic === null) return null;

      return {
        type: "erc20TransferAmount",
        value: {
          enforcer,
          maxAmountAtomic,
          tokenAddress
        }
      };
    }
    case "limitedCalls": {
      const limit = numberValue(decoded.limit);
      return limit === null
        ? null
        : {
            type: "limitedCalls",
            value: { enforcer, limit }
          };
    }
    case "timestamp": {
      const afterThreshold = numberValue(decoded.afterThreshold);
      const beforeThreshold = numberValue(decoded.beforeThreshold);

      if (afterThreshold === null || beforeThreshold === null) return null;

      return {
        type: "timestamp",
        value: {
          afterThreshold,
          beforeThreshold,
          enforcer
        }
      };
    }
    case "valueLte": {
      const maxValueAtomic = atomicString(decoded.maxValue);
      return maxValueAtomic === null
        ? null
        : {
            type: "valueLte",
            value: { enforcer, maxValueAtomic }
          };
    }
    default:
      return null;
  }
}

function summarizeChildCaveats(
  caveats: Caveat[],
  environment: ReturnType<typeof getSmartAccountsEnvironment>
): Erc7710ChildCaveatProof {
  const result: Erc7710ChildCaveatProof = {
    allowedMethods: null,
    allowedTargets: null,
    caveatCount: caveats.length,
    erc20TransferAmount: null,
    limitedCalls: null,
    ordered: caveats.map((caveat) => decodedCaveatProof(caveat, environment)),
    timestamp: null,
    valueLte: null
  };

  for (const caveat of caveats) {
    try {
      const known = summarizeKnownChildCaveat(caveat, environment);
      if (!known) continue;
      switch (known.type) {
        case "allowedMethods":
          result.allowedMethods = known.value;
          break;
        case "allowedTargets":
          result.allowedTargets = known.value;
          break;
        case "erc20TransferAmount":
          result.erc20TransferAmount = known.value;
          break;
        case "limitedCalls":
          result.limitedCalls = known.value;
          break;
        case "timestamp":
          result.timestamp = known.value;
          break;
        case "valueLte":
          result.valueLte = known.value;
          break;
      }
    } catch {
      continue;
    }
  }

  return result;
}

export function validateErc7710RequiredChildCaveats(
  input: Erc7710RequiredChildCaveatValidationInput
): Erc7710RequiredChildCaveatValidation {
  const childCaveats = input.payloadProof.childCaveats ?? null;
  const amountCap =
    childCaveats?.erc20TransferAmount ??
    input.payloadProof.childErc20TransferAmount ??
    null;
  const expectedAllowedTargets = normalizeAddressList(
    input.expectedAllowedTargets
  );
  const expectedChildDelegationTargets = normalizeAddressList(
    input.expectedChildDelegationTargets ?? []
  );
  const expectedTokenAddress = normalizeAddress(input.expectedTokenAddress);
  const expectedMethodSelectors = [ERC20_TRANSFER_SELECTOR];
  const missing: string[] = [];
  const mismatches: string[] = [];

  if (!childCaveats) {
    missing.push("childCaveats");
  }

  if (!childCaveats?.allowedTargets) {
    missing.push("allowedTargets");
  } else {
    const targets = normalizeAddressList(childCaveats.allowedTargets.targets);

    for (const expectedTarget of expectedAllowedTargets) {
      if (!targets.includes(expectedTarget)) {
        mismatches.push("allowedTargets.target");
        break;
      }
    }
  }

  if (!childCaveats?.allowedMethods) {
    missing.push("allowedMethods");
  } else {
    const selectors = childCaveats.allowedMethods.selectors.map(
      normalizeMethodSelector
    );

    if (!expectedMethodSelectors.some((selector) => selectors.includes(selector))) {
      mismatches.push("allowedMethods.selector");
    }
  }

  if (!childCaveats?.timestamp) {
    missing.push("timestamp");
  } else {
    const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);
    const clockSkew = input.timestampClockSkewSeconds ?? 60;
    const timestamp = childCaveats.timestamp;

    if (timestamp.afterThreshold > nowSeconds + clockSkew) {
      mismatches.push("timestamp.afterThreshold");
    }
    if (timestamp.beforeThreshold <= timestamp.afterThreshold) {
      mismatches.push("timestamp.range");
    }
    if (timestamp.beforeThreshold < nowSeconds - clockSkew) {
      mismatches.push("timestamp.beforeThresholdExpired");
    }
    if (
      input.maxTimeoutSeconds &&
      timestamp.beforeThreshold > nowSeconds + input.maxTimeoutSeconds + clockSkew
    ) {
      mismatches.push("timestamp.beforeThresholdTooWide");
    }
  }

  if (!childCaveats?.limitedCalls) {
    missing.push("limitedCalls");
  } else {
    const limit = childCaveats.limitedCalls.limit;

    if (limit < 1) {
      mismatches.push("limitedCalls.limit");
    }
    if (input.maxLimitedCalls && limit > input.maxLimitedCalls) {
      mismatches.push("limitedCalls.tooWide");
    }
  }

  if (!amountCap) {
    missing.push("erc20TransferAmount");
  } else {
    if (
      !expectedTokenAddress ||
      !normalizedAddressMatches(amountCap.tokenAddress, expectedTokenAddress)
    ) {
      mismatches.push("erc20TransferAmount.tokenAddress");
    }
    if (
      !atomicGreaterThanOrEqual(
        amountCap.maxAmountAtomic,
        input.expectedMinTransferAmountAtomic
      )
    ) {
      mismatches.push("erc20TransferAmount.maxAmountBelowPayment");
    }
    if (
      input.expectedMaxTransferAmountAtomic &&
      !atomicLessThanOrEqual(
        amountCap.maxAmountAtomic,
        input.expectedMaxTransferAmountAtomic
      )
    ) {
      mismatches.push("erc20TransferAmount.maxAmountAboveGrant");
    }
  }

  if (expectedChildDelegationTargets.length > 0) {
    const target = input.payloadProof.childDelegationTarget;

    if (!target) {
      missing.push("childDelegationTarget");
    } else if (!expectedChildDelegationTargets.includes(target.toLowerCase())) {
      mismatches.push("childDelegationTarget");
    }
  }

  return {
    details: {
      allowedMethods: childCaveats?.allowedMethods ?? null,
      allowedTargets: childCaveats?.allowedTargets ?? null,
      amountCap,
      caveatCount: childCaveats?.caveatCount ?? null,
      childDelegationTarget: input.payloadProof.childDelegationTarget,
      expectedAllowedTargets,
      expectedChildDelegationTargets,
      expectedMaxTransferAmountAtomic:
        input.expectedMaxTransferAmountAtomic ?? null,
      expectedMethodSelectors,
      expectedMinTransferAmountAtomic: input.expectedMinTransferAmountAtomic,
      expectedTokenAddress: expectedTokenAddress ?? input.expectedTokenAddress,
      limitedCalls: childCaveats?.limitedCalls ?? null,
      timestamp: childCaveats?.timestamp ?? null
    },
    mismatches,
    missing,
    ok: missing.length === 0 && mismatches.length === 0
  };
}

export function summarizeErc7710PermissionContext(
  permissionContext: string | null | undefined
): Erc7710PermissionContextSummary {
  if (!permissionContext || !isHex(permissionContext) || permissionContext === "0x") {
    return emptyContextSummary("Permission context is not non-empty hex.");
  }

  try {
    const environment = getSmartAccountsEnvironment(BASE_SEPOLIA_CHAIN_ID);
    const delegations = decodeDelegations(permissionContext as Hex);
    const firstDelegation = delegations[0];
    const childCaveats = firstDelegation
      ? summarizeChildCaveats(firstDelegation.caveats, environment)
      : null;

    return {
      childCaveats,
      childDelegationDelegator: firstDelegation
        ? normalizeAddress(firstDelegation.delegator)
        : null,
      childDelegationTarget: firstDelegation
        ? normalizeAddress(firstDelegation.delegate)
        : null,
      childErc20TransferAmount: childCaveats?.erc20TransferAmount ?? null,
      decoded: true,
      delegationCount: delegations.length,
      error: null,
      permissionContextBytes: size(permissionContext as Hex),
      permissionContextHash: keccak256(permissionContext as Hex)
    };
  } catch (error) {
    return emptyContextSummary(errorMessage(error));
  }
}

export function buildErc7710PayloadProof(input: {
  localPayloadMatchesGrant?: boolean | null;
  permissionContext: string | null | undefined;
  redeemerConstraint?: boolean | null;
  serverPayloadMatchesGrant?: boolean | null;
  settlementPreflight?: boolean | null;
  validatedAt?: IsoDateTime;
  validationSource: Erc7710PayloadProof["validationSource"];
}): Erc7710PayloadProof {
  const summary = summarizeErc7710PermissionContext(input.permissionContext);

  return {
    childCaveats: summary.childCaveats,
    childDelegationDelegator: summary.childDelegationDelegator,
    childDelegationTarget: summary.childDelegationTarget,
    childErc20TransferAmount: summary.childErc20TransferAmount,
    delegationCount: summary.decoded ? summary.delegationCount : null,
    localPayloadMatchesGrant: input.localPayloadMatchesGrant ?? null,
    permissionContextBytes: summary.permissionContextBytes,
    permissionContextHash: summary.permissionContextHash,
    redeemerConstraint: input.redeemerConstraint ?? null,
    serverPayloadMatchesGrant: input.serverPayloadMatchesGrant ?? null,
    settlementPreflight: input.settlementPreflight ?? null,
    validatedAt: input.validatedAt ?? new Date().toISOString(),
    validationSource: input.validationSource
  };
}

function defaultProofMessage(status: Erc7710ProofStatus) {
  switch (status) {
    case "grant_ready":
      return "MetaMask Advanced Permission 授权已保存，尚未提交 ERC-7710 payment payload。";
    case "payload_validated":
      return "ERC-7710 payment payload 在本地验证中与已保存授权匹配。";
    case "settlement_preflighted":
      return "ERC-7710 payment payload 与已保存授权匹配，并通过本地结算预检。";
    case "settled":
      return "ERC-7710 payment payload 已验证，并完成 x402 付费请求结算。";
    case "blocked":
      return "SpendGuard 已在提交 ERC-7710 payment payload 前阻断该请求。";
    case "failed":
      return "ERC-7710 payment proof 在付费结算成功前失败。";
    case "not_ready":
    default:
      return "尚未保存 MetaMask Advanced Permission 授权。";
  }
}

export function buildErc7710ProofFromGrant(input: {
  grant: AdvancedPermissionGrant | null;
  payload?: Erc7710PayloadProof | null;
  payer?: string | null;
  status?: Erc7710ProofStatus;
  updatedAt?: IsoDateTime | null;
  validationMessage?: string;
}): Erc7710Proof {
  const status = input.status ?? (input.grant ? "grant_ready" : "not_ready");
  const parentSummary = input.grant
    ? summarizeErc7710PermissionContext(input.grant.context)
    : null;

  return {
    status,
    grant: input.grant
      ? {
          delegationManager: input.grant.delegationManager,
          delegator: input.grant.from,
          expiresAt: input.grant.expiresAt,
          parentPermissionContextBytes:
            parentSummary?.permissionContextBytes ?? null,
          parentPermissionContextHash:
            parentSummary?.permissionContextHash ?? null,
          permissionType: input.grant.permissionType,
          periodAmountAtomic: input.grant.periodAmountAtomic,
          periodDuration: input.grant.periodDuration,
          redeemer: input.grant.to,
          sessionAccount: input.grant.sessionAccount,
          startTime: input.grant.startTime,
          source: input.grant.source,
          tokenAddress: input.grant.tokenAddress,
          tokenDecimals: input.grant.tokenDecimals,
          tokenLimitAtomic: input.grant.periodAmountAtomic,
          tokenSymbol: input.grant.tokenSymbol,
          expiry: input.grant.expiry
        }
      : null,
    payer: input.payer ?? input.grant?.from ?? null,
    payload: input.payload ?? null,
    rawContextExposed: false,
    updatedAt:
      input.updatedAt ??
      input.payload?.validatedAt ??
      input.grant?.grantedAt ??
      null,
    validationMessage: input.validationMessage ?? defaultProofMessage(status)
  };
}

function decodeRedeemerTerms(terms: Hex) {
  const body = terms.slice(2);

  if (body.length === 0 || body.length % 40 !== 0) {
    throw new Error("RedeemerEnforcer terms are not 20-byte address chunks.");
  }

  const redeemers: Address[] = [];

  for (let offset = 0; offset < body.length; offset += 40) {
    const address = normalizeAddress(`0x${body.slice(offset, offset + 40)}`);

    if (!address) {
      throw new Error("RedeemerEnforcer terms include an invalid address.");
    }

    redeemers.push(address);
  }

  return redeemers;
}

function decodeCaveatRedeemers(caveat: Caveat) {
  if (!isHex(caveat.terms)) {
    throw new Error("RedeemerEnforcer caveat terms are not hex.");
  }

  return decodeRedeemerTerms(caveat.terms);
}

function emptyInspection(
  requiredRedeemers: Address[],
  error: string | null
): Erc7710RedeemerConstraintInspection {
  return {
    acceptedRedeemers: [],
    allowedRedeemers: [],
    decoded: false,
    delegationCount: 0,
    error,
    hasAcceptedFacilitatorRedeemer: false,
    hasAllRequiredRedeemers: requiredRedeemers.length === 0,
    hasRedeemerEnforcer: false,
    missingRequiredRedeemers: requiredRedeemers,
    redeemerCaveatCount: 0,
    redeemerEnforcer: null
  };
}

export function inspectErc7710RedeemerConstraint(
  permissionContext: Hex,
  requiredRedeemers: readonly string[],
  chainId = BASE_SEPOLIA_CHAIN_ID
): Erc7710RedeemerConstraintInspection {
  const required = uniqueAddresses(requiredRedeemers);

  if (!isHex(permissionContext) || permissionContext === "0x") {
    return emptyInspection(required, "Permission context is not non-empty hex.");
  }

  try {
    const environment = getSmartAccountsEnvironment(chainId);
    const redeemerEnforcer = normalizeAddress(
      environment.caveatEnforcers.RedeemerEnforcer
    );

    if (!redeemerEnforcer) {
      return emptyInspection(required, "RedeemerEnforcer is not configured.");
    }

    const redeemerEnforcerKey = redeemerEnforcer.toLowerCase();
    const delegations = decodeDelegations(permissionContext);
    const redeemerCaveats = delegations.flatMap((delegation) =>
      delegation.caveats.filter(
        (caveat) => caveat.enforcer.toLowerCase() === redeemerEnforcerKey
      )
    );
    const allowedRedeemers = uniqueAddresses(
      redeemerCaveats.flatMap((caveat) => decodeCaveatRedeemers(caveat))
    );
    const allowedKeys = new Set(
      allowedRedeemers.map((address) => address.toLowerCase())
    );
    const requiredKeys = new Set(required.map((address) => address.toLowerCase()));
    const acceptedRedeemers = allowedRedeemers.filter((address) =>
      requiredKeys.has(address.toLowerCase())
    );
    const missingRequiredRedeemers = required.filter(
      (address) => !allowedKeys.has(address.toLowerCase())
    );

    return {
      acceptedRedeemers,
      allowedRedeemers,
      decoded: true,
      delegationCount: delegations.length,
      error: null,
      hasAcceptedFacilitatorRedeemer: acceptedRedeemers.length > 0,
      hasAllRequiredRedeemers: missingRequiredRedeemers.length === 0,
      hasRedeemerEnforcer: redeemerCaveats.length > 0,
      missingRequiredRedeemers,
      redeemerCaveatCount: redeemerCaveats.length,
      redeemerEnforcer
    };
  } catch (error) {
    return emptyInspection(required, errorMessage(error));
  }
}
