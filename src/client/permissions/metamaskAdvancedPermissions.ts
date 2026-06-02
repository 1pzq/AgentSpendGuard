"use client";

import { getSmartAccountsEnvironment } from "@metamask/smart-accounts-kit";
import {
  erc7715ProviderActions,
  type GetGrantedExecutionPermissionsResult,
  type PermissionRequestParameter
} from "@metamask/smart-accounts-kit/actions";
import { ERC20PeriodTransferEnforcer } from "@metamask/smart-accounts-kit/contracts";
import {
  decodeDelegations,
  hashDelegation
} from "@metamask/smart-accounts-kit/utils";
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  isHex
} from "viem";
import type { Address, Hex } from "viem";
import { baseSepolia } from "viem/chains";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_PUBLIC_RPC_URL,
  BASE_SEPOLIA_USDC
} from "@/shared/chain";
import type {
  AdvancedPermissionGrant,
  AtomicAmount,
  OnchainPermissionAvailableAmount
} from "@/shared/types";
import {
  detectMetaMaskProvider,
  ensureBaseSepolia,
  getCurrentWalletState,
  WalletConnectionError,
  WALLET_ERROR_CODES,
  type EthereumProvider
} from "@/client/wallet/metamask";

const SESSION_KEY_STORAGE_KEY = "agent-spendguard:erc7715-session-private-key";
const PERIOD_DURATION_SECONDS = 24 * 60 * 60;
const JUSTIFICATION =
  "Allow Agent SpendGuard to spend up to 1 USDC per 24h for x402 DeepSeek risk brief calls.";

type GrantedPermission = GetGrantedExecutionPermissionsResult[number];

type RequestAdvancedSpendPermissionInput = {
  maxSpendAtomic: AtomicAmount;
  walletAddress: string | null;
};

type SyncAdvancedSpendPermissionResult =
  | {
      status: "active";
      matchedGrant: AdvancedPermissionGrant;
    }
  | {
      status: "missing" | "expired";
      matchedGrant: null;
    };

type DirectRevokeStatus =
  | "submitted"
  | "not_supported"
  | "rejected"
  | "failed"
  | "skipped_expired";

export type RevokeAdvancedSpendPermissionStage =
  | "requesting_wallet_revoke"
  | "checking_wallet_state";

export type RevokeAdvancedSpendPermissionResult =
  | {
      status: "revoked" | "expired";
      syncStatus: "missing" | "expired";
      directRevokeStatus: DirectRevokeStatus;
      directRevokeMessage: string | null;
      advancedPermissionGrant: AdvancedPermissionGrant;
    }
  | {
      status: "active";
      directRevokeStatus: DirectRevokeStatus;
      directRevokeMessage: string | null;
      matchedGrant: AdvancedPermissionGrant;
    };

type RevokeAdvancedSpendPermissionOptions = {
  onStage?: (stage: RevokeAdvancedSpendPermissionStage) => void;
};

export class AdvancedPermissionError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "AdvancedPermissionError";
    this.cause = cause;
  }
}

function normalizeAdvancedPermissionRequestError(error: unknown) {
  const message = error instanceof Error ? error.message : null;
  const normalized = message?.toLowerCase() ?? "";

  if (
    normalized.includes("data.justification") &&
    normalized.includes("invalid characters")
  ) {
    return "MetaMask 拒绝了授权说明字段。当前 MetaMask 对 Advanced Permission justification 有字符限制，请刷新页面后重新批准。";
  }

  return message
    ? `MetaMask Advanced Permission 请求失败：${message}`
    : "MetaMask Advanced Permission 请求失败。";
}

function assertBrowserStorage() {
  if (typeof window === "undefined" || !window.localStorage) {
    throw new AdvancedPermissionError(
      "MetaMask Advanced Permissions 需要浏览器 localStorage 来保存演示会话账户。"
    );
  }
}

function lowerHex(value: string | null | undefined) {
  return value ? value.toLowerCase() : null;
}

function isAddressLike(value: string | null | undefined): value is Address {
  return !!value && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function isHexLike(value: string | null | undefined): value is Hex {
  return !!value && /^0x[a-fA-F0-9]*$/.test(value);
}

function formatExactAtomicAmount(
  amountAtomic: string,
  decimals: number,
  token: string
) {
  const unit = BigInt(10) ** BigInt(decimals);
  const amount = BigInt(amountAtomic);
  const whole = amount / unit;
  const fraction = (amount % unit).toString().padStart(decimals, "0");
  const trimmedFraction = fraction.replace(/0+$/, "");
  const displayFraction = (trimmedFraction || "00").padEnd(2, "0");

  return `${whole.toString()}.${displayFraction} ${token}`;
}

function onchainPermissionResult(input: {
  availableAmountAtomic?: string | null;
  currentPeriod?: string | null;
  delegationHash?: string | null;
  enforcer?: string | null;
  error?: string | null;
  grant: AdvancedPermissionGrant;
  isNewPeriod?: boolean | null;
  status: OnchainPermissionAvailableAmount["status"];
}): OnchainPermissionAvailableAmount {
  const availableAmountAtomic = input.availableAmountAtomic ?? null;

  return {
    availableAmount:
      availableAmountAtomic === null
        ? input.status === "querying"
          ? "查询中"
          : input.status === "not_queried"
            ? "待查询"
            : "不可用"
        : formatExactAtomicAmount(
            availableAmountAtomic,
            input.grant.tokenDecimals,
            input.grant.tokenSymbol
          ),
    availableAmountAtomic,
    currentPeriod: input.currentPeriod ?? null,
    delegationHash: input.delegationHash ?? null,
    enforcer: input.enforcer ?? null,
    error: input.error ?? null,
    isNewPeriod: input.isNewPeriod ?? null,
    source: "metamask-period-transfer-enforcer",
    status: input.status,
    token: input.grant.tokenSymbol,
    tokenAddress: input.grant.tokenAddress,
    tokenDecimals: input.grant.tokenDecimals,
    updatedAt: new Date().toISOString()
  };
}

function normalizeUnknown(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(normalizeUnknown);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      normalizeUnknown(item)
    ])
  );
}

function errorCode(error: unknown): number | string | null {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "number" || typeof code === "string" ? code : null;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (!error || typeof error !== "object" || !("message" in error)) return null;

  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : null;
}

function isUnsupportedRevokeError(error: unknown) {
  const code = errorCode(error);
  const message = errorMessage(error)?.toLowerCase() ?? "";

  return (
    code === -32601 ||
    code === "-32601" ||
    code === 4200 ||
    code === "4200" ||
    message.includes("method not found") ||
    message.includes("not supported") ||
    message.includes("unsupported") ||
    message.includes("does not exist")
  );
}

function isUserRejectedError(error: unknown) {
  const code = errorCode(error);
  return code === 4001 || code === "4001";
}

function isInvalidParamsError(error: unknown) {
  const code = errorCode(error);
  const message = errorMessage(error)?.toLowerCase() ?? "";

  return (
    code === -32602 ||
    code === "-32602" ||
    message.includes("invalid params") ||
    message.includes("invalid parameters")
  );
}

function getOrCreateSessionAccount() {
  assertBrowserStorage();

  const existingPrivateKey = window.localStorage.getItem(SESSION_KEY_STORAGE_KEY);
  const privateKey = isHexLike(existingPrivateKey)
    ? existingPrivateKey
    : generatePrivateKey();

  if (!existingPrivateKey) {
    window.localStorage.setItem(SESSION_KEY_STORAGE_KEY, privateKey);
  }

  return privateKeyToAccount(privateKey);
}

export function getStoredAdvancedPermissionSessionAccount() {
  assertBrowserStorage();

  const privateKey = window.localStorage.getItem(SESSION_KEY_STORAGE_KEY);
  if (!isHexLike(privateKey)) {
    throw new AdvancedPermissionError(
      "未找到已保存的 Advanced Permission 会话账户。运行 ERC-7710 dry run 前请重新授权。"
    );
  }

  return privateKeyToAccount(privateKey);
}

function createPermissionClient(provider: EthereumProvider) {
  return createWalletClient({
    chain: baseSepolia,
    transport: custom(provider)
  }).extend(erc7715ProviderActions());
}

function createReadonlyBaseSepoliaClient() {
  return createPublicClient({
    chain: baseSepolia,
    transport: http(BASE_SEPOLIA_PUBLIC_RPC_URL)
  });
}

function supportsPeriodicUsdcPermission(
  supported: Awaited<ReturnType<ReturnType<typeof createPermissionClient>["getSupportedExecutionPermissions"]>>
) {
  const info = supported["erc20-token-periodic"];
  return !!info && info.chainIds.includes(BASE_SEPOLIA_CHAIN_ID);
}

async function assertAdvancedPermissionsSupported(
  client: ReturnType<typeof createPermissionClient>
) {
  try {
    const supported = await client.getSupportedExecutionPermissions();

    if (!supportsPeriodicUsdcPermission(supported)) {
      throw new AdvancedPermissionError(
        "MetaMask 未报告支持 Base Sepolia 上的 ERC-20 周期性 Advanced Permission。"
      );
    }
  } catch (error) {
    if (error instanceof AdvancedPermissionError) throw error;

    throw new AdvancedPermissionError(
      "当前钱包版本不可用 MetaMask Advanced Permissions。请使用支持 ERC-7715 Advanced Permissions 的 MetaMask 版本。",
      error
    );
  }
}

function permissionData(grant: GrantedPermission) {
  return grant.permission.data as {
    periodAmount?: bigint | string;
    periodDuration?: number;
    startTime?: number;
    tokenAddress?: string;
  };
}

function normalizeGrantedPermission({
  expiry,
  grant,
  requestedAt,
  sessionAccount
}: {
  expiry: number;
  grant: GrantedPermission;
  requestedAt: string;
  sessionAccount: Address;
}): AdvancedPermissionGrant {
  const data = permissionData(grant);
  const startTime = data.startTime ?? Math.floor(Date.parse(requestedAt) / 1000);
  const periodAmount =
    typeof data.periodAmount === "bigint"
      ? data.periodAmount.toString()
      : typeof data.periodAmount === "string"
        ? data.periodAmount
        : "0";
  const tokenAddress =
    typeof data.tokenAddress === "string"
      ? data.tokenAddress
      : BASE_SEPOLIA_USDC.address;
  const periodDuration =
    typeof data.periodDuration === "number"
      ? data.periodDuration
      : PERIOD_DURATION_SECONDS;

  return {
    source: "metamask-erc7715",
    permissionType: "erc20-token-periodic",
    status: expiry <= Math.floor(Date.now() / 1000) ? "expired" : "granted",
    chainId: grant.chainId,
    from: grant.from ?? null,
    to: grant.to,
    sessionAccount,
    context: grant.context,
    delegationManager: grant.delegationManager,
    dependencies: (grant.dependencies ?? []).map((dependency) => ({
      factory: dependency.factory,
      factoryData: dependency.factoryData
    })),
    rules: Array.isArray(grant.rules) ? normalizeUnknown(grant.rules) as unknown[] : [],
    tokenAddress,
    tokenSymbol: BASE_SEPOLIA_USDC.symbol,
    tokenDecimals: BASE_SEPOLIA_USDC.decimals,
    periodAmountAtomic: periodAmount,
    periodDuration,
    startTime,
    expiry,
    isAdjustmentAllowed: grant.permission.isAdjustmentAllowed,
    requestedAt,
    grantedAt: new Date().toISOString(),
    expiresAt: new Date(expiry * 1000).toISOString(),
    rawGrant: normalizeUnknown(grant)
  };
}

function grantMatchesStoredPermission(
  grant: GrantedPermission,
  stored: AdvancedPermissionGrant
) {
  const data = permissionData(grant);
  const periodAmount =
    typeof data.periodAmount === "bigint"
      ? data.periodAmount.toString()
      : typeof data.periodAmount === "string"
        ? data.periodAmount
        : null;

  if (
    lowerHex(grant.context) === lowerHex(stored.context) &&
    lowerHex(grant.delegationManager) === lowerHex(stored.delegationManager)
  ) {
    return true;
  }

  return (
    grant.chainId === stored.chainId &&
    lowerHex(grant.from ?? null) === lowerHex(stored.from) &&
    lowerHex(grant.to) === lowerHex(stored.to) &&
    grant.permission.type === stored.permissionType &&
    lowerHex(typeof data.tokenAddress === "string" ? data.tokenAddress : null) ===
      lowerHex(stored.tokenAddress) &&
    periodAmount === stored.periodAmountAtomic
  );
}

function pickRequestedGrant(
  grants: GetGrantedExecutionPermissionsResult,
  sessionAccount: Address
) {
  return (
    grants.find(
      (grant) =>
        grant.permission.type === "erc20-token-periodic" &&
        lowerHex(grant.to) === lowerHex(sessionAccount)
    ) ?? grants[0]
  );
}

async function readConnectedBaseSepoliaAccount(provider: EthereumProvider) {
  await ensureBaseSepolia(provider);
  const walletState = await getCurrentWalletState();

  if (!isAddressLike(walletState.account)) {
    throw new WalletConnectionError(
      WALLET_ERROR_CODES.UNKNOWN_WALLET_ERROR,
      "MetaMask 没有返回已连接的 Base Sepolia 账户。"
    );
  }

  return walletState.account;
}

async function requestWalletExecutionPermissionRevoke({
  provider,
  stored
}: {
  provider: EthereumProvider;
  stored: AdvancedPermissionGrant;
}): Promise<{
  status: DirectRevokeStatus;
  message: string | null;
}> {
  try {
    try {
      await provider.request({
        method: "wallet_revokeExecutionPermission",
        params: {
          permissionContext: stored.context
        }
      });
    } catch (error) {
      if (!isInvalidParamsError(error)) throw error;

      await provider.request({
        method: "wallet_revokeExecutionPermission",
        params: [
          {
            permissionContext: stored.context
          }
        ]
      });
    }

    return {
      status: "submitted",
      message: null
    };
  } catch (error) {
    if (isUnsupportedRevokeError(error)) {
      return {
        status: "not_supported",
        message:
          "当前 MetaMask 不支持从此 dapp 会话直接撤销 ERC-7715。"
      };
    }

    if (isUserRejectedError(error)) {
      return {
        status: "rejected",
        message: "用户已取消 MetaMask 直接撤销。"
      };
    }

    return {
      status: "failed",
      message:
        errorMessage(error) ??
        "MetaMask 直接撤销在钱包状态验证前失败。"
    };
  }
}

function delay(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export async function requestAdvancedSpendPermission({
  maxSpendAtomic,
  walletAddress
}: RequestAdvancedSpendPermissionInput): Promise<AdvancedPermissionGrant> {
  const provider = detectMetaMaskProvider();
  const account = await readConnectedBaseSepoliaAccount(provider);

  if (isAddressLike(walletAddress) && lowerHex(walletAddress) !== lowerHex(account)) {
    throw new AdvancedPermissionError(
      "权限批准前，已连接的 MetaMask 账户发生变化。请重新连接后重试。"
    );
  }

  const client = createPermissionClient(provider);
  await assertAdvancedPermissionsSupported(client);

  const sessionAccount = getOrCreateSessionAccount();
  const now = Math.floor(Date.now() / 1000);
  const expiry = now + PERIOD_DURATION_SECONDS;
  const requestedAt = new Date(now * 1000).toISOString();
  const request = [
    {
      chainId: BASE_SEPOLIA_CHAIN_ID,
      expiry,
      from: account,
      to: sessionAccount.address,
      permission: {
        type: "erc20-token-periodic",
        data: {
          tokenAddress: BASE_SEPOLIA_USDC.address as Address,
          periodAmount: BigInt(maxSpendAtomic),
          periodDuration: PERIOD_DURATION_SECONDS,
          startTime: now,
          justification: JUSTIFICATION
        },
        isAdjustmentAllowed: false
      }
    }
  ] satisfies PermissionRequestParameter[];

  try {
    const grants = await client.requestExecutionPermissions(request);
    const grant = pickRequestedGrant(grants, sessionAccount.address);

    if (!grant || grant.permission.type !== "erc20-token-periodic") {
      throw new AdvancedPermissionError(
        "MetaMask 没有返回请求的 ERC-20 周期性权限授权。"
      );
    }

    return normalizeGrantedPermission({
      expiry,
      grant,
      requestedAt,
      sessionAccount: sessionAccount.address
    });
  } catch (error) {
    if (error instanceof AdvancedPermissionError) throw error;

    throw new AdvancedPermissionError(
      normalizeAdvancedPermissionRequestError(error),
      error
    );
  }
}

export async function syncAdvancedSpendPermission(
  stored: AdvancedPermissionGrant
): Promise<SyncAdvancedSpendPermissionResult> {
  if (stored.expiry <= Math.floor(Date.now() / 1000)) {
    return {
      status: "expired",
      matchedGrant: null
    };
  }

  const provider = detectMetaMaskProvider();
  const account = await readConnectedBaseSepoliaAccount(provider);

  if (
    isAddressLike(stored.from) &&
    lowerHex(account) !== lowerHex(stored.from)
  ) {
    throw new AdvancedPermissionError(
      "已连接的 MetaMask 账户与保存的 Advanced Permission 授权不匹配。同步撤销前请重新连接授权账户。"
    );
  }

  const client = createPermissionClient(provider);
  const grants = await client.getGrantedExecutionPermissions();
  const grant = grants.find((item) => grantMatchesStoredPermission(item, stored));

  if (!grant) {
    return {
      status: "missing",
      matchedGrant: null
    };
  }

  return {
    status: "active",
    matchedGrant: normalizeGrantedPermission({
      expiry: stored.expiry,
      grant,
      requestedAt: stored.requestedAt,
      sessionAccount: stored.sessionAccount as Address
    })
  };
}

export async function readAdvancedPermissionOnchainAvailableAmount(
  stored: AdvancedPermissionGrant
): Promise<OnchainPermissionAvailableAmount> {
  if (stored.status !== "granted" || stored.expiry <= Math.floor(Date.now() / 1000)) {
    return onchainPermissionResult({
      error: "Advanced Permission 已过期或未处于 granted 状态。",
      grant: stored,
      status: "not_applicable"
    });
  }

  if (stored.chainId !== BASE_SEPOLIA_CHAIN_ID) {
    return onchainPermissionResult({
      error: "Advanced Permission 不在 Base Sepolia 上。",
      grant: stored,
      status: "not_applicable"
    });
  }

  if (!isHex(stored.context) || stored.context === "0x") {
    return onchainPermissionResult({
      error: "保存的 Advanced Permission context 不是有效 hex。",
      grant: stored,
      status: "unavailable"
    });
  }

  const environment = getSmartAccountsEnvironment(BASE_SEPOLIA_CHAIN_ID);
  const enforcer = environment.caveatEnforcers.ERC20PeriodTransferEnforcer;

  if (!isAddressLike(enforcer)) {
    return onchainPermissionResult({
      error: "Smart Accounts environment 未提供 ERC20PeriodTransferEnforcer。",
      grant: stored,
      status: "unavailable"
    });
  }

  try {
    const delegations = decodeDelegations(stored.context);
    const parentDelegation = delegations[0];

    if (!parentDelegation) {
      return onchainPermissionResult({
        error: "保存的 Advanced Permission context 未包含 parent delegation。",
        enforcer,
        grant: stored,
        status: "unavailable"
      });
    }

    const periodCaveat = parentDelegation.caveats.find(
      (caveat) => lowerHex(caveat.enforcer) === lowerHex(enforcer)
    );
    const delegationHash = hashDelegation(parentDelegation);

    if (!periodCaveat) {
      return onchainPermissionResult({
        delegationHash,
        enforcer,
        error: "parent delegation 未包含 ERC20PeriodTransferEnforcer caveat。",
        grant: stored,
        status: "unavailable"
      });
    }

    const result = await ERC20PeriodTransferEnforcer.read.getAvailableAmount({
      client: createReadonlyBaseSepoliaClient(),
      contractAddress: enforcer,
      delegationHash,
      delegationManager: stored.delegationManager as Address,
      terms: periodCaveat.terms
    });

    return onchainPermissionResult({
      availableAmountAtomic: result.availableAmount.toString(),
      currentPeriod: result.currentPeriod.toString(),
      delegationHash,
      enforcer,
      grant: stored,
      isNewPeriod: result.isNewPeriod,
      status: "available"
    });
  } catch (error) {
    return onchainPermissionResult({
      enforcer,
      error:
        error instanceof Error
          ? error.message
          : "链上 Advanced Permission 可用额度查询失败。",
      grant: stored,
      status: "error"
    });
  }
}

export async function revokeAdvancedSpendPermission(
  stored: AdvancedPermissionGrant,
  options: RevokeAdvancedSpendPermissionOptions = {}
): Promise<RevokeAdvancedSpendPermissionResult> {
  if (stored.expiry <= Math.floor(Date.now() / 1000)) {
    return {
      status: "expired",
      syncStatus: "expired",
      directRevokeStatus: "skipped_expired",
      directRevokeMessage: null,
      advancedPermissionGrant: {
        ...stored,
        status: "expired"
      }
    };
  }

  const provider = detectMetaMaskProvider();
  const account = await readConnectedBaseSepoliaAccount(provider);

  if (
    isAddressLike(stored.from) &&
    lowerHex(account) !== lowerHex(stored.from)
  ) {
    throw new AdvancedPermissionError(
      "已连接的 MetaMask 账户与保存的 Advanced Permission 授权不匹配。撤销前请重新连接授权账户。"
    );
  }

  options.onStage?.("requesting_wallet_revoke");
  const directRevoke = await requestWalletExecutionPermissionRevoke({
    provider,
    stored
  });

  options.onStage?.("checking_wallet_state");
  let syncResult = await syncAdvancedSpendPermission(stored);

  if (directRevoke.status === "submitted" && syncResult.status === "active") {
    await delay(750);
    syncResult = await syncAdvancedSpendPermission(stored);
  }

  if (syncResult.status === "active") {
    return {
      status: "active",
      directRevokeStatus: directRevoke.status,
      directRevokeMessage: directRevoke.message,
      matchedGrant: syncResult.matchedGrant
    };
  }

  return {
    status: syncResult.status === "expired" ? "expired" : "revoked",
    syncStatus: syncResult.status,
    directRevokeStatus: directRevoke.status,
    directRevokeMessage: directRevoke.message,
    advancedPermissionGrant: {
      ...stored,
      status: syncResult.status === "expired" ? "expired" : "revoked"
    }
  };
}
