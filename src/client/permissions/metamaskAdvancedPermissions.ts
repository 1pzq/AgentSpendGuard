"use client";

import {
  erc7715ProviderActions,
  type GetGrantedExecutionPermissionsResult,
  type PermissionRequestParameter
} from "@metamask/smart-accounts-kit/actions";
import { createWalletClient, custom } from "viem";
import type { Address, Hex } from "viem";
import { baseSepolia } from "viem/chains";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC
} from "@/shared/chain";
import type { AdvancedPermissionGrant, AtomicAmount } from "@/shared/types";
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

function assertBrowserStorage() {
  if (typeof window === "undefined" || !window.localStorage) {
    throw new AdvancedPermissionError(
      "MetaMask Advanced Permissions require browser local storage for the demo session account."
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
      "Stored Advanced Permission session account was not found. Approve the permission again before running the ERC-7710 dry run."
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
        "MetaMask does not report ERC-20 periodic Advanced Permission support for Base Sepolia."
      );
    }
  } catch (error) {
    if (error instanceof AdvancedPermissionError) throw error;

    throw new AdvancedPermissionError(
      "MetaMask Advanced Permissions are unavailable in this wallet version. Use a MetaMask build that supports ERC-7715 Advanced Permissions.",
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
      "MetaMask did not return a connected Base Sepolia account."
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
          "MetaMask does not support direct ERC-7715 revoke from this dapp session."
      };
    }

    if (isUserRejectedError(error)) {
      return {
        status: "rejected",
        message: "MetaMask direct revoke was cancelled by the user."
      };
    }

    return {
      status: "failed",
      message:
        errorMessage(error) ??
        "MetaMask direct revoke failed before the wallet state could be verified."
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
      "Connected MetaMask account changed before permission approval. Reconnect and retry."
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
        "MetaMask did not return the requested ERC-20 periodic permission grant."
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
      error instanceof Error
        ? `MetaMask Advanced Permission request failed: ${error.message}`
        : "MetaMask Advanced Permission request failed.",
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
      "Connected MetaMask account does not match the stored Advanced Permission grant. Reconnect the granting account before syncing revoke."
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
      "Connected MetaMask account does not match the stored Advanced Permission grant. Reconnect the granting account before revoking."
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
