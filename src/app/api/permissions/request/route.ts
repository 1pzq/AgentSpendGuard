import {
  getPermissionRecord,
  updatePermissionRecord
} from "@/server/permissions/store";
import { spendguardConfig } from "@/server/config/spendguard";
import type { AdvancedPermissionGrant } from "@/shared/types";
import {
  buildDashboardState,
  getDemoPhase,
  jsonError,
  jsonOk,
  setDemoPhase
} from "../../_lib/demoState";

function nowIso() {
  return new Date().toISOString();
}

type PermissionRequestBody = {
  advancedPermissionGrant?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isAddress(value: unknown): value is string {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function isHex(value: unknown): value is string {
  return typeof value === "string" && /^0x[a-fA-F0-9]*$/.test(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function lower(value: string | null | undefined) {
  return value ? value.toLowerCase() : null;
}

function isAdvancedPermissionGrant(value: unknown): value is AdvancedPermissionGrant {
  if (!isRecord(value)) return false;

  return (
    value.source === "metamask-erc7715" &&
    value.permissionType === "erc20-token-periodic" &&
    value.status === "granted" &&
    typeof value.chainId === "number" &&
    (value.from === null || isAddress(value.from)) &&
    isAddress(value.to) &&
    isAddress(value.sessionAccount) &&
    isHex(value.context) &&
    isAddress(value.delegationManager) &&
    Array.isArray(value.dependencies) &&
    Array.isArray(value.rules) &&
    isAddress(value.tokenAddress) &&
    value.tokenSymbol === spendguardConfig.token.symbol &&
    typeof value.tokenDecimals === "number" &&
    typeof value.periodAmountAtomic === "string" &&
    typeof value.periodDuration === "number" &&
    typeof value.startTime === "number" &&
    typeof value.expiry === "number" &&
    typeof value.isAdjustmentAllowed === "boolean" &&
    typeof value.requestedAt === "string" &&
    typeof value.grantedAt === "string" &&
    typeof value.expiresAt === "string"
  );
}

function validateGrant(grant: AdvancedPermissionGrant): string[] {
  const mismatches: string[] = [];
  const expectedPeriodDuration = spendguardConfig.policy.windowHours * 60 * 60;
  const expiresAt = Date.parse(grant.expiresAt);

  if (grant.chainId !== spendguardConfig.chain.id) mismatches.push("chainId");
  if (lower(grant.to) !== lower(grant.sessionAccount)) mismatches.push("sessionAccount");
  if (lower(grant.tokenAddress) !== lower(spendguardConfig.token.address)) {
    mismatches.push("tokenAddress");
  }
  if (grant.tokenDecimals !== spendguardConfig.token.decimals) {
    mismatches.push("tokenDecimals");
  }
  if (grant.periodAmountAtomic !== spendguardConfig.policy.maxSpendAtomic) {
    mismatches.push("periodAmountAtomic");
  }
  if (grant.periodDuration !== expectedPeriodDuration) {
    mismatches.push("periodDuration");
  }
  if (grant.isAdjustmentAllowed) mismatches.push("isAdjustmentAllowed");
  if (Number.isNaN(expiresAt) || expiresAt <= Date.now()) {
    mismatches.push("expiresAt");
  }
  if (grant.expiry <= Math.floor(Date.now() / 1000)) mismatches.push("expiry");

  return mismatches;
}

async function readBody(request: Request): Promise<PermissionRequestBody> {
  try {
    return (await request.json()) as PermissionRequestBody;
  } catch {
    return {};
  }
}

export async function POST(request: Request) {
  const body = await readBody(request);
  const permission = getPermissionRecord();

  if (getDemoPhase() === "initial" || !permission.wallet.eoa) {
    return jsonError(
      "WALLET_NOT_CONNECTED",
      "Connect a Base Sepolia wallet before requesting permission.",
      { status: 409 }
    );
  }

  if (permission.status === "revoked") {
    return jsonError(
      "PERMISSION_REVOKED",
      "Reset the demo before approving a revoked permission.",
      { status: 409 }
    );
  }

  if (!isAdvancedPermissionGrant(body.advancedPermissionGrant)) {
    return jsonError(
      "ADVANCED_PERMISSION_GRANT_REQUIRED",
      "Approve a real MetaMask Advanced Permission before activating this policy.",
      { status: 422 }
    );
  }

  const grant = body.advancedPermissionGrant;
  const mismatches = validateGrant(grant);

  if (mismatches.length > 0) {
    return jsonError(
      "ADVANCED_PERMISSION_GRANT_MISMATCH",
      "MetaMask Advanced Permission grant does not match the SpendGuard policy.",
      { status: 422 },
      { mismatches }
    );
  }

  if (
    isAddress(permission.wallet.eoa) &&
    isAddress(readString(grant.from)) &&
    lower(permission.wallet.eoa) !== lower(grant.from)
  ) {
    return jsonError(
      "ADVANCED_PERMISSION_WALLET_MISMATCH",
      "Advanced Permission grant was issued by a different wallet. Reconnect the granting wallet and retry.",
      { status: 409 }
    );
  }

  updatePermissionRecord({
    approvedAt: nowIso(),
    advancedPermissionGrant: grant,
    expiresAt: grant.expiresAt,
    mockSignature: null,
    revokedAt: null,
    revokedReason: null,
    status: "active",
    wallet: {
      ...permission.wallet,
      smartAccount: grant.from ?? permission.wallet.eoa,
      chain: spendguardConfig.chain.name
    }
  });
  setDemoPhase("permission_approved");

  return jsonOk({
    state: buildDashboardState()
  });
}
