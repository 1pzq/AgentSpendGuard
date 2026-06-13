"use client";

import { useEffect, useRef, useState } from "react";
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
  X402ChallengeStatus,
  X402Evidence,
  X402PaymentHeaderStatus
} from "@/shared/types";
import { buildErc7710ProofFromGrant } from "@/shared/x402/erc7710DelegationInspector";
import { DemoCommand } from "./AgentControls";
import { ChainEvidencePanel } from "./ChainEvidencePanel";
import { ConfirmDialog, type ConfirmDialogOptions } from "./ConfirmDialog";
import { DemoEvidenceStage } from "./DemoEvidenceStage";
import { SpendLedger } from "./SpendLedger";
import { StatusBadge } from "./StatusBadge";

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
    "演示预算只计算 x402 服务价；1Shot 中继费会作为钱包扣款单独展示",
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
  error: "尚未保存 MetaMask Advanced Permission 授权",
  isNewPeriod: null,
  source: "metamask-period-transfer-enforcer",
  status: "not_applicable",
  token: "USDC",
  tokenAddress: null,
  tokenDecimals: 6,
  updatedAt: null
};

const INITIAL_NARRATIVE = "连接 MetaMask，开始受预算约束的 agent 支付流程";
const FALLBACK_DEMO_NOTE =
  "兜底：静态故事仍在 prototype/index.html；重置后仍可通过后端路由验证模拟 API 演示";
const WALLET_CHANGED_NOTE =
  "MetaMask 账号或网络已变化授权或支出前请重新连接";

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
  requesting_402: "正在向服务端请求 ERC-7710 x402 challenge",
  building_delegation_payload:
    "正在基于已保存授权构造 ERC-7710 x402 delegation payload",
  preflighting_settlement:
    "提交支付前正在本地模拟 ERC-7710 结算",
  submitting_paid_request:
    "正在用会话权限提交 ERC-7710 付费请求",
  settling: "付费请求已提交，正在等待 1Shot 结算、DeepSeek 返回和账本确认"
};

const ERC7710_PAID_POC_STAGE_COPY: Record<Erc7710PaidPocStage, string> = {
  requesting_402: "正在请求 ERC-7710 付费 PoC 的 x402 challenge",
  building_delegation_payload:
    "正在基于已保存授权构造 ERC-7710 x402 delegation payload",
  preflighting_settlement:
    "提交到 facilitator 前正在本地模拟 ERC-7710 结算",
  submitting_paid_request: "正在提交 0.01 USDC 的 ERC-7710 付费请求",
  settling: "付费请求已提交，正在等待 1Shot 结算、DeepSeek 返回和账本确认"
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
      "未检测到 MetaMask请安装或启用扩展后重新连接"
  },
  [WALLET_ERROR_CODES.WALLET_NOT_METAMASK]: {
    walletStatus: "unsupported",
    message:
      "检测到钱包 provider，但不是 MetaMask此演示需要在 Base Sepolia 上使用 MetaMask"
  },
  [WALLET_ERROR_CODES.USER_REJECTED]: {
    walletStatus: "disconnected",
    message:
      "你在 MetaMask 中取消了连接钱包仍未连接，策略也未授权"
  },
  [WALLET_ERROR_CODES.CHAIN_SWITCH_REJECTED]: {
    walletStatus: "unsupported",
    message:
      "你取消了切换到 Base Sepolia当前钱包不支持此演示，策略未授权"
  },
  [WALLET_ERROR_CODES.CHAIN_ADD_REJECTED]: {
    walletStatus: "unsupported",
    message:
      "你取消了向 MetaMask 添加 Base Sepolia当前钱包不支持此演示，策略未授权"
  },
  [WALLET_ERROR_CODES.UNKNOWN_WALLET_ERROR]: {
    walletStatus: "disconnected",
    message:
      "MetaMask 在权限设置前连接失败钱包仍未连接，策略未授权"
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
      reason: "尚未尝试超预算请求"
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

function latestChainEvidenceEntry(state: SpendGuardDemoState) {
  return state.ledgerEntries.find(
    (entry) => entry.txHash || entry.payloadContextHash
  );
}

function chainEvidenceStatusForState(state: SpendGuardDemoState) {
  const proofEntry = latestChainEvidenceEntry(state);
  const txHash = state.x402Evidence.paidRequest.txHash ?? proofEntry?.txHash ?? null;

  if (txHash) return "confirmed";
  if (state.payment === "blocked") return "blocked";
  if (state.x402Evidence.paymentHeaderStatus === "submitted") return "pending";
  return "waiting";
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
        ? `${error.message} 钱包仍未连接，策略未授权`
        : "钱包连接失败钱包仍未连接，策略未授权"
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
    return `超预算请求已在 paid header 前阻断；已支付调用保留 ${paidCalls} 次`;
  }

  if (state.agentAction === "succeeded" && state.payment === "paid") {
    const txHash = state.relayerInfo.txHash
      ? ` 交易 ${shortenAddress(state.relayerInfo.txHash)} 已入账`
      : "";
    const callCopy = paidCalls > 0 ? `第 #${paidCalls} 次付费调用已确认` : "";

    return `${callCopy}已用 ${state.policyConfig.spent.toFixed(2)} USDC，剩余 ${remainingBudget(state).toFixed(2)} USDC${txHash}`;
  }

  if (state.permission === "approved" && state.advancedPermissionGrant) {
    return "已保存 MetaMask Advanced Permission，可直接运行 ERC-7710 x402 支付";
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
  const [confirmDialog, setConfirmDialog] =
    useState<ConfirmDialogOptions | null>(null);
  const busyRef = useRef(false);
  const connectingWalletRef = useRef(false);
  const confirmDialogResolverRef = useRef<((confirmed: boolean) => void) | null>(
    null
  );
  const runFailurePhaseRef = useRef<RunFailurePhase | null>(null);
  const paidPocFailurePhaseRef = useRef<
    Erc7710PaidPocStage | "precheck" | "refresh" | null
  >(null);
  const walletEpochRef = useRef(0);

  const walletStepState = state.wallet === "connected" ? "done" : "active";
  const permissionStepState =
    state.permission === "approved" ||
    state.permission === "redeemed" ||
    state.permission === "revoked"
      ? "done"
      : state.wallet === "connected"
        ? "active"
        : "waiting";
  const paymentStepState =
    state.payment === "paid" || state.payment === "blocked"
      ? "done"
      : canUseStoredGrantForPaidCall(state)
        ? "active"
        : "waiting";
  const ledgerStepState =
    state.ledger !== "empty"
      ? "done"
      : state.payment === "paid" || state.payment === "blocked"
        ? "active"
        : "waiting";
  const chainEvidenceStatus = chainEvidenceStatusForState(state);

  function resetDemoServer() {
    return fetch("/api/demo/reset", { method: "POST" }).catch(() => undefined);
  }

  function isCurrentWalletEpoch(epoch: number) {
    return walletEpochRef.current === epoch;
  }

  function requestConfirmation(options: ConfirmDialogOptions) {
    confirmDialogResolverRef.current?.(false);

    return new Promise<boolean>((resolve) => {
      confirmDialogResolverRef.current = resolve;
      setConfirmDialog(options);
    });
  }

  function resolveConfirmation(confirmed: boolean) {
    confirmDialogResolverRef.current?.(confirmed);
    confirmDialogResolverRef.current = null;
    setConfirmDialog(null);
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
          ? "MetaMask 已离开 Base Sepolia授权或支出前请重新连接到 Base Sepolia"
          : WALLET_CHANGED_NOTE;

      resetAfterWalletChange(walletStatus, message);
    }

    function handleDisconnect() {
      resetAfterWalletChange(
        "disconnected",
        "MetaMask 已断开连接授权或支出前请重新连接"
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
        setNarrative("正在打开 MetaMask请确认账号和 Base Sepolia 网络");
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
          `MetaMask 已连接：${shortenAddress(walletInfo.account)} / Base Sepolia`
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
          )} USDC / 24 小时的 Base Sepolia 授权`
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
          "Advanced Permission 已批准，agent 只能在这条预算内支付"
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
            : "MetaMask Advanced Permission 授权失败"
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
          "超预算请求已在支付前阻断，没有提交结算"
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
        setNarrative(error instanceof Error ? error.message : "超预算测试运行失败");
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
            "ERC-7710 支付当前未启用请先启用本地 ERC-7710 支付开关，再运行 agent"
          );
          return;
        }

        runFailurePhaseRef.current = "precheck";
        setNarrative(
          `正在让 agent 生成第 #${callNumber} 次付费调用的支出决策，并交给 SpendGuard 检查预算、范围和钱包状态`
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
            return requestConfirmation({
              confirmLabel: "提交调用",
              confirmArrow: false,
              details: [
                { label: "调用序号", value: `#${callNumber}` },
                { label: "支付金额", value: erc7710PaidPocConfig.priceLabel },
                {
                  label: "预检结果",
                  value: `${preflight.simulatedRedeemers.length} 个 facilitator 签名者`
                },
                { label: "网络", value: "Base Sepolia" }
              ],
              hideEyebrow: true,
              message:
                "本地结算预检已经通过确认后会提交 x402 付费请求，并等待 1Shot relay 结算",
              title: `提交第 #${callNumber} 次付费调用吗？`
            });
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
                  ? "ERC-7710 payload 与已保存授权匹配，并通过本地结算预检"
                  : "ERC-7710 payload 在本地验证中与已保存授权匹配"
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
            "x402 结算前，客户端本地验证、结算预检和服务端授权检查均已通过",
            result.x402.payer
          )
        );
        setPaidPocResult(result);
        runFailurePhaseRef.current = null;
        const paidCalls = successfulPaidCallCount(nextState);
        setNarrative(
          `第 #${paidCalls} 次调用已结算已用 ${nextState.policyConfig.spent.toFixed(2)} USDC，剩余 ${remainingBudget(nextState).toFixed(2)} USDC`
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Agent 运行失败";
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
          "Dry run 正在获取未支付的 x402 要求，并构造 ERC-7710 delegation 预览，不会提交支付"
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
            "Dry run 已构造 ERC-7710 x402 payload，并在本地验证其匹配已保存授权；未提交支付"
          )
        );
        setNarrative(
          `ERC-7710 dry run 已就绪：金额 ${preview.requirement.amountAtomic} atomic ${state.policyConfig.token}未发送 PAYMENT-SIGNATURE header，也未发起付费重试`
        );
      } catch (error) {
        setDryRunPreview(null);
        setNarrative(
          error instanceof Error ? error.message : "ERC-7710 dry run 失败"
        );
      }
    });
  }

  async function runPaidErc7710Poc() {
    if (!erc7710PaidPocConfig.enabled) return;

    const confirmed = await requestConfirmation({
      confirmLabel: "继续预检",
      details: [
        { label: "支付轨道", value: "ERC-7710 x402" },
        { label: "金额", value: erc7710PaidPocConfig.priceLabel },
        { label: "网络", value: "Base Sepolia" },
        { label: "结算", value: "1Shot relay" }
      ],
      eyebrow: "真实付费 PoC",
      message:
        "这会进入真实 ERC-7710 x402 付费流程系统会先做 SpendGuard 预检和本地结算预检，确认后才提交支付",
      title: "开始一次真实付费演示吗？"
    });
    if (!confirmed) return;

    await runExclusive("paidPoc", async () => {
      const walletEpoch = walletEpochRef.current;

      try {
        paidPocFailurePhaseRef.current = "precheck";
        setNarrative(
          `正在让 agent 判断这次 ${erc7710PaidPocConfig.priceLabel} 支出是否值得`
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
            return requestConfirmation({
              confirmLabel: "提交结算",
              details: [
                { label: "金额", value: erc7710PaidPocConfig.priceLabel },
                {
                  label: "预检结果",
                  value: `${preflight.simulatedRedeemers.length} 个 facilitator 签名者`
                },
                { label: "网络", value: "Base Sepolia" },
                { label: "结算", value: "1Shot relay" }
              ],
              eyebrow: "结算预检通过",
              message:
                "确认后会提交真实付费 header完成后页面会写入 tx hash、payload hash 和 DeepSeek 返回结果",
              title: "提交真实结算吗？"
            });
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
                  ? "ERC-7710 payload 与已保存授权匹配，并通过本地结算预检"
                  : "ERC-7710 payload 在本地验证中与已保存授权匹配"
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
            "x402 结算前，客户端本地验证、结算预检和服务端授权检查均已通过",
            result.x402.payer
          )
        );
        setPaidPocResult(result);
        paidPocFailurePhaseRef.current = null;
        setNarrative(
          `ERC-7710 付费 PoC 已完成 ${erc7710PaidPocConfig.priceLabel} 结算`
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "ERC-7710 付费 PoC 失败";
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
            "当前会话没有保存 MetaMask Advanced Permission 授权请先重置并批准真实授权，再同步撤销"
          );
          return;
        }

        setState((current) => ({
          ...current,
          revocation: "revoking"
        }));
        setNarrative("正在打开 MetaMask 撤销 Advanced Permission");
        const revokeResult = await revokeAdvancedSpendPermission(
          state.advancedPermissionGrant,
          {
            onStage(stage) {
              setNarrative(
                stage === "requesting_wallet_revoke"
                  ? "正在打开 MetaMask 撤销 Advanced Permission"
                  : "撤销尝试后正在检查 MetaMask 已授权权限"
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
              "当前 MetaMask 版本不支持 dapp 触发 Advanced Permission 撤销请在 MetaMask Dapp 连接中手动撤销，然后再次点击撤销同步本地未记录撤销"
            );
          } else if (revokeResult.directRevokeStatus === "rejected") {
            setNarrative(
              "你在 MetaMask 中取消了直接撤销授权仍然活跃，本地未记录撤销"
            );
          } else if (revokeResult.directRevokeStatus === "failed") {
            setNarrative(
              `直接撤销失败${
                revokeResult.directRevokeMessage
                  ? `：${revokeResult.directRevokeMessage}`
                  : ""
              }MetaMask 仍报告该授权为活跃，因此本地未记录撤销`
            );
          } else {
            setNarrative(
              "撤销尝试后 MetaMask 仍报告该 Advanced Permission 为活跃本地未记录撤销"
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
            ? "MetaMask 授权已过期本地策略已关闭，agent 不能继续支出"
            : revokeResult.directRevokeStatus === "submitted"
              ? "钱包同步确认 MetaMask 直接撤销已完成本地策略已关闭，agent 不能继续支出"
              : "MetaMask 已不再报告该授权本地策略已关闭，agent 不能继续支出"
        );
      } catch (error) {
        setState((current) => ({
          ...current,
          revocation: "failed"
        }));
        setNarrative(
          error instanceof Error
            ? error.message
            : "本地撤销前 MetaMask 权限同步失败"
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
        setNarrative(error instanceof Error ? error.message : "演示重置失败");
      }
    });
  }

  return (
    <>
    <main className="app-shell demo-page">
      <header className="topbar" aria-label="SpendGuard 控制台头部">
        <div className="brand-lockup">
          <img className="brand-mark" src="/loge.svg" alt="" />
          <span>Agent SpendGuard</span>
        </div>
        <nav className="site-nav" aria-label="页面导航">
          <a href="#overview">首页</a>
          <a href="#demo">演示</a>
          <a href="#ledger">证据</a>
        </nav>
      </header>

      <section className="hero-scroll-scene" id="overview" aria-label="Agent SpendGuard 介绍">
        <div className="demo-hero">
          <div className="demo-hero-body">
            <div className="hero-pill-row" aria-label="核心技术标签">
              <span className="hero-pill hero-pill-dark">
                <span className="hero-pill-dot" aria-hidden="true" />
                Live Demo
              </span>
              <span className="hero-pill">X402</span>
              <span className="hero-pill">ERC-7710</span>
              <span className="hero-pill">Policy Guard</span>
            </div>
            <h1>
              Agent
              <br />
              <em>SpendGuard</em>
            </h1>
            <p className="hero-lede">
              一个面向 autonomous agents 的支出守卫：先把钱包授权限制在预算和用途内，再让每次 x402 支付留下可验证、可撤销、可审计的证据
            </p>
            <dl className="hero-stats-row" aria-label="Agent SpendGuard 核心指标">
              <div>
                <dt>授权即上限</dt>
                <dd>1×</dd>
              </div>
              <div>
                <dt>支付轨道</dt>
                <dd>x402</dd>
              </div>
              <div>
                <dt>结算即证据</dt>
                <dd>1Shot</dd>
              </div>
              <div>
                <dt>授权协议</dt>
                <dd>ERC-7710</dd>
              </div>
            </dl>
          </div>

          <div className="hero-divider" aria-hidden="true" />
          <div className="hero-tech-strip" aria-label="项目技术栈">
            <span>MetaMask AP</span>
            <i aria-hidden="true">·</i>
            <span>ERC-7710</span>
            <i aria-hidden="true">·</i>
            <span>Base Sepolia</span>
            <i aria-hidden="true">·</i>
            <span>DeepSeek</span>
            <i aria-hidden="true">·</i>
            <span>SpendGuard</span>
          </div>
          <div className="hero-divider" aria-hidden="true" />

          <div className="hero-feature-row" aria-label="首页能力摘要">
            <article>
              <span className="hero-feature-icon" aria-hidden="true">⌁</span>
              <div>
                <h2>预算即边界</h2>
                <p>单次授权限定金额、用途、时间窗，agent 无权超限</p>
              </div>
            </article>
            <article>
              <span className="hero-feature-icon" aria-hidden="true">✓</span>
              <div>
                <h2>策略守门</h2>
                <p>SpendGuard 在每笔支付前实时预检，模型意图不合规即阻断</p>
              </div>
            </article>
            <article>
              <span className="hero-feature-icon" aria-hidden="true">□</span>
              <div>
                <h2>链上可验证</h2>
                <p>settlement hash、payload、AI 输出三合一，证据可追溯</p>
              </div>
            </article>
          </div>
          <div className="hero-sticker-cloud" aria-hidden="true">
            <img className="hero-sticker hero-sticker-moon" src="/illustrations/sticker-7.png" alt="" />
            <img className="hero-sticker hero-sticker-fishbone" src="/illustrations/sticker-8.png" alt="" />
            <img className="hero-sticker hero-sticker-sleep" src="/illustrations/sticker-6.png" alt="" />
          </div>
        </div>
      </section>

      <div className="demo-white-band">
        <div className="cat-boundary" aria-hidden="true">
          <svg
            className="cat-boundary-wave"
            viewBox="0 0 1440 190"
            preserveAspectRatio="none"
          >
            <path
              d="M0 102 C185 74 314 134 474 108 C644 81 759 70 924 102 C1094 135 1246 80 1440 104 L1440 190 L0 190 Z"
              fill="#fffdf9"
            />
            <path
              d="M0 102 C185 74 314 134 474 108 C644 81 759 70 924 102 C1094 135 1246 80 1440 104"
              fill="none"
              stroke="rgba(22, 22, 22, 0.06)"
              strokeWidth="2"
            />
          </svg>
          <div className="cat-boundary-row">
            {[1, 2, 3, 4].map((cat) => (
              <img
                className={`boundary-cat boundary-cat-${cat}`}
                key={cat}
                src={`/cats/cat-${cat}.png`}
                alt=""
              />
            ))}
          </div>
        </div>
        <section className="demo-showcase" id="demo" aria-label="Agent SpendGuard 演示流程">
          <div className="showcase-stickers" aria-hidden="true">
            <img className="showcase-sticker showcase-sticker-duck" src="/illustrations/sticker-9.png" alt="" />
            <img className="showcase-sticker showcase-sticker-fishbone" src="/illustrations/sticker-8.png" alt="" />
          </div>
          <div className="demo-showcase-copy">
            <p className="eyebrow">Live demo flow</p>
            <h2>从一次授权，到每一笔 agent 支付都有边界</h2>
            <ol className="flow-rail" aria-label="演示步骤">
              <li
                data-state={
                  permissionStepState === "done"
                    ? "done"
                    : walletStepState === "done"
                      ? "active"
                      : walletStepState
                }
              >
                <span>01</span>
                <div>
                  <strong>授权一条预算</strong>
                  <p>MetaMask Advanced Permission 限定 Base Sepolia USDC、金额和时间窗</p>
                </div>
              </li>
              <li data-state={paymentStepState}>
                <span>02</span>
                <div>
                  <strong>运行一次付费调用</strong>
                  <p>SpendGuard 预检后，接收 x402 402 challenge 并构造 ERC-7710 payload</p>
                </div>
              </li>
              <li data-state={ledgerStepState}>
                <span>03</span>
                <div>
                  <strong>留下可验证证据</strong>
                  <p>1Shot settlement、payload hash、tx hash、DeepSeek </p>
                </div>
              </li>
            </ol>
          </div>

          <div className="demo-operator">
            <DemoCommand
              narrative={narrative}
              onApprove={approvePermission}
              onConnect={connectWallet}
              onOverBudget={blockOverspend}
              onReset={resetDemo}
              onRevoke={revokePermission}
              onRun={runAgent}
              busyAction={busyAction}
              paidPocConfig={erc7710PaidPocConfig}
              paidPocResult={paidPocResult}
              state={state}
            />
          </div>
        </section>
      </div>

      <div className="demo-paper-band">
        <section className="craft-divider craft-divider-flow" aria-label="演示和技术区过渡">
          <div className="craft-divider-meta">
            <span className="craft-divider-avatar" aria-hidden="true" />
            <span>Demo note</span>
            <i aria-hidden="true" />
          </div>
          <div className="craft-divider-copy">
            <div className="divider-copy-text">
              <p className="eyebrow">Core stack</p>
              <p>
                「先跑通支付流程，再展开关键技术」
              </p>
              <div className="divider-note-chips" aria-hidden="true">
                <span>permission</span>
                <span>x402</span>
                <span>proof</span>
              </div>
            </div>
            <div className="divider-art divider-art-flow" aria-hidden="true">
              <img
                className="divider-art-main"
                src="/illustrations/raw/dino-flower.jpg"
                alt=""
              />
              <span>policy first</span>
              <img
                className="divider-art-float"
                src="/illustrations/raw/line-cat-face.jpg"
                alt=""
              />
            </div>
          </div>
        </section>

        <section className="demo-technology-showcase" aria-label="关键技术展示">
          <div className="tech-collage" aria-hidden="true">
            <img
              className="tech-collage-piece tech-collage-piece-desk"
              src="/illustrations/raw/sketch-desk-cat.jpg"
              alt=""
            />
            <img
              className="tech-collage-piece tech-collage-piece-sleep"
              src="/illustrations/raw/sleepy-fish-cat.jpg"
              alt=""
            />
            <img
              className="tech-collage-piece tech-collage-piece-moon"
              src="/illustrations/sticker-7.png"
              alt=""
            />
            <img
              className="tech-collage-piece tech-collage-piece-fish"
              src="/illustrations/sticker-8.png"
              alt=""
            />
          </div>
          <div className="tech-stickers" aria-hidden="true">
            <img className="tech-sticker tech-sticker-boxcat" src="/illustrations/sticker-5.png" alt="" />
            <img className="tech-sticker tech-sticker-duck" src="/illustrations/sticker-10.png" alt="" />
            <img className="tech-sticker tech-sticker-dino" src="/illustrations/raw/dino-flower.jpg" alt="" />
            <img className="tech-sticker tech-sticker-linecat" src="/illustrations/raw/line-cat-face.jpg" alt="" />
          </div>
          <DemoEvidenceStage
            paidPocResult={paidPocResult}
            remainingBudget={remainingBudget(state)}
            state={state}
          />
        </section>
      </div>

      <div className="demo-proof-band">
        <section className="craft-divider craft-divider-proof" aria-label="技术和证据区过渡">
          <div className="craft-divider-copy">
            <div className="divider-copy-text">
              <p className="eyebrow">Audit surface</p>
              <p>
                「一次授权，一次 x402 调用，证据自然留下」
              </p>
              <div className="divider-note-chips" aria-hidden="true">
                <span>ledger</span>
                <span>tx hash</span>
                <span>revocable</span>
              </div>
            </div>
            <div className="divider-art divider-art-proof" aria-hidden="true">
              <img
                className="divider-art-main"
                src="/illustrations/raw/lion-cat.jpg"
                alt=""
              />
              <span>audit trail</span>
              <img
                className="divider-art-float"
                src="/illustrations/raw/wave-cat.jpg"
                alt=""
              />
            </div>
          </div>
          <div className="craft-divider-meta">
            <span className="craft-divider-avatar" aria-hidden="true" />
            <span>Proof</span>
            <i aria-hidden="true" />
          </div>
        </section>

        <section className="proof-section" id="ledger" aria-label="账本和链上证据">
          <div className="proof-stickers" aria-hidden="true">
            <img className="proof-sticker proof-sticker-sleep" src="/illustrations/sticker-6.png" alt="" />
            <img className="proof-sticker proof-sticker-moon" src="/illustrations/sticker-7.png" alt="" />
            <img className="proof-sticker proof-sticker-wavecat" src="/illustrations/raw/wave-cat.jpg" alt="" />
          </div>
          <div className="proof-grid">
            <section className="proof-block" aria-label="支出账本">
              <div className="proof-item-header">
                <div>
                  <p className="eyebrow">支出账本</p>
                  <h2>结果留痕</h2>
                </div>
                <StatusBadge value={state.ledger} />
              </div>
              <SpendLedger state={state} />
            </section>

            <section className="proof-block" aria-label="ERC-7710 链上证明">
              <div className="proof-item-header">
                <div>
                  <p className="eyebrow">Chain Evidence</p>
                  <h2>ERC-7710 链上证明</h2>
                </div>
                <StatusBadge value={chainEvidenceStatus} />
              </div>
              <ChainEvidencePanel state={state} />
            </section>
          </div>
        </section>
      </div>
    </main>
    <ConfirmDialog
      onCancel={() => resolveConfirmation(false)}
      onConfirm={() => resolveConfirmation(true)}
      options={confirmDialog}
    />
    </>
  );
}
