"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  connectBaseSepoliaWallet,
  detectMetaMaskProvider,
  WALLET_ERROR_CODES,
  type WalletErrorCode,
  WalletConnectionError
} from "@/client/wallet/metamask";
import {
  readAdvancedPermissionOnchainAvailableAmount,
  requestAdvancedSpendPermission,
  revokeAdvancedSpendPermission
} from "@/client/permissions/metamaskAdvancedPermissions";
import {
  payErc7710DeepseekRiskBrief,
  type Erc7710PaidPocStage,
  type PaidErc7710RiskBriefData
} from "@/client/x402/payErc7710DeepseekRiskBrief";
import {
  dryRunErc7710Payment,
  type Erc7710DryRunPreview
} from "@/client/x402/dryRunErc7710Payment";
import {
  BASE_SEPOLIA_CHAIN_HEX_ID,
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC
} from "@/shared/chain";
import type {
  ApiResponse,
  DashboardAccounting,
  DashboardPolicyConfig,
  Erc7710PayloadProof,
  OnchainPermissionAvailableAmount,
  SpendGuardDemoState,
  StateEnums,
  X402ChallengeStatus,
  X402Evidence,
  X402PaymentHeaderStatus
} from "@/shared/types";
import { buildErc7710ProofFromGrant } from "@/shared/x402/erc7710DelegationInspector";
import { AgentControls, DemoCommand } from "./AgentControls";
import { AgentDecisionPanel } from "./AgentDecisionPanel";
import { PaymentRail } from "./PaymentRail";
import { PermissionPreview } from "./PermissionPreview";
import { PolicyCard } from "./PolicyCard";
import { RelayerTimeline } from "./RelayerTimeline";
import { SafetyPanel } from "./SafetyPanel";
import { SpendLedger } from "./SpendLedger";
import { StateContract } from "./StateContract";
import { StatusBadge } from "./StatusBadge";
import { VeniceResult } from "./VeniceResult";
import { WalletPanel } from "./WalletPanel";

const POLICY_DEFAULTS: DashboardPolicyConfig = {
  id: "policy-demo-deepseek-001",
  service: "DeepSeek",
  purpose: "钱包风险简报",
  token: "USDC",
  maxSpend: 1,
  pricePerCall: 0.01,
  spent: 0,
  windowHours: 24,
  expiresAt: "2026-05-31T23:59:00+08:00",
  allowedEndpoint: "/x402/deepseek/risk-brief",
  payTo: "0xe61109ccCbf5a9b15F805e58e9A0ec286a46d0Be"
};

export type Erc7710PaidPocConfig = {
  amountAtomic: string;
  enabled: boolean;
  priceLabel: string;
};

const ERC7710_PAID_POC_DEFAULTS: Erc7710PaidPocConfig = {
  amountAtomic: "10000",
  enabled: false,
  priceLabel: "0.01 USDC"
};
const ERC7710_PAID_POC_RESOURCE = "/x402/deepseek/risk-brief/erc7710-paid-poc";

const INITIAL_ACCOUNTING: DashboardAccounting = {
  agentBudgetConsumed: "0.00 USDC",
  agentBudgetConsumedAtomic: "0",
  policyBudgetCovers: "x402_service_price_only",
  policyNote:
    "演示预算只计算 x402 服务价；1Shot 中继费会作为钱包扣款单独展示。",
  relayFee: "结算报价后显示",
  relayFeeAtomic: null,
  remainingBudget: "1.00 USDC",
  remainingBudgetAtomic: "1000000",
  servicePrice: "0.01 USDC",
  servicePriceAtomic: ERC7710_PAID_POC_DEFAULTS.amountAtomic,
  source: "policy_projection",
  token: "USDC",
  totalWalletDebit: "结算后显示",
  totalWalletDebitAtomic: null
};

const INITIAL_ONCHAIN_PERMISSION: OnchainPermissionAvailableAmount = {
  availableAmount: "不可用",
  availableAmountAtomic: null,
  currentPeriod: null,
  delegationHash: null,
  enforcer: null,
  error: "尚未保存 MetaMask Advanced Permission 授权。",
  isNewPeriod: null,
  source: "metamask-period-transfer-enforcer",
  status: "not_applicable",
  token: "USDC",
  tokenAddress: null,
  tokenDecimals: 6,
  updatedAt: null
};

export const STATE_ENUMS: StateEnums = {
  wallet: ["disconnected", "connected", "unsupported"],
  policy: ["draft", "ready_to_sign", "active", "exhausted", "expired", "revoked"],
  permission: [
    "not_requested",
    "requested",
    "approved",
    "active",
    "rejected",
    "redeemed",
    "revoked",
    "fallback_local"
  ],
  agentAction: ["idle", "prechecking", "running", "blocked", "succeeded", "failed"],
  payment: ["none", "required_402", "paying", "paid", "failed", "blocked"],
  relayer: [
    "not_used",
    "quote_requested",
    "quoted",
    "submitted",
    "pending",
    "confirmed",
    "failed",
    "mocked"
  ],
  ledger: ["empty", "has_success", "has_blocked", "closed"],
  revocation: ["available", "revoking", "revoked", "failed"]
};

const INITIAL_NARRATIVE = "连接 MetaMask，开始受预算约束的 agent 支付流程。";
const FALLBACK_DEMO_NOTE =
  "兜底：静态故事仍在 prototype/index.html；重置后仍可通过后端路由验证模拟 API 演示。";
const WALLET_CHANGED_NOTE =
  "MetaMask 账号或网络已变化。授权或支出前请重新连接。";

type BusyAction =
  | "connect"
  | "approve"
  | "run"
  | "dryRun"
  | "paidPoc"
  | "overBudget"
  | "revoke"
  | "reset";

type RunFailurePhase = "precheck" | "refresh" | Erc7710PaidPocStage;

const ERC7710_RUN_STAGE_COPY: Record<Erc7710PaidPocStage, string> = {
  requesting_402: "正在向服务端请求 ERC-7710 x402 challenge。",
  building_delegation_payload:
    "正在基于已保存授权构造 ERC-7710 x402 delegation payload。",
  preflighting_settlement:
    "提交支付前正在本地模拟 ERC-7710 结算。",
  submitting_paid_request:
    "正在用会话权限提交 ERC-7710 付费请求。",
  settling: "正在验证 ERC-7710 结算并刷新支出账本。"
};

const ERC7710_PAID_POC_STAGE_COPY: Record<Erc7710PaidPocStage, string> = {
  requesting_402: "正在请求 ERC-7710 付费 PoC 的 x402 challenge。",
  building_delegation_payload:
    "正在基于已保存授权构造 ERC-7710 x402 delegation payload。",
  preflighting_settlement:
    "提交到 facilitator 前正在本地模拟 ERC-7710 结算。",
  submitting_paid_request: "正在提交 0.01 USDC 的 ERC-7710 付费请求。",
  settling: "正在验证 ERC-7710 结算并刷新支出账本。"
};

type WalletFailureStatus = Extract<
  SpendGuardDemoState["wallet"],
  "disconnected" | "unsupported"
>;

type WalletConnectionFailureCopy = {
  message: string;
  walletStatus: WalletFailureStatus;
};

const WALLET_CONNECTION_FAILURE_COPY: Record<
  WalletErrorCode,
  WalletConnectionFailureCopy
> = {
  [WALLET_ERROR_CODES.WALLET_NOT_FOUND]: {
    walletStatus: "unsupported",
    message:
      "未检测到 MetaMask。请安装或启用扩展后重新连接。"
  },
  [WALLET_ERROR_CODES.WALLET_NOT_METAMASK]: {
    walletStatus: "unsupported",
    message:
      "检测到钱包 provider，但不是 MetaMask。此演示需要在 Base Sepolia 上使用 MetaMask。"
  },
  [WALLET_ERROR_CODES.USER_REJECTED]: {
    walletStatus: "disconnected",
    message:
      "你在 MetaMask 中取消了连接。钱包仍未连接，策略也未授权。"
  },
  [WALLET_ERROR_CODES.CHAIN_SWITCH_REJECTED]: {
    walletStatus: "unsupported",
    message:
      "你取消了切换到 Base Sepolia。当前钱包不支持此演示，策略未授权。"
  },
  [WALLET_ERROR_CODES.CHAIN_ADD_REJECTED]: {
    walletStatus: "unsupported",
    message:
      "你取消了向 MetaMask 添加 Base Sepolia。当前钱包不支持此演示，策略未授权。"
  },
  [WALLET_ERROR_CODES.UNKNOWN_WALLET_ERROR]: {
    walletStatus: "disconnected",
    message:
      "MetaMask 在权限设置前连接失败。钱包仍未连接，策略未授权。"
  }
};

function createInitialState(): SpendGuardDemoState {
  return {
    wallet: "disconnected",
    policy: "draft",
    permission: "not_requested",
    agentAction: "idle",
    payment: "none",
    relayer: "not_used",
    ledger: "empty",
    revocation: "available",
    block: {
      attempted: false,
      reason: "尚未尝试超预算请求。"
    },
    walletInfo: {
      eoa: null,
      smartAccount: null,
      chain: "需要 Base Sepolia"
    },
    advancedPermissionGrant: null,
    erc7710Proof: buildErc7710ProofFromGrant({ grant: null }),
    policyConfig: { ...POLICY_DEFAULTS },
    accounting: { ...INITIAL_ACCOUNTING },
    agentDecision: null,
    onchainPermission: { ...INITIAL_ONCHAIN_PERMISSION },
    relayerInfo: {
      mode: "mock",
      quoteId: null,
      fee: null,
      feeAtomic: null,
      feeCollector: null,
      taskId: null,
      totalWalletDebitAtomic: null,
      txHash: null
    },
    x402Evidence: projectedX402Evidence({
      amountAtomic: ERC7710_PAID_POC_DEFAULTS.amountAtomic,
      challengeStatus: "idle",
      paymentHeaderStatus: "not_applicable",
      policyConfig: POLICY_DEFAULTS
    }),
    veniceResult: null,
    ledgerEntries: []
  };
}

function projectedX402Evidence({
  amountAtomic,
  challengeStatus,
  paymentHeaderStatus,
  policyConfig,
  source = "policy_projection",
  txHash = null
}: {
  amountAtomic: string;
  challengeStatus: X402ChallengeStatus;
  paymentHeaderStatus: X402PaymentHeaderStatus;
  policyConfig: DashboardPolicyConfig;
  source?: X402Evidence["selectedRequirement"]["source"];
  txHash?: string | null;
}): X402Evidence {
  const submitted =
    paymentHeaderStatus === "submitted" || paymentHeaderStatus === "settled";

  return {
    challengeStatus,
    paymentHeaderStatus,
    protectedResource: ERC7710_PAID_POC_RESOURCE,
    selectedRequirement: {
      id: null,
      endpoint: ERC7710_PAID_POC_RESOURCE,
      method: "POST",
      scheme: "exact",
      network: `eip155:${BASE_SEPOLIA_CHAIN_ID}`,
      asset: BASE_SEPOLIA_USDC.address,
      assetLabel: `${policyConfig.token} (${BASE_SEPOLIA_USDC.address})`,
      amountAtomic,
      token: policyConfig.token,
      tokenDecimals: 6,
      payTo: policyConfig.payTo,
      assetTransferMethod: "erc7710",
      maxTimeoutSeconds: 300,
      source
    },
    paidRequest: {
      submitted,
      settled: paymentHeaderStatus === "settled",
      txHash
    },
    updatedAt: new Date().toISOString()
  };
}

function x402EvidenceForStage(
  state: SpendGuardDemoState,
  amountAtomic: string,
  stage: Erc7710PaidPocStage
) {
  const paidRequestStarted =
    stage === "submitting_paid_request" || stage === "settling";

  return projectedX402Evidence({
    amountAtomic,
    challengeStatus: paidRequestStarted
      ? "paid_request_submitted"
      : "received_402",
    paymentHeaderStatus: paidRequestStarted ? "submitted" : "not_submitted",
    policyConfig: state.policyConfig,
    source: "unpaid_402"
  });
}

function x402EvidenceForDryRun(
  state: SpendGuardDemoState,
  preview: Erc7710DryRunPreview
) {
  return projectedX402Evidence({
    amountAtomic: preview.requirement.amountAtomic,
    challengeStatus: "received_402",
    paymentHeaderStatus: "not_submitted",
    policyConfig: state.policyConfig,
    source: "unpaid_402"
  });
}

function stateWithErc7710Proof(
  state: SpendGuardDemoState,
  payload: Erc7710PayloadProof | null,
  status: SpendGuardDemoState["erc7710Proof"]["status"],
  validationMessage: string,
  payer = state.erc7710Proof.payer
): SpendGuardDemoState {
  return {
    ...state,
    erc7710Proof: buildErc7710ProofFromGrant({
      grant: state.advancedPermissionGrant,
      payload,
      payer,
      status,
      validationMessage
    })
  };
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function remainingBudget(state: SpendGuardDemoState) {
  return roundMoney(state.policyConfig.maxSpend - state.policyConfig.spent);
}

function successfulPaidCallCount(state: SpendGuardDemoState) {
  return state.ledgerEntries.filter(
    (entry) => entry.status === "success" || entry.status === "paid_ai_failed"
  ).length;
}

function canUseStoredGrantForPaidCall(state: SpendGuardDemoState) {
  return (
    state.wallet === "connected" &&
    state.policy === "active" &&
    (state.permission === "approved" || state.permission === "redeemed") &&
    state.advancedPermissionGrant !== null
  );
}

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function safeWalletFailureState(
  walletStatus: WalletFailureStatus
): SpendGuardDemoState {
  return {
    ...createInitialState(),
    wallet: walletStatus
  };
}

function connectFailureCopy(error: unknown): WalletConnectionFailureCopy {
  if (error instanceof WalletConnectionError) {
    const copy = WALLET_CONNECTION_FAILURE_COPY[error.code];

    if (
      error.code === WALLET_ERROR_CODES.UNKNOWN_WALLET_ERROR &&
      error.message &&
      error.message !== copy.message
    ) {
      return {
        ...copy,
        message: `${copy.message} 详情：${error.message}`
      };
    }

    return copy;
  }

  return {
    walletStatus: "disconnected",
    message:
      error instanceof Error
        ? `${error.message} 钱包仍未连接，策略未授权。`
        : "钱包连接失败。钱包仍未连接，策略未授权。"
  };
}

function connectFailureNarrative(error: unknown) {
  const copy = connectFailureCopy(error);

  return {
    walletStatus: copy.walletStatus,
    message: `${copy.message} ${FALLBACK_DEMO_NOTE}`
  };
}

type DashboardApiPayload = {
  state: SpendGuardDemoState;
};

async function postDashboardAction(
  endpoint: string,
  body?: Record<string, unknown>
): Promise<DashboardApiPayload> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = (await response.json()) as ApiResponse<DashboardApiPayload>;

  if (!json.ok) {
    throw new Error(json.error.message);
  }

  return json.data;
}

async function getDashboardState(): Promise<DashboardApiPayload> {
  const response = await fetch("/api/ledger");
  const json = (await response.json()) as ApiResponse<DashboardApiPayload>;

  if (!json.ok) {
    throw new Error(json.error.message);
  }

  return json.data;
}

function decimalToAtomic(value: number, decimals = 6) {
  return BigInt(Math.round(value * 10 ** decimals)).toString();
}

function paymentStateForPaidPocStage(
  stage: Erc7710PaidPocStage
): SpendGuardDemoState["payment"] {
  if (stage === "requesting_402") return "required_402";
  return "paying";
}

function runFailureMessage(phase: RunFailurePhase | null, message: string) {
  if (!phase) return message;
  if (phase === "precheck") return `Agent 预检查失败：${message}`;
  if (phase === "refresh") return `支付后刷新账本失败：${message}`;
  return `${ERC7710_RUN_STAGE_COPY[phase]} 失败：${message}`;
}

function hydratedNarrative(state: SpendGuardDemoState) {
  const paidCalls = successfulPaidCallCount(state);

  if (state.payment === "blocked") {
    return `超预算请求已在 x402 paid header 提交前被阻断。同一个 Advanced Permission 授权下保留 ${paidCalls} 次已支付调用记录。`;
  }

  if (state.agentAction === "succeeded" && state.payment === "paid") {
    const txHash = state.relayerInfo.txHash
      ? ` 交易 ${shortenAddress(state.relayerInfo.txHash)} 已写入账本。`
      : "";
    const callCopy = paidCalls > 0 ? `第 #${paidCalls} 次付费调用已确认。` : "";

    return `${callCopy}ERC-7710 结算复用了已保存的 Advanced Permission 授权。SpendGuard 已将 ${state.policyConfig.spent.toFixed(2)} USDC 计入 agent 预算，剩余 ${remainingBudget(state).toFixed(2)} USDC。${txHash}`;
  }

  if (state.permission === "approved" && state.advancedPermissionGrant) {
    return "已恢复保存的 MetaMask Advanced Permission 授权。运行 Agent 时可直接使用 ERC-7710，无需重新请求权限。";
  }

  return INITIAL_NARRATIVE;
}

function paidPocFailureMessage(
  phase: Erc7710PaidPocStage | "precheck" | "refresh" | null,
  message: string
) {
  if (!phase) return message;
  if (phase === "precheck") return `Agent 支出决策失败：${message}`;
  if (phase === "refresh") return `ERC-7710 付费 PoC 后刷新账本失败：${message}`;
  return `${ERC7710_PAID_POC_STAGE_COPY[phase]} 失败：${message}`;
}

export function Dashboard({
  erc7710PaidPocConfig = ERC7710_PAID_POC_DEFAULTS
}: {
  erc7710PaidPocConfig?: Erc7710PaidPocConfig;
}) {
  const [state, setState] = useState<SpendGuardDemoState>(() => createInitialState());
  const [narrative, setNarrative] = useState(INITIAL_NARRATIVE);
  const [dryRunPreview, setDryRunPreview] =
    useState<Erc7710DryRunPreview | null>(null);
  const [paidPocResult, setPaidPocResult] =
    useState<PaidErc7710RiskBriefData | null>(null);
  const [dryRunControlsEnabled, setDryRunControlsEnabled] = useState(false);
  const [busyAction, setBusyAction] = useState<BusyAction | null>(null);
  const busyRef = useRef(false);
  const connectingWalletRef = useRef(false);
  const runFailurePhaseRef = useRef<RunFailurePhase | null>(null);
  const paidPocFailurePhaseRef = useRef<
    Erc7710PaidPocStage | "precheck" | "refresh" | null
  >(null);
  const walletEpochRef = useRef(0);

  const remaining = useMemo(() => remainingBudget(state), [state]);

  function resetDemoServer() {
    return fetch("/api/demo/reset", { method: "POST" }).catch(() => undefined);
  }

  function isCurrentWalletEpoch(epoch: number) {
    return walletEpochRef.current === epoch;
  }

  useEffect(() => {
    setDryRunControlsEnabled(process.env.NODE_ENV !== "production");
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function hydrateDashboardState() {
      try {
        const { state: persistedState } = await getDashboardState();
        if (cancelled) return;

        setState(persistedState);
        setNarrative(hydratedNarrative(persistedState));
      } catch {
        if (!cancelled) {
          setNarrative(INITIAL_NARRATIVE);
        }
      }
    }

    void hydrateDashboardState();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let provider;

    try {
      provider = detectMetaMaskProvider();
    } catch {
      return;
    }

    if (!provider.on) return;

    function resetAfterWalletChange(
      walletStatus: WalletFailureStatus,
      message = WALLET_CHANGED_NOTE
    ) {
      if (connectingWalletRef.current) return;

      walletEpochRef.current += 1;
      setState(safeWalletFailureState(walletStatus));
      setDryRunPreview(null);
      setPaidPocResult(null);
      setNarrative(`${message} ${FALLBACK_DEMO_NOTE}`);
      void resetDemoServer();
    }

    function handleAccountsChanged() {
      resetAfterWalletChange("disconnected");
    }

    function handleChainChanged(chainId: unknown) {
      const chainHex =
        typeof chainId === "string" ? chainId.toLowerCase() : null;
      const walletStatus =
        chainHex === BASE_SEPOLIA_CHAIN_HEX_ID ? "disconnected" : "unsupported";
      const message =
        walletStatus === "unsupported"
          ? "MetaMask 已离开 Base Sepolia。授权或支出前请重新连接到 Base Sepolia。"
          : WALLET_CHANGED_NOTE;

      resetAfterWalletChange(walletStatus, message);
    }

    function handleDisconnect() {
      resetAfterWalletChange(
        "disconnected",
        "MetaMask 已断开连接。授权或支出前请重新连接。"
      );
    }

    provider.on("accountsChanged", handleAccountsChanged);
    provider.on("chainChanged", handleChainChanged);
    provider.on("disconnect", handleDisconnect);

    return () => {
      provider.removeListener?.("accountsChanged", handleAccountsChanged);
      provider.removeListener?.("chainChanged", handleChainChanged);
      provider.removeListener?.("disconnect", handleDisconnect);
    };
  }, []);

  useEffect(() => {
    const grant = state.advancedPermissionGrant;

    if (!grant || state.wallet !== "connected" || state.policy === "revoked") {
      return;
    }

    const activeGrant = grant;
    let cancelled = false;

    setState((current) => {
      if (current.advancedPermissionGrant?.context !== activeGrant.context) {
        return current;
      }

      return {
        ...current,
        onchainPermission: {
          ...current.onchainPermission,
          availableAmount: "查询中",
          error: null,
          status: "querying",
          updatedAt: new Date().toISOString()
        }
      };
    });

    async function refreshOnchainAvailableAmount() {
      const result = await readAdvancedPermissionOnchainAvailableAmount(activeGrant);

      if (cancelled) return;

      setState((current) => {
        if (current.advancedPermissionGrant?.context !== activeGrant.context) {
          return current;
        }

        return {
          ...current,
          onchainPermission: result
        };
      });
    }

    void refreshOnchainAvailableAmount();

    return () => {
      cancelled = true;
    };
  }, [
    state.advancedPermissionGrant?.context,
    state.accounting.agentBudgetConsumedAtomic,
    state.policy,
    state.wallet
  ]);

  async function runExclusive(actionName: BusyAction, action: () => Promise<void>) {
    if (busyRef.current) return;

    busyRef.current = true;
    setBusyAction(actionName);
    try {
      await action();
    } finally {
      busyRef.current = false;
      setBusyAction(null);
    }
  }

  async function connectWallet() {
    await runExclusive("connect", async () => {
      const walletEpoch = walletEpochRef.current;

      try {
        connectingWalletRef.current = true;
        setNarrative("正在打开 MetaMask。请确认账号和 Base Sepolia 网络。");
        const walletInfo = await connectBaseSepoliaWallet();
        const { state: nextState } = await postDashboardAction("/api/wallet/connect", {
          walletInfo
        });

        if (!isCurrentWalletEpoch(walletEpoch)) {
          void resetDemoServer();
          return;
        }

        setState(nextState);
        setDryRunPreview(null);
        setPaidPocResult(null);
        setNarrative(
          `MetaMask connected as ${shortenAddress(
            walletInfo.account
          )}，网络为 Base Sepolia。批准前请确认权限范围。`
        );
      } catch (error) {
        const failure = connectFailureNarrative(error);

        setState(safeWalletFailureState(failure.walletStatus));
        setDryRunPreview(null);
        setPaidPocResult(null);
        setNarrative(failure.message);
      } finally {
        connectingWalletRef.current = false;
      }
    });
  }

  async function approvePermission() {
    await runExclusive("approve", async () => {
      const walletEpoch = walletEpochRef.current;

      try {
        setNarrative(
          `正在打开 MetaMask Advanced Permissions，准备创建 ${state.policyConfig.maxSpend.toFixed(
            2
          )} USDC / 24 小时的 Base Sepolia 授权。`
        );
        const advancedPermissionGrant = await requestAdvancedSpendPermission({
          maxSpendAtomic: decimalToAtomic(state.policyConfig.maxSpend),
          walletAddress: state.walletInfo.eoa
        });
        const { state: nextState } = await postDashboardAction(
          "/api/permissions/request",
          { advancedPermissionGrant }
        );
        if (!isCurrentWalletEpoch(walletEpoch)) {
          void resetDemoServer();
          return;
        }

        setState(nextState);
        setDryRunPreview(null);
        setPaidPocResult(null);
        setNarrative(
          "MetaMask Advanced Permission 已批准。SpendGuard 已保存授权，agent 只能在该策略范围内支出。"
        );
      } catch (error) {
        setState((current) => ({
          ...current,
          permission:
            current.wallet === "connected" && current.permission === "requested"
              ? "rejected"
              : current.permission,
          policy:
            current.wallet === "connected" && current.permission === "requested"
              ? "ready_to_sign"
              : current.policy
        }));
        setNarrative(
          error instanceof Error
            ? error.message
            : "MetaMask Advanced Permission 授权失败。"
        );
      }
    });
  }

  async function blockOverspend() {
    await runExclusive("overBudget", async () => {
      const walletEpoch = walletEpochRef.current;
      const attemptedAmountAtomic = decimalToAtomic(
        state.policyConfig.maxSpend + state.policyConfig.pricePerCall
      );

      try {
        setState((current) => ({
          ...current,
          agentAction: "running",
          payment: "none",
          x402Evidence: projectedX402Evidence({
            amountAtomic: attemptedAmountAtomic,
            challengeStatus: "idle",
            paymentHeaderStatus: "not_applicable",
            policyConfig: current.policyConfig
          })
        }));
        const { state: nextState } = await postDashboardAction("/api/agent/precheck", {
          amountAtomic: attemptedAmountAtomic,
          recordBlockedOnly: true
        });
        if (!isCurrentWalletEpoch(walletEpoch)) {
          void resetDemoServer();
          return;
        }

        setState(nextState);
        setNarrative(
          "超预算请求已在支付前被阻断。SpendGuard 记录了策略违规，没有提交结算。"
        );
      } catch (error) {
        setState((current) => ({
          ...current,
          agentAction: "failed",
          payment: current.payment === "none" ? "none" : "failed",
          x402Evidence: {
            ...current.x402Evidence,
            challengeStatus: "failed",
            updatedAt: new Date().toISOString()
          }
        }));
        setNarrative(error instanceof Error ? error.message : "超预算测试运行失败。");
      }
    });
  }

  async function runAgent() {
    if (!canUseStoredGrantForPaidCall(state)) return;

    await runExclusive("run", async () => {
      const walletEpoch = walletEpochRef.current;
      const callNumber = successfulPaidCallCount(state) + 1;

      try {
        if (!erc7710PaidPocConfig.enabled) {
          setNarrative(
            "ERC-7710 支付当前未启用。请先启用本地 ERC-7710 支付开关，再运行 agent。"
          );
          return;
        }

        runFailurePhaseRef.current = "precheck";
        setNarrative(
          `正在让 agent 生成第 #${callNumber} 次付费调用的支出决策，并交给 SpendGuard 检查预算、范围和钱包状态。`
        );
        setState((current) => ({
          ...current,
          agentAction: "prechecking",
          payment: "none",
          relayer: "not_used",
          erc7710Proof: buildErc7710ProofFromGrant({
            grant: current.advancedPermissionGrant,
            status: "grant_ready"
          }),
          x402Evidence: projectedX402Evidence({
            amountAtomic: erc7710PaidPocConfig.amountAtomic,
            challengeStatus: "idle",
            paymentHeaderStatus: "not_applicable",
            policyConfig: current.policyConfig
          })
        }));

        const { state: precheckedState } = await postDashboardAction("/api/agent/precheck", {
          amountAtomic: erc7710PaidPocConfig.amountAtomic
        });
        if (!isCurrentWalletEpoch(walletEpoch)) {
          void resetDemoServer();
          return;
        }
        setState(precheckedState);

        runFailurePhaseRef.current = "requesting_402";
        setState((current) => ({
          ...current,
          agentAction: "running",
          payment: "required_402",
          x402Evidence: projectedX402Evidence({
            amountAtomic: erc7710PaidPocConfig.amountAtomic,
            challengeStatus: "received_402",
            paymentHeaderStatus: "not_submitted",
            policyConfig: current.policyConfig,
            source: "unpaid_402"
          })
        }));
        setNarrative(ERC7710_RUN_STAGE_COPY.requesting_402);

        const result = await payErc7710DeepseekRiskBrief({
          advancedPermissionGrant: state.advancedPermissionGrant,
          confirmAfterPreflight(preflight) {
            return window.confirm(
              `本地 ERC-7710 结算预检通过，检测到 ${preflight.simulatedRedeemers.length} 个 facilitator 签名者。现在提交第 #${callNumber} 次 ${erc7710PaidPocConfig.priceLabel} 付费调用吗？`
            );
          },
          expectedAmountAtomic: erc7710PaidPocConfig.amountAtomic,
          expectedPayTo: state.policyConfig.payTo,
          onStage(stage) {
            runFailurePhaseRef.current = stage;
            setState((current) => ({
              ...current,
              agentAction: "running",
              payment: paymentStateForPaidPocStage(stage),
              x402Evidence: x402EvidenceForStage(
                current,
                erc7710PaidPocConfig.amountAtomic,
                stage
              )
            }));
            setNarrative(ERC7710_RUN_STAGE_COPY[stage]);
          },
          onProof(proof) {
            setState((current) =>
              stateWithErc7710Proof(
                current,
                proof,
                proof.settlementPreflight
                  ? "settlement_preflighted"
                  : "payload_validated",
                proof.settlementPreflight
                  ? "ERC-7710 payload 与已保存授权匹配，并通过本地结算预检。"
                  : "ERC-7710 payload 在本地验证中与已保存授权匹配。"
              )
            );
          },
          walletAddress: state.walletInfo.eoa
        });

        runFailurePhaseRef.current = "refresh";
        const { state: nextState } = await getDashboardState();
        if (!isCurrentWalletEpoch(walletEpoch)) {
          void resetDemoServer();
          return;
        }

        setState(
          stateWithErc7710Proof(
            nextState,
            result.paymentReceipt.erc7710Proof ??
              nextState.erc7710Proof.payload,
            "settled",
            "x402 结算前，客户端本地验证、结算预检和服务端授权检查均已通过。",
            result.x402.payer
          )
        );
        setPaidPocResult(result);
        runFailurePhaseRef.current = null;
        const paidCalls = successfulPaidCallCount(nextState);
        setNarrative(
          `第 #${paidCalls} 次付费调用已通过 ERC-7710 x402 结算，并复用已保存的 Advanced Permission 授权。已用 ${nextState.policyConfig.spent.toFixed(2)} USDC，剩余 ${remainingBudget(nextState).toFixed(2)} USDC。交易 ${result.x402.txHash ? shortenAddress(result.x402.txHash) : "等待中"} 已写入账本。`
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Agent 运行失败。";
        setState((current) => ({
          ...current,
          agentAction: "failed",
          payment: current.payment === "none" ? "none" : "failed",
          erc7710Proof: buildErc7710ProofFromGrant({
            grant: current.advancedPermissionGrant,
            payload: current.erc7710Proof.payload,
            payer: current.erc7710Proof.payer,
            status: "failed"
          }),
          x402Evidence: {
            ...current.x402Evidence,
            challengeStatus: "failed",
            updatedAt: new Date().toISOString()
          }
        }));
        setNarrative(runFailureMessage(runFailurePhaseRef.current, message));
        runFailurePhaseRef.current = null;
      }
    });
  }

  async function dryRunErc7710() {
    if (!dryRunControlsEnabled) return;

    await runExclusive("dryRun", async () => {
      try {
        setNarrative(
          "Dry run 正在获取未支付的 x402 要求，并构造 ERC-7710 delegation 预览，不会提交支付。"
        );
        const preview = await dryRunErc7710Payment({
          advancedPermissionGrant: state.advancedPermissionGrant,
          expectedPayTo: state.policyConfig.payTo,
          maxAmountAtomic: decimalToAtomic(state.policyConfig.pricePerCall),
          walletAddress: state.walletInfo.eoa
        });

        setDryRunPreview(preview);
        setState((current) =>
          stateWithErc7710Proof(
            {
              ...current,
              payment: "required_402",
              x402Evidence: x402EvidenceForDryRun(current, preview)
            },
            preview.payloadProof,
            "payload_validated",
            "Dry run 已构造 ERC-7710 x402 payload，并在本地验证其匹配已保存授权；未提交支付。"
          )
        );
        setNarrative(
          `ERC-7710 dry run 已就绪：金额 ${preview.requirement.amountAtomic} atomic ${state.policyConfig.token}。未发送 PAYMENT-SIGNATURE header，也未发起付费重试。`
        );
      } catch (error) {
        setDryRunPreview(null);
        setNarrative(
          error instanceof Error ? error.message : "ERC-7710 dry run 失败。"
        );
      }
    });
  }

  async function runPaidErc7710Poc() {
    if (!erc7710PaidPocConfig.enabled) return;

    const confirmed = window.confirm(
      `这会通过 ERC-7710 x402 付费 PoC 支出 ${erc7710PaidPocConfig.priceLabel} Base Sepolia USDC。继续吗？`
    );
    if (!confirmed) return;

    await runExclusive("paidPoc", async () => {
      const walletEpoch = walletEpochRef.current;

      try {
        paidPocFailurePhaseRef.current = "precheck";
        setNarrative(
          `正在让 agent 判断这次 ${erc7710PaidPocConfig.priceLabel} 支出是否值得。`
        );
        setState((current) => ({
          ...current,
          agentAction: "prechecking",
          payment: "none",
          relayer: "not_used",
          x402Evidence: projectedX402Evidence({
            amountAtomic: erc7710PaidPocConfig.amountAtomic,
            challengeStatus: "idle",
            paymentHeaderStatus: "not_applicable",
            policyConfig: current.policyConfig
          })
        }));
        const { state: precheckedState } = await postDashboardAction("/api/agent/precheck", {
          amountAtomic: erc7710PaidPocConfig.amountAtomic
        });
        if (!isCurrentWalletEpoch(walletEpoch)) {
          void resetDemoServer();
          return;
        }
        setState(precheckedState);

        paidPocFailurePhaseRef.current = "requesting_402";
        setPaidPocResult(null);
        setState((current) => ({
          ...current,
          agentAction: "running",
          payment: "required_402",
          relayer: "not_used",
          erc7710Proof: buildErc7710ProofFromGrant({
            grant: current.advancedPermissionGrant,
            status: "grant_ready"
          }),
          x402Evidence: projectedX402Evidence({
            amountAtomic: erc7710PaidPocConfig.amountAtomic,
            challengeStatus: "received_402",
            paymentHeaderStatus: "not_submitted",
            policyConfig: current.policyConfig,
            source: "unpaid_402"
          })
        }));
        setNarrative(ERC7710_PAID_POC_STAGE_COPY.requesting_402);

        const result = await payErc7710DeepseekRiskBrief({
          advancedPermissionGrant: state.advancedPermissionGrant,
          confirmAfterPreflight(preflight) {
            return window.confirm(
              `本地 ERC-7710 结算预检通过，检测到 ${preflight.simulatedRedeemers.length} 个 facilitator 签名者。现在提交真实 ${erc7710PaidPocConfig.priceLabel} 结算吗？`
            );
          },
          expectedAmountAtomic: erc7710PaidPocConfig.amountAtomic,
          expectedPayTo: state.policyConfig.payTo,
          onStage(stage) {
            paidPocFailurePhaseRef.current = stage;
            setState((current) => ({
              ...current,
              agentAction: "running",
              payment: paymentStateForPaidPocStage(stage),
              x402Evidence: x402EvidenceForStage(
                current,
                erc7710PaidPocConfig.amountAtomic,
                stage
              )
            }));
            setNarrative(ERC7710_PAID_POC_STAGE_COPY[stage]);
          },
          onProof(proof) {
            setState((current) =>
              stateWithErc7710Proof(
                current,
                proof,
                proof.settlementPreflight
                  ? "settlement_preflighted"
                  : "payload_validated",
                proof.settlementPreflight
                  ? "ERC-7710 payload 与已保存授权匹配，并通过本地结算预检。"
                  : "ERC-7710 payload 在本地验证中与已保存授权匹配。"
              )
            );
          },
          walletAddress: state.walletInfo.eoa
        });

        paidPocFailurePhaseRef.current = "refresh";
        const { state: nextState } = await getDashboardState();
        if (!isCurrentWalletEpoch(walletEpoch)) {
          void resetDemoServer();
          return;
        }

        setState(
          stateWithErc7710Proof(
            nextState,
            result.paymentReceipt.erc7710Proof ??
              nextState.erc7710Proof.payload,
            "settled",
            "x402 结算前，客户端本地验证、结算预检和服务端授权检查均已通过。",
            result.x402.payer
          )
        );
        setPaidPocResult(result);
        paidPocFailurePhaseRef.current = null;
        setNarrative(
          `ERC-7710 付费 PoC 已完成 ${erc7710PaidPocConfig.priceLabel} 结算。账本付款人 ${shortenAddress(
            result.x402.payer
          )}，交易 ${result.x402.txHash ? shortenAddress(result.x402.txHash) : "等待中"}。`
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "ERC-7710 付费 PoC 失败。";
        setState((current) => ({
          ...current,
          agentAction: "failed",
          payment: current.payment === "none" ? "none" : "failed",
          erc7710Proof: buildErc7710ProofFromGrant({
            grant: current.advancedPermissionGrant,
            payload: current.erc7710Proof.payload,
            payer: current.erc7710Proof.payer,
            status: "failed"
          }),
          x402Evidence: {
            ...current.x402Evidence,
            challengeStatus: "failed",
            updatedAt: new Date().toISOString()
          }
        }));
        setNarrative(paidPocFailureMessage(paidPocFailurePhaseRef.current, message));
        paidPocFailurePhaseRef.current = null;
      }
    });
  }

  async function revokePermission() {
    await runExclusive("revoke", async () => {
      const walletEpoch = walletEpochRef.current;

      try {
        if (!state.advancedPermissionGrant) {
          setNarrative(
            "当前会话没有保存 MetaMask Advanced Permission 授权。请先重置并批准真实授权，再同步撤销。"
          );
          return;
        }

        setState((current) => ({
          ...current,
          revocation: "revoking"
        }));
        setNarrative("正在打开 MetaMask 撤销 Advanced Permission。");
        const revokeResult = await revokeAdvancedSpendPermission(
          state.advancedPermissionGrant,
          {
            onStage(stage) {
              setNarrative(
                stage === "requesting_wallet_revoke"
                  ? "正在打开 MetaMask 撤销 Advanced Permission。"
                  : "撤销尝试后正在检查 MetaMask 已授权权限。"
              );
            }
          }
        );

        if (revokeResult.status === "active") {
          setState((current) => ({
            ...current,
            revocation: "available",
            advancedPermissionGrant: revokeResult.matchedGrant
          }));
          if (revokeResult.directRevokeStatus === "not_supported") {
            setNarrative(
              "当前 MetaMask 版本不支持 dapp 触发 Advanced Permission 撤销。请在 MetaMask Dapp 连接中手动撤销，然后再次点击撤销同步。本地未记录撤销。"
            );
          } else if (revokeResult.directRevokeStatus === "rejected") {
            setNarrative(
              "你在 MetaMask 中取消了直接撤销。授权仍然活跃，本地未记录撤销。"
            );
          } else if (revokeResult.directRevokeStatus === "failed") {
            setNarrative(
              `直接撤销失败${
                revokeResult.directRevokeMessage
                  ? `：${revokeResult.directRevokeMessage}`
                  : "。"
              }MetaMask 仍报告该授权为活跃，因此本地未记录撤销。`
            );
          } else {
            setNarrative(
              "撤销尝试后 MetaMask 仍报告该 Advanced Permission 为活跃。本地未记录撤销。"
            );
          }
          return;
        }

        const { state: nextState } = await postDashboardAction(
          "/api/permissions/revoke",
          {
            advancedPermissionGrant: revokeResult.advancedPermissionGrant,
            directRevokeStatus: revokeResult.directRevokeStatus,
            syncStatus: revokeResult.syncStatus
          }
        );
        if (!isCurrentWalletEpoch(walletEpoch)) {
          void resetDemoServer();
          return;
        }

        setState(nextState);
        setDryRunPreview(null);
        setPaidPocResult(null);
        setNarrative(
          revokeResult.status === "expired"
            ? "MetaMask 授权已过期。本地策略已关闭，agent 不能继续支出。"
            : revokeResult.directRevokeStatus === "submitted"
              ? "钱包同步确认 MetaMask 直接撤销已完成。本地策略已关闭，agent 不能继续支出。"
              : "MetaMask 已不再报告该授权。本地策略已关闭，agent 不能继续支出。"
        );
      } catch (error) {
        setState((current) => ({
          ...current,
          revocation: "failed"
        }));
        setNarrative(
          error instanceof Error
            ? error.message
            : "本地撤销前 MetaMask 权限同步失败。"
        );
      }
    });
  }

  async function resetDemo() {
    await runExclusive("reset", async () => {
      try {
        const { state: nextState } = await postDashboardAction("/api/demo/reset");
        setState(nextState);
        setDryRunPreview(null);
        setPaidPocResult(null);
        setNarrative(INITIAL_NARRATIVE);
      } catch (error) {
        setState(createInitialState());
        setDryRunPreview(null);
        setPaidPocResult(null);
        setNarrative(error instanceof Error ? error.message : "演示重置失败。");
      }
    });
  }

  return (
    <main className="app-shell">
      <header className="topbar" aria-label="SpendGuard 控制台头部">
        <div>
          <p className="eyebrow">Agent SpendGuard</p>
          <h1>面向单个 AI agent 的链上范围预算</h1>
        </div>
        <div className="status-cluster" aria-label="当前状态摘要">
          <StatusBadge prefix="Wallet" value={state.wallet} variant="pill" />
          <StatusBadge prefix="Policy" value={state.policy} variant="pill" />
          <StatusBadge prefix="Permission" value={state.permission} variant="pill" />
        </div>
      </header>

      <DemoCommand
        narrative={narrative}
        onApprove={approvePermission}
        onConnect={connectWallet}
        onDryRun={dryRunErc7710}
        onOverBudget={blockOverspend}
        onPaidPoc={runPaidErc7710Poc}
        onReset={resetDemo}
        onRevoke={revokePermission}
        onRun={runAgent}
        busyAction={busyAction}
        dryRunControlsEnabled={dryRunControlsEnabled}
        dryRunPreview={dryRunPreview}
        paidPocConfig={erc7710PaidPocConfig}
        paidPocResult={paidPocResult}
        state={state}
      />

      <section className="dashboard-grid" aria-label="SpendGuard 控制台">
        <WalletPanel state={state} />
        <PolicyCard remainingBudget={remaining} state={state} />
        <PermissionPreview state={state} />
        <AgentControls state={state} />
        <AgentDecisionPanel state={state} />
        <PaymentRail state={state} />
        <RelayerTimeline state={state} />
        <VeniceResult state={state} />
        <SpendLedger state={state} />
        <SafetyPanel state={state} />
        <StateContract state={state} stateEnums={STATE_ENUMS} />
      </section>
    </main>
  );
}
