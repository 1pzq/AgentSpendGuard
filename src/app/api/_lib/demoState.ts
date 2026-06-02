import { spendguardConfig } from "@/server/config/spendguard";
import { getCurrentAgentSpendDecision } from "@/server/agent-runner/agentSpendDecisionStore";
import { listLedgerEntries } from "@/server/ledger/store";
import { getPermissionRecord } from "@/server/permissions/store";
import type {
  AgentSpendDecision,
  ApiError,
  ApiResponse,
  DashboardAccounting,
  DashboardAgentSpendDecision,
  DashboardLedgerEntry,
  DashboardPolicyConfig,
  DashboardState,
  Erc7710Proof,
  LedgerEntry,
  LedgerStatus,
  OnchainPermissionAvailableAmount,
  OneShotPaymentTimeline,
  PaymentStatus,
  PermissionRecord,
  PolicyStatus,
  RelayerInfo,
  RelayerStatus,
  RevocationStatus,
  VeniceResultReport,
  X402Evidence
} from "@/shared/types";
import { buildErc7710ProofFromGrant } from "@/shared/x402/erc7710DelegationInspector";
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

function atomicBigInt(amountAtomic: string) {
  return /^\d+$/.test(amountAtomic) ? BigInt(amountAtomic) : BigInt(0);
}

function formatAtomicAmount(amountAtomic: string, decimals: number, token: string) {
  const unit = BigInt(10) ** BigInt(decimals);
  const amount = atomicBigInt(amountAtomic);
  const whole = amount / unit;
  const fraction = (amount % unit).toString().padStart(decimals, "0");
  const cents = fraction.slice(0, 2).padEnd(2, "0");

  return `${whole.toString()}.${cents} ${token}`;
}

function formatExactAtomicAmount(
  amountAtomic: string,
  decimals: number,
  token: string
) {
  const unit = BigInt(10) ** BigInt(decimals);
  const amount = atomicBigInt(amountAtomic);
  const whole = amount / unit;
  const fraction = (amount % unit).toString().padStart(decimals, "0");
  const trimmedFraction = fraction.replace(/0+$/, "");
  const displayFraction = (trimmedFraction || "00").padEnd(2, "0");

  return `${whole.toString()}.${displayFraction} ${token}`;
}

function validAtomicAmount(value: string | null | undefined): value is string {
  return typeof value === "string" && /^\d+$/.test(value);
}

function parseAtomicFeeLabel(fee: string | null | undefined, token: string) {
  const match = fee?.match(/^(\d+) atomic ([A-Z0-9]+)$/);

  if (!match) return null;
  if (match[2] !== token) return null;

  return match[1];
}

function oneShotFeeAtomic(
  oneShot: OneShotPaymentTimeline | null | undefined,
  token: string
) {
  if (validAtomicAmount(oneShot?.feeAtomic)) return oneShot.feeAtomic;
  return parseAtomicFeeLabel(oneShot?.fee, token);
}

function sumAtomicAmounts(a: string | null | undefined, b: string | null | undefined) {
  if (!validAtomicAmount(a) || !validAtomicAmount(b)) return null;
  return (BigInt(a) + BigInt(b)).toString();
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
  if (permission.remainingSpendAtomic === "0") return "exhausted";
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
  const feeAtomic = oneShotFeeAtomic(oneShot, spendguardConfig.token.symbol);

  return {
    mode: spendguardConfig.oneShot.mode,
    quoteId: oneShot?.quoteId ?? null,
    fee: oneShot?.fee ?? null,
    feeAtomic,
    feeCollector: oneShot?.feeCollector ?? null,
    taskId: oneShot?.taskId ?? null,
    totalWalletDebitAtomic:
      oneShot?.totalWalletDebitAtomic ??
      sumAtomicAmounts(
        entries.find((entry) => entry.paymentReceipt?.oneShot)?.amountAtomic,
        feeAtomic
      ),
    txHash: oneShot?.txHash ?? null
  };
}

function paymentRequirementEntry(entries: LedgerEntry[]) {
  return entries.find((entry) => entry.paymentRequirement);
}

function successfulPaymentEntry(entries: LedgerEntry[]) {
  return entries.find(
    (entry) =>
      (entry.status === "success" || entry.status === "paid_ai_failed") &&
      entry.paymentRequirement &&
      entry.paymentReceipt
  );
}

function dashboardX402Evidence(
  permission: PermissionRecord,
  entries: LedgerEntry[]
): X402Evidence {
  const latestEntry = entries[0] ?? null;
  const paidEntry = successfulPaymentEntry(entries);
  const blockedEntry =
    latestEntry?.status === "blocked"
      ? latestEntry
      : entries.find((entry) => entry.status === "blocked");
  const requirementEntry =
    latestEntry?.status === "blocked" ? null : paidEntry ?? paymentRequirementEntry(entries);
  const requirement = requirementEntry?.paymentRequirement ?? null;
  const receipt = paidEntry?.paymentReceipt ?? null;
  const amountAtomic =
    latestEntry?.status === "blocked"
      ? latestEntry.amountAtomic
      : requirement?.amountAtomic ??
        (blockedEntry?.amountAtomic || permission.pricePerCallAtomic);
  const token = requirement?.token ?? permission.token;
  const tokenDecimals = requirement?.tokenDecimals ?? permission.tokenDecimals;
  const asset = requirement?.asset ?? spendguardConfig.token.address;
  const network =
    requirement?.network ?? `eip155:${requirement?.chainId ?? permission.chainId}`;
  const endpoint =
    requirement?.endpoint ??
    spendguardConfig.erc7710PaidPoc.path ??
    permission.allowedEndpoint;
  const method = requirement?.method ?? permission.allowedMethods[0] ?? "POST";
  const challengeStatus: X402Evidence["challengeStatus"] =
    latestEntry?.status === "blocked"
      ? "blocked_before_payment"
      : paidEntry
        ? "settled"
        : "idle";
  const paymentHeaderStatus: X402Evidence["paymentHeaderStatus"] =
    latestEntry?.status === "blocked"
      ? "not_submitted"
      : paidEntry
        ? "settled"
        : "not_applicable";

  return {
    challengeStatus,
    paymentHeaderStatus,
    protectedResource: endpoint,
    selectedRequirement: {
      id: requirement?.id ?? null,
      endpoint,
      method,
      scheme: requirement?.scheme ?? "exact",
      network,
      asset,
      assetLabel: `${token} (${asset})`,
      amountAtomic,
      token,
      tokenDecimals,
      payTo: requirement?.payTo ?? permission.payTo,
      assetTransferMethod:
        requirement?.assetTransferMethod ??
        (spendguardConfig.erc7710PaidPoc.enabled ? "erc7710" : "unknown"),
      maxTimeoutSeconds: requirement?.maxTimeoutSeconds ?? null,
      source: requirement ? "ledger" : "policy_projection"
    },
    paidRequest: {
      submitted: latestEntry?.status === "blocked" ? false : !!paidEntry,
      settled:
        latestEntry?.status === "blocked"
          ? false
          : !!paidEntry && receipt?.status === "paid",
      txHash: latestEntry?.status === "blocked" ? null : receipt?.txHash ?? null
    },
    updatedAt:
      receipt?.paidAt ?? requirement?.createdAt ?? blockedEntry?.occurredAt ?? null
  };
}

function dashboardErc7710Proof(
  permission: PermissionRecord,
  entries: LedgerEntry[]
): Erc7710Proof {
  const latestEntry = entries[0] ?? null;
  const paidEntry = successfulPaymentEntry(entries);
  const receipt = paidEntry?.paymentReceipt ?? null;
  const payloadProof =
    latestEntry?.status === "blocked" ? null : receipt?.erc7710Proof ?? null;
  const grant = permission.advancedPermissionGrant;
  const status: Erc7710Proof["status"] = !grant
    ? "not_ready"
    : latestEntry?.status === "blocked"
      ? "blocked"
      : paidEntry
        ? "settled"
        : "grant_ready";
  const validationMessage =
    status === "blocked"
      ? "SpendGuard 已在提交任何 ERC-7710 payment payload 前阻断超预算请求。"
      : status === "settled"
        ? "服务端在记录付费 x402 结算前，已验证 ERC-7710 payload 与保存的 Advanced Permission 授权匹配。"
        : undefined;

  return buildErc7710ProofFromGrant({
    grant,
    payload: payloadProof,
    payer: receipt?.payer ?? grant?.from ?? null,
    status,
    updatedAt:
      receipt?.paidAt ??
      payloadProof?.validatedAt ??
      grant?.grantedAt ??
      blockedEntryTime(entries),
    validationMessage
  });
}

function blockedEntryTime(entries: LedgerEntry[]) {
  return entries.find((entry) => entry.status === "blocked")?.occurredAt ?? null;
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

function isPaidLedgerEntry(entry: LedgerEntry) {
  return (
    (entry.status === "success" || entry.status === "paid_ai_failed") &&
    !!entry.paymentReceipt
  );
}

function totalWalletDebitAtomic(entry: LedgerEntry) {
  const oneShot = entry.paymentReceipt?.oneShot;
  const feeAtomic = oneShotFeeAtomic(oneShot, entry.token);

  return (
    oneShot?.totalWalletDebitAtomic ??
    (isPaidLedgerEntry(entry)
      ? sumAtomicAmounts(entry.amountAtomic, feeAtomic)
      : null)
  );
}

function dashboardAccounting(
  permission: PermissionRecord,
  entries: LedgerEntry[]
): DashboardAccounting {
  const latestPaidEntry = entries.find(isPaidLedgerEntry) ?? null;
  const latestBlockedEntry =
    !latestPaidEntry && entries.find((entry) => entry.status === "blocked")
      ? entries.find((entry) => entry.status === "blocked") ?? null
      : null;
  const servicePriceAtomic =
    latestPaidEntry?.amountAtomic ??
    latestBlockedEntry?.amountAtomic ??
    permission.pricePerCallAtomic;
  const relayFeeAtomic = latestPaidEntry
    ? oneShotFeeAtomic(latestPaidEntry.paymentReceipt?.oneShot, permission.token)
    : null;
  const walletDebitAtomic = latestPaidEntry
    ? totalWalletDebitAtomic(latestPaidEntry)
    : null;
  const source = latestPaidEntry
    ? "latest_paid_call"
    : latestBlockedEntry
      ? "blocked_request"
      : "policy_projection";

  return {
    agentBudgetConsumed: formatExactAtomicAmount(
      permission.spentAtomic,
      permission.tokenDecimals,
      permission.token
    ),
    agentBudgetConsumedAtomic: permission.spentAtomic,
    policyBudgetCovers: "x402_service_price_only",
    policyNote:
      "演示预算只计算 x402 服务价；1Shot 中继费会作为钱包扣款单独展示。",
    relayFee:
      relayFeeAtomic !== null
        ? formatExactAtomicAmount(relayFeeAtomic, permission.tokenDecimals, permission.token)
        : latestPaidEntry
          ? "中继费未返回"
          : "结算报价后显示",
    relayFeeAtomic,
    remainingBudget: formatExactAtomicAmount(
      permission.remainingSpendAtomic,
      permission.tokenDecimals,
      permission.token
    ),
    remainingBudgetAtomic: permission.remainingSpendAtomic,
    servicePrice: formatExactAtomicAmount(
      servicePriceAtomic,
      permission.tokenDecimals,
      permission.token
    ),
    servicePriceAtomic,
    source,
    token: permission.token,
    totalWalletDebit:
      walletDebitAtomic !== null
        ? formatExactAtomicAmount(walletDebitAtomic, permission.tokenDecimals, permission.token)
        : latestPaidEntry
          ? "钱包扣款未返回"
          : "结算后显示",
    totalWalletDebitAtomic: walletDebitAtomic
  };
}

function dashboardOnchainPermission(
  permission: PermissionRecord
): OnchainPermissionAvailableAmount {
  const grant = permission.advancedPermissionGrant;
  const activeGrant =
    grant && grant.status === "granted" && grant.expiry > Math.floor(Date.now() / 1000);

  return {
    availableAmount: activeGrant ? "待查询" : "不可用",
    availableAmountAtomic: null,
    currentPeriod: null,
    delegationHash: null,
    enforcer: null,
    error: activeGrant
      ? null
      : grant
        ? "Advanced Permission 未处于可查询的 granted 状态。"
        : "尚未保存 MetaMask Advanced Permission 授权。",
    isNewPeriod: null,
    source: "metamask-period-transfer-enforcer",
    status: activeGrant ? "not_queried" : "not_applicable",
    token: grant?.tokenSymbol ?? permission.token,
    tokenAddress: grant?.tokenAddress ?? null,
    tokenDecimals: grant?.tokenDecimals ?? permission.tokenDecimals,
    updatedAt: null
  };
}

function agentDecisionEnforcement(decision: AgentSpendDecision) {
  if (decision.decision === "skip") {
    return "Agent skipped before payment; no paid header was generated.";
  }
  if (decision.decision === "blocked") {
    return "Agent blocked its own spend intent before payment.";
  }
  if (decision.policyCheck === "allowed") {
    return "Allowed by SpendGuard; x402 + ERC-7710 may execute.";
  }

  return "Blocked by SpendGuard before payment.";
}

function dashboardAgentDecision(
  decision: AgentSpendDecision | null | undefined,
  tokenDecimals: number,
  token: string
): DashboardAgentSpendDecision | null {
  if (!decision) return null;

  return {
    decision: decision.decision,
    reason: decision.reason,
    estimatedCost: formatExactAtomicAmount(
      decision.estimatedCostAtomic,
      tokenDecimals,
      token
    ),
    estimatedCostAtomic: decision.estimatedCostAtomic,
    budgetBefore: formatExactAtomicAmount(
      decision.budgetBeforeAtomic,
      tokenDecimals,
      token
    ),
    budgetBeforeAtomic: decision.budgetBeforeAtomic,
    budgetAfter: decision.budgetAfterAtomic
      ? formatExactAtomicAmount(decision.budgetAfterAtomic, tokenDecimals, token)
      : "No budget debit",
    budgetAfterAtomic: decision.budgetAfterAtomic,
    confidence: decision.confidence,
    policyCheck: decision.policyCheck,
    enforcement: agentDecisionEnforcement(decision),
    decidedAt: decision.decidedAt
  };
}

function dashboardLedgerEntries(
  entries: LedgerEntry[],
  permission: PermissionRecord
): DashboardLedgerEntry[] {
  const metaById = new Map<
    string,
    {
      callNumber: number | null;
      remainingAfter: string;
    }
  >();
  const maxSpend = atomicBigInt(permission.maxSpendAtomic);
  let runningSpend = BigInt(0);
  let callNumber = 0;

  for (const entry of [...entries].reverse()) {
    let entryCallNumber: number | null = null;

    if (isPaidLedgerEntry(entry)) {
      callNumber += 1;
      entryCallNumber = callNumber;
      runningSpend += atomicBigInt(entry.amountAtomic);
    }

    const remaining = maxSpend > runningSpend ? maxSpend - runningSpend : BigInt(0);

    metaById.set(entry.id, {
      callNumber: entryCallNumber,
      remainingAfter: formatAtomicAmount(
        remaining.toString(),
        permission.tokenDecimals,
        permission.token
      )
    });
  }

  return entries.map((entry) =>
    dashboardLedgerEntry(entry, metaById.get(entry.id) ?? {
      callNumber: null,
      remainingAfter: formatAtomicAmount(
        permission.remainingSpendAtomic,
        permission.tokenDecimals,
        permission.token
      )
    })
  );
}

function dashboardLedgerEntry(
  entry: LedgerEntry,
  meta: {
    callNumber: number | null;
    remainingAfter: string;
  }
): DashboardLedgerEntry {
  const payloadProof = entry.paymentReceipt?.erc7710Proof ?? null;
  const paymentRequirementId =
    entry.paymentReceipt?.requirementId ?? entry.paymentRequirement?.id ?? null;
  const txHash = entry.paymentReceipt?.txHash ?? entry.paymentReceipt?.oneShot?.txHash ?? null;
  const serviceCost = formatExactAtomicAmount(
    entry.amountAtomic,
    entry.tokenDecimals,
    entry.token
  );
  const relayFeeAtomic =
    isPaidLedgerEntry(entry)
      ? oneShotFeeAtomic(entry.paymentReceipt?.oneShot, entry.token)
      : null;
  const walletDebitAtomic = totalWalletDebitAtomic(entry);
  const blockedService =
    entry.agentDecision?.decision === "skip"
      ? "AI 跳过支出"
      : entry.agentDecision?.decision === "blocked"
        ? "AI 阻断支出"
        : "支付前阻断";

  return {
    id: entry.id,
    time: entry.time,
    service:
      entry.status === "blocked"
        ? blockedService
        : entry.status === "revoked"
          ? "范围权限"
          : meta.callNumber
            ? `调用 #${meta.callNumber}：${entry.service}`
            : entry.service,
    cost: entry.cost,
    budgetConsumed: isPaidLedgerEntry(entry) ? serviceCost : "0.00 USDC",
    relayFee:
      relayFeeAtomic !== null
        ? formatExactAtomicAmount(relayFeeAtomic, entry.tokenDecimals, entry.token)
        : entry.status === "blocked"
          ? "未提交付费 header"
          : "未报价",
    serviceCost,
    status: entry.status,
    callNumber: meta.callNumber,
    childDelegationTarget: payloadProof?.childDelegationTarget ?? null,
    agentDecision: dashboardAgentDecision(
      entry.agentDecision,
      entry.tokenDecimals,
      entry.token
    ),
    agentDecisionReason: entry.agentDecision?.reason ?? null,
    paymentRequirementId,
    payloadContextHash: payloadProof?.permissionContextHash ?? null,
    remainingAfter: meta.remainingAfter,
    totalWalletDebit:
      walletDebitAtomic !== null
        ? formatExactAtomicAmount(walletDebitAtomic, entry.tokenDecimals, entry.token)
        : entry.status === "blocked"
          ? "无钱包扣款"
          : "未结算",
    txHash
  };
}

function blockState(entries: LedgerEntry[]): DashboardState["block"] {
  const blockedEntry = entries.find((entry) => entry.status === "blocked");

  if (!blockedEntry) {
    return {
      attempted: false,
      reason: "尚未尝试超预算请求。"
    };
  }

  return {
    attempted: true,
    reason: blockedEntry.reason ?? "支付前已阻断：支出超过策略预算。"
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
  const latestDecision =
    entries.find((entry) => entry.agentDecision)?.agentDecision ??
    getCurrentAgentSpendDecision();

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
    erc7710Proof: dashboardErc7710Proof(permission, entries),
    policyConfig: dashboardPolicyConfig(permission),
    accounting: dashboardAccounting(permission, entries),
    agentDecision: dashboardAgentDecision(
      latestDecision,
      permission.tokenDecimals,
      permission.token
    ),
    onchainPermission: dashboardOnchainPermission(permission),
    x402Evidence: dashboardX402Evidence(permission, entries),
    relayerInfo: relayerInfo(entries),
    veniceResult: veniceResult(entries),
    ledgerEntries: dashboardLedgerEntries(entries, permission)
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
