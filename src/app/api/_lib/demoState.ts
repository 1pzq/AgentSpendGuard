import { spendguardConfig } from "@/server/config/spendguard";
import { listLedgerEntries } from "@/server/ledger/store";
import { getPermissionRecord } from "@/server/permissions/store";
import type {
  ApiError,
  ApiResponse,
  DashboardLedgerEntry,
  DashboardPolicyConfig,
  DashboardState,
  LedgerEntry,
  LedgerStatus,
  PaymentStatus,
  PermissionRecord,
  PolicyStatus,
  RelayerInfo,
  RelayerStatus,
  RevocationStatus,
  VeniceResultReport
} from "@/shared/types";
import { NextResponse } from "next/server";

type DemoPhase =
  | "initial"
  | "wallet_connected"
  | "permission_requested"
  | "permission_approved"
  | "running"
  | "run_completed"
  | "revoked";

const { policy } = spendguardConfig;

let demoPhase: DemoPhase = "initial";

type DemoPhaseGlobal = typeof globalThis & {
  __spendguardDemoPhase?: DemoPhase;
};

function demoPhaseGlobal(): DemoPhaseGlobal {
  return globalThis as DemoPhaseGlobal;
}

function currentDemoPhase(): DemoPhase {
  return demoPhaseGlobal().__spendguardDemoPhase ?? demoPhase;
}

function effectiveDemoPhase(permission: PermissionRecord): DemoPhase {
  const phase = currentDemoPhase();

  if (phase !== "initial") return phase;
  if (permission.status === "revoked") return "revoked";
  if (permission.spendCount > 0) return "run_completed";
  if (permission.status === "active" || permission.status === "fallback_local") {
    return "permission_approved";
  }

  return phase;
}

function atomicToDecimal(amountAtomic: string, decimals: number) {
  return Number(BigInt(amountAtomic)) / 10 ** decimals;
}

function dashboardPolicyConfig(permission: PermissionRecord): DashboardPolicyConfig {
  return {
    id: permission.policyId,
    service: permission.service,
    purpose: permission.purpose,
    token: permission.token,
    maxSpend: atomicToDecimal(permission.maxSpendAtomic, permission.tokenDecimals),
    pricePerCall: atomicToDecimal(permission.pricePerCallAtomic, permission.tokenDecimals),
    spent: atomicToDecimal(permission.spentAtomic, permission.tokenDecimals),
    windowHours: permission.windowHours,
    expiresAt: permission.expiresAt,
    allowedEndpoint: permission.allowedEndpoint,
    payTo: permission.payTo
  };
}

function ledgerStatus(entries: LedgerEntry[]): LedgerStatus {
  if (entries.length === 0) return "empty";
  if (entries.some((entry) => entry.status === "revoked")) return "closed";
  if (entries.some((entry) => entry.status === "blocked")) return "has_blocked";
  return "has_success";
}

function policyStatus(permission: PermissionRecord, entries: LedgerEntry[]): PolicyStatus {
  const phase = effectiveDemoPhase(permission);

  if (phase === "initial") return "draft";
  if (phase === "wallet_connected" || phase === "permission_requested") {
    return "ready_to_sign";
  }
  if (permission.status === "revoked") return "revoked";
  if (entries.some((entry) => entry.status === "blocked")) return "exhausted";
  if (permission.status === "active" || permission.status === "fallback_local") {
    return "active";
  }
  return "draft";
}

function permissionStatus(permission: PermissionRecord): DashboardState["permission"] {
  const phase = effectiveDemoPhase(permission);

  if (phase === "initial") return "not_requested";
  if (permission.status === "revoked") return "revoked";
  if (phase === "permission_requested") return "requested";
  if (phase === "wallet_connected") return "not_requested";
  if (permission.spendCount > 0) return "redeemed";
  if (permission.status === "active") return "approved";
  return permission.status;
}

function paymentStatus(entries: LedgerEntry[]): PaymentStatus {
  const latest = entries.find((entry) => entry.status !== "revoked");
  if (!latest) return "none";
  if (latest.status === "blocked") return "blocked";
  if (latest.status === "success" || latest.status === "paid_ai_failed") return "paid";
  return "none";
}

function relayerStatus(entries: LedgerEntry[]): RelayerStatus {
  const paidEntry = entries.find((entry) => entry.paymentReceipt?.oneShot);
  if (!paidEntry) return "not_used";
  return paidEntry.paymentReceipt?.oneShot?.status ?? "confirmed";
}

function revocationStatus(permission: PermissionRecord): RevocationStatus {
  return permission.status === "revoked" ? "revoked" : "available";
}

function relayerInfo(entries: LedgerEntry[]): RelayerInfo {
  const oneShot = entries.find((entry) => entry.paymentReceipt?.oneShot)?.paymentReceipt
    ?.oneShot;

  return {
    quoteId: oneShot?.quoteId ?? null,
    fee: oneShot?.fee ?? null,
    taskId: oneShot?.taskId ?? null,
    txHash: oneShot?.txHash ?? null
  };
}

function veniceResult(entries: LedgerEntry[]): VeniceResultReport | null {
  const brief = entries.find((entry) => entry.veniceRiskBrief)?.veniceRiskBrief;
  if (!brief) return null;

  return {
    title: brief.title,
    summary: brief.summary,
    findings: brief.findings
  };
}

function dashboardLedgerEntry(entry: LedgerEntry): DashboardLedgerEntry {
  return {
    time: entry.time,
    service:
      entry.status === "blocked"
        ? `${entry.service} second brief`
        : entry.status === "revoked"
          ? "Scoped permission"
          : entry.service,
    cost: entry.cost,
    status: entry.status
  };
}

function blockState(entries: LedgerEntry[]): DashboardState["block"] {
  const blockedEntry = entries.find((entry) => entry.status === "blocked");

  if (!blockedEntry) {
    return {
      attempted: false,
      reason: "Second paid action has not been requested."
    };
  }

  return {
    attempted: true,
    reason: blockedEntry.reason ?? "Blocked before payment: spend exceeds policy budget."
  };
}

function agentAction(
  permission: PermissionRecord,
  entries: LedgerEntry[]
): DashboardState["agentAction"] {
  if (effectiveDemoPhase(permission) === "running") return "running";

  const latest = entries[0];
  if (!latest) return "idle";
  if (latest.status === "blocked" || latest.status === "revoked") return "blocked";
  if (latest.status === "success") return "succeeded";
  if (latest.status === "paid_ai_failed") return "failed";
  return "idle";
}

export function setDemoPhase(phase: DemoPhase) {
  demoPhase = phase;
  demoPhaseGlobal().__spendguardDemoPhase = phase;
}

export function getDemoPhase() {
  return currentDemoPhase();
}

export function buildDashboardState(): DashboardState {
  const permission = getPermissionRecord();
  const entries = listLedgerEntries();
  const walletConnected = effectiveDemoPhase(permission) !== "initial";

  return {
    wallet: walletConnected ? "connected" : "disconnected",
    policy: policyStatus(permission, entries),
    permission: permissionStatus(permission),
    agentAction: agentAction(permission, entries),
    payment: paymentStatus(entries),
    relayer: relayerStatus(entries),
    ledger: ledgerStatus(entries),
    revocation: revocationStatus(permission),
    block: blockState(entries),
    walletInfo: walletConnected
      ? permission.wallet
      : {
          eoa: null,
          smartAccount: null,
          chain: policy.chainName
        },
    advancedPermissionGrant: permission.advancedPermissionGrant,
    policyConfig: dashboardPolicyConfig(permission),
    relayerInfo: relayerInfo(entries),
    veniceResult: veniceResult(entries),
    ledgerEntries: entries.map(dashboardLedgerEntry)
  };
}

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json<ApiResponse<T>>({ ok: true, data }, init);
}

export function jsonError(
  code: string,
  message: string,
  init: ResponseInit = { status: 400 },
  details?: Record<string, unknown>
) {
  const error: ApiError = { code, message };
  if (details) error.details = details;

  return NextResponse.json<ApiResponse<never>>(
    {
      ok: false,
      error
    },
    init
  );
}
