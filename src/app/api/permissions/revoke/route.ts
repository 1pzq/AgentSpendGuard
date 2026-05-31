import { revokePermissionForDemo } from "@/server/agent-runner/runAgentWithPermission";
import { getPermissionRecord } from "@/server/permissions/store";
import type { AdvancedPermissionGrant } from "@/shared/types";
import {
  buildDashboardState,
  getDemoPhase,
  jsonError,
  jsonOk,
  setDemoPhase
} from "../../_lib/demoState";

type RevokeSyncStatus = "missing" | "expired";

type DirectRevokeStatus =
  | "submitted"
  | "not_supported"
  | "rejected"
  | "failed"
  | "skipped_expired";

type RevokeRequestBody = {
  advancedPermissionGrant?: unknown;
  directRevokeStatus?: unknown;
  syncStatus?: unknown;
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

function isRevokeSyncStatus(value: unknown): value is RevokeSyncStatus {
  return value === "missing" || value === "expired";
}

function isDirectRevokeStatus(value: unknown): value is DirectRevokeStatus {
  return (
    value === "submitted" ||
    value === "not_supported" ||
    value === "rejected" ||
    value === "failed" ||
    value === "skipped_expired"
  );
}

function lower(value: string | null | undefined) {
  return value ? value.toLowerCase() : null;
}

function isAdvancedPermissionGrant(value: unknown): value is AdvancedPermissionGrant {
  if (!isRecord(value)) return false;

  return (
    value.source === "metamask-erc7715" &&
    value.permissionType === "erc20-token-periodic" &&
    (value.status === "granted" ||
      value.status === "revoked" ||
      value.status === "expired") &&
    typeof value.chainId === "number" &&
    (value.from === null || isAddress(value.from)) &&
    isAddress(value.to) &&
    isAddress(value.sessionAccount) &&
    isHex(value.context) &&
    isAddress(value.delegationManager) &&
    Array.isArray(value.dependencies) &&
    Array.isArray(value.rules) &&
    isAddress(value.tokenAddress) &&
    typeof value.periodAmountAtomic === "string" &&
    typeof value.periodDuration === "number" &&
    typeof value.expiry === "number" &&
    typeof value.expiresAt === "string"
  );
}

async function readBody(request: Request): Promise<RevokeRequestBody> {
  try {
    return (await request.json()) as RevokeRequestBody;
  } catch {
    return {};
  }
}

export async function POST(request: Request) {
  const body = await readBody(request);
  const permission = getPermissionRecord();

  if (
    getDemoPhase() === "initial" ||
    permission.status === "not_requested" ||
    !permission.wallet.eoa
  ) {
    return jsonError(
      "PERMISSION_NOT_REQUESTED",
      "Connect a wallet before revoking permission.",
      { status: 409 }
    );
  }

  if (permission.status === "revoked") {
    return jsonError(
      "PERMISSION_ALREADY_REVOKED",
      "Permission is already revoked.",
      { status: 409 }
    );
  }

  if (!permission.advancedPermissionGrant) {
    return jsonError(
      "ADVANCED_PERMISSION_GRANT_NOT_FOUND",
      "No stored MetaMask Advanced Permission grant exists to sync.",
      { status: 409 }
    );
  }

  if (!isRevokeSyncStatus(body.syncStatus)) {
    return jsonError(
      "REVOKE_SYNC_REQUIRED",
      "MetaMask must stop reporting the Advanced Permission grant before the local policy can be closed.",
      { status: 409 }
    );
  }

  if (!isAdvancedPermissionGrant(body.advancedPermissionGrant)) {
    return jsonError(
      "INVALID_ADVANCED_PERMISSION_GRANT",
      "Revoke sync requires the stored MetaMask Advanced Permission grant.",
      { status: 422 }
    );
  }

  if (
    lower(body.advancedPermissionGrant.context) !==
      lower(permission.advancedPermissionGrant.context) ||
    lower(body.advancedPermissionGrant.delegationManager) !==
      lower(permission.advancedPermissionGrant.delegationManager)
  ) {
    return jsonError(
      "ADVANCED_PERMISSION_GRANT_MISMATCH",
      "The synced grant does not match the stored Advanced Permission.",
      { status: 409 }
    );
  }

  const nextGrant: AdvancedPermissionGrant = {
    ...permission.advancedPermissionGrant,
    ...body.advancedPermissionGrant,
    status: body.syncStatus === "expired" ? "expired" : "revoked"
  };
  const directRevokeStatus = isDirectRevokeStatus(body.directRevokeStatus)
    ? body.directRevokeStatus
    : "failed";
  const reason =
    body.syncStatus === "expired"
      ? "MetaMask Advanced Permission expired"
      : directRevokeStatus === "submitted"
        ? "MetaMask direct Advanced Permission revoke confirmed by wallet sync"
        : `MetaMask no longer reports the Advanced Permission grant after ${directRevokeStatus} revoke path`;
  const result = revokePermissionForDemo(reason, nextGrant);
  setDemoPhase("revoked");

  return jsonOk({
    result,
    state: buildDashboardState()
  });
}
