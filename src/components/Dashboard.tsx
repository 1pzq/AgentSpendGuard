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
import { BASE_SEPOLIA_CHAIN_HEX_ID } from "@/shared/chain";
import type {
  ApiResponse,
  DashboardPolicyConfig,
  SpendGuardDemoState,
  StateEnums
} from "@/shared/types";
import { AgentControls, DemoCommand } from "./AgentControls";
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
  purpose: "Wallet risk brief",
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

const INITIAL_NARRATIVE = "Connect MetaMask to begin the bounded agent budget flow.";
const FALLBACK_DEMO_NOTE =
  "Fallback: the static story remains in prototype/index.html, and the mocked API demo can still be validated through the backend routes after Reset.";
const WALLET_CHANGED_NOTE =
  "MetaMask account or network changed. Reconnect before approving or spending.";

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
  requesting_402: "Requesting the ERC-7710 x402 challenge from the server.",
  building_delegation_payload:
    "Building the ERC-7710 x402 delegation payload from the stored grant.",
  preflighting_settlement:
    "Simulating ERC-7710 settlement locally before submitting payment.",
  submitting_paid_request:
    "Submitting the ERC-7710 paid request with the session permission.",
  settling: "Verifying ERC-7710 settlement and refreshing the spend ledger."
};

const ERC7710_PAID_POC_STAGE_COPY: Record<Erc7710PaidPocStage, string> = {
  requesting_402: "Requesting the ERC-7710 paid PoC x402 challenge.",
  building_delegation_payload:
    "Building the ERC-7710 x402 delegation payload from the stored grant.",
  preflighting_settlement:
    "Simulating ERC-7710 settlement locally before submitting to the facilitator.",
  submitting_paid_request:
    "Submitting the ERC-7710 paid request for 0.01 USDC.",
  settling: "Verifying ERC-7710 settlement and refreshing the spend ledger."
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
      "MetaMask was not detected. Install or enable the extension, then retry Connect."
  },
  [WALLET_ERROR_CODES.WALLET_NOT_METAMASK]: {
    walletStatus: "unsupported",
    message:
      "A wallet provider was found, but it is not MetaMask. Use MetaMask on Base Sepolia for this demo."
  },
  [WALLET_ERROR_CODES.USER_REJECTED]: {
    walletStatus: "disconnected",
    message:
      "Connection was cancelled in MetaMask. Wallet remains disconnected and no policy was approved."
  },
  [WALLET_ERROR_CODES.CHAIN_SWITCH_REJECTED]: {
    walletStatus: "unsupported",
    message:
      "Switching to Base Sepolia was cancelled. Wallet remains unsupported for this demo and no policy was approved."
  },
  [WALLET_ERROR_CODES.CHAIN_ADD_REJECTED]: {
    walletStatus: "unsupported",
    message:
      "Adding Base Sepolia to MetaMask was cancelled. Wallet remains unsupported for this demo and no policy was approved."
  },
  [WALLET_ERROR_CODES.UNKNOWN_WALLET_ERROR]: {
    walletStatus: "disconnected",
    message:
      "MetaMask connection failed before permission setup. Wallet remains disconnected and no policy was approved."
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
      reason: "Second paid action has not been requested."
    },
    walletInfo: {
      eoa: null,
      smartAccount: null,
      chain: "Base Sepolia required"
    },
    advancedPermissionGrant: null,
    policyConfig: { ...POLICY_DEFAULTS },
    relayerInfo: {
      quoteId: null,
      fee: null,
      taskId: null,
      txHash: null
    },
    veniceResult: null,
    ledgerEntries: []
  };
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function remainingBudget(state: SpendGuardDemoState) {
  return roundMoney(state.policyConfig.maxSpend - state.policyConfig.spent);
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
        message: `${copy.message} Detail: ${error.message}`
      };
    }

    return copy;
  }

  return {
    walletStatus: "disconnected",
    message:
      error instanceof Error
        ? `${error.message} Wallet remains disconnected and no policy was approved.`
        : "Wallet connection failed. Wallet remains disconnected and no policy was approved."
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
  if (phase === "precheck") return `Agent precheck failed: ${message}`;
  if (phase === "refresh") return `Ledger refresh failed after payment: ${message}`;
  return `${ERC7710_RUN_STAGE_COPY[phase]} Failed: ${message}`;
}

function paidPocFailureMessage(
  phase: Erc7710PaidPocStage | "refresh" | null,
  message: string
) {
  if (!phase) return message;
  if (phase === "refresh") return `Ledger refresh failed after ERC-7710 paid PoC: ${message}`;
  return `${ERC7710_PAID_POC_STAGE_COPY[phase]} Failed: ${message}`;
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
  const paidPocFailurePhaseRef = useRef<Erc7710PaidPocStage | "refresh" | null>(
    null
  );
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
        setNarrative(
          persistedState.permission === "approved" &&
            persistedState.advancedPermissionGrant
            ? "Stored MetaMask Advanced Permission grant restored. Run Agent can use ERC-7710 without requesting a new permission."
            : INITIAL_NARRATIVE
        );
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
          ? "MetaMask left Base Sepolia. Reconnect on Base Sepolia before approving or spending."
          : WALLET_CHANGED_NOTE;

      resetAfterWalletChange(walletStatus, message);
    }

    function handleDisconnect() {
      resetAfterWalletChange(
        "disconnected",
        "MetaMask disconnected. Reconnect before approving or spending."
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
        setNarrative("Opening MetaMask. Confirm the account and Base Sepolia network.");
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
          )} on Base Sepolia. Review the scoped permission before approval.`
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
          `Opening MetaMask Advanced Permissions for a ${state.policyConfig.maxSpend.toFixed(
            2
          )} USDC / 24h Base Sepolia grant.`
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
          "MetaMask Advanced Permission approved. SpendGuard stored the grant and the agent can now spend only inside this policy."
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
            : "MetaMask Advanced Permission approval failed."
        );
      }
    });
  }

  async function blockOverspend() {
    await runExclusive("overBudget", async () => {
      const walletEpoch = walletEpochRef.current;

      try {
        setState((current) => ({
          ...current,
          agentAction: "running",
          payment: "required_402"
        }));
        const attemptedAmountAtomic = decimalToAtomic(
          state.policyConfig.maxSpend + state.policyConfig.pricePerCall
        );
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
          "Oversized request blocked before payment. SpendGuard recorded the policy violation without submitting a settlement."
        );
      } catch (error) {
        setState((current) => ({
          ...current,
          agentAction: "failed",
          payment: current.payment === "none" ? "none" : "failed"
        }));
        setNarrative(error instanceof Error ? error.message : "Over-budget run failed.");
      }
    });
  }

  async function runAgent() {
    if (state.policy !== "active" || state.permission !== "approved") return;

    await runExclusive("run", async () => {
      const walletEpoch = walletEpochRef.current;

      try {
        if (!erc7710PaidPocConfig.enabled) {
          setNarrative(
            "ERC-7710 payment is disabled. Enable the local ERC-7710 payment flag before running the agent."
          );
          return;
        }

        runFailurePhaseRef.current = "precheck";
        setNarrative("Checking policy budget, scope, expiry, and wallet state.");
        setState((current) => ({
          ...current,
          agentAction: "prechecking",
          payment: "none",
          relayer: "not_used"
        }));

        await postDashboardAction("/api/agent/precheck", {
          amountAtomic: erc7710PaidPocConfig.amountAtomic
        });

        runFailurePhaseRef.current = "requesting_402";
        setState((current) => ({
          ...current,
          agentAction: "running",
          payment: "required_402"
        }));
        setNarrative(ERC7710_RUN_STAGE_COPY.requesting_402);

        const result = await payErc7710DeepseekRiskBrief({
          advancedPermissionGrant: state.advancedPermissionGrant,
          confirmAfterPreflight(preflight) {
            return window.confirm(
              `Local ERC-7710 settlement preflight passed with ${preflight.simulatedRedeemers.length} facilitator signer(s). Submit the real ${erc7710PaidPocConfig.priceLabel} agent payment now?`
            );
          },
          expectedAmountAtomic: erc7710PaidPocConfig.amountAtomic,
          expectedPayTo: state.policyConfig.payTo,
          onStage(stage) {
            runFailurePhaseRef.current = stage;
            setState((current) => ({
              ...current,
              agentAction: "running",
              payment: paymentStateForPaidPocStage(stage)
            }));
            setNarrative(ERC7710_RUN_STAGE_COPY[stage]);
          },
          walletAddress: state.walletInfo.eoa
        });

        runFailurePhaseRef.current = "refresh";
        const { state: nextState } = await getDashboardState();
        if (!isCurrentWalletEpoch(walletEpoch)) {
          void resetDemoServer();
          return;
        }

        setState(nextState);
        setPaidPocResult(result);
        runFailurePhaseRef.current = null;
        setNarrative(
          `ERC-7710 payment settled and ${nextState.policyConfig.service} returned a paid risk brief. Tx ${result.x402.txHash ? shortenAddress(result.x402.txHash) : "pending"} is now in the ledger.`
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Agent run failed.";
        setState((current) => ({
          ...current,
          agentAction: "failed",
          payment: current.payment === "none" ? "none" : "failed"
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
          "Dry run is fetching the unpaid x402 requirement and building an ERC-7710 delegation preview without submitting payment."
        );
        const preview = await dryRunErc7710Payment({
          advancedPermissionGrant: state.advancedPermissionGrant,
          expectedPayTo: state.policyConfig.payTo,
          maxAmountAtomic: decimalToAtomic(state.policyConfig.pricePerCall),
          walletAddress: state.walletInfo.eoa
        });

        setDryRunPreview(preview);
        setNarrative(
          `ERC-7710 dry run ready for ${preview.requirement.amountAtomic} atomic ${state.policyConfig.token}. No PAYMENT-SIGNATURE header or paid retry was sent.`
        );
      } catch (error) {
        setDryRunPreview(null);
        setNarrative(
          error instanceof Error ? error.message : "ERC-7710 dry run failed."
        );
      }
    });
  }

  async function runPaidErc7710Poc() {
    if (!erc7710PaidPocConfig.enabled) return;

    const confirmed = window.confirm(
      `This will spend ${erc7710PaidPocConfig.priceLabel} Base Sepolia USDC through the ERC-7710 x402 paid PoC. Continue?`
    );
    if (!confirmed) return;

    await runExclusive("paidPoc", async () => {
      const walletEpoch = walletEpochRef.current;

      try {
        paidPocFailurePhaseRef.current = "requesting_402";
        setPaidPocResult(null);
        setState((current) => ({
          ...current,
          agentAction: "running",
          payment: "required_402",
          relayer: "not_used"
        }));
        setNarrative(ERC7710_PAID_POC_STAGE_COPY.requesting_402);

        const result = await payErc7710DeepseekRiskBrief({
          advancedPermissionGrant: state.advancedPermissionGrant,
          confirmAfterPreflight(preflight) {
            return window.confirm(
              `Local ERC-7710 settlement preflight passed with ${preflight.simulatedRedeemers.length} facilitator signer(s). Submit the real ${erc7710PaidPocConfig.priceLabel} settlement now?`
            );
          },
          expectedAmountAtomic: erc7710PaidPocConfig.amountAtomic,
          expectedPayTo: state.policyConfig.payTo,
          onStage(stage) {
            paidPocFailurePhaseRef.current = stage;
            setState((current) => ({
              ...current,
              agentAction: "running",
              payment: paymentStateForPaidPocStage(stage)
            }));
            setNarrative(ERC7710_PAID_POC_STAGE_COPY[stage]);
          },
          walletAddress: state.walletInfo.eoa
        });

        paidPocFailurePhaseRef.current = "refresh";
        const { state: nextState } = await getDashboardState();
        if (!isCurrentWalletEpoch(walletEpoch)) {
          void resetDemoServer();
          return;
        }

        setState(nextState);
        setPaidPocResult(result);
        paidPocFailurePhaseRef.current = null;
        setNarrative(
          `ERC-7710 paid PoC settled for ${erc7710PaidPocConfig.priceLabel}. Ledger payer ${shortenAddress(
            result.x402.payer
          )}, tx ${result.x402.txHash ? shortenAddress(result.x402.txHash) : "pending"}.`
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "ERC-7710 paid PoC failed.";
        setState((current) => ({
          ...current,
          agentAction: "failed",
          payment: current.payment === "none" ? "none" : "failed"
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
            "No MetaMask Advanced Permission grant is stored for this session. Reset and approve a real grant before syncing revoke."
          );
          return;
        }

        setState((current) => ({
          ...current,
          revocation: "revoking"
        }));
        setNarrative("Opening MetaMask to revoke the Advanced Permission.");
        const revokeResult = await revokeAdvancedSpendPermission(
          state.advancedPermissionGrant,
          {
            onStage(stage) {
              setNarrative(
                stage === "requesting_wallet_revoke"
                  ? "Opening MetaMask to revoke the Advanced Permission."
                  : "Checking MetaMask granted permissions after the revoke attempt."
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
              "This MetaMask build does not support dapp-triggered Advanced Permission revoke. Revoke it in MetaMask Dapp connections, then click Revoke again to sync. No local revoke was recorded."
            );
          } else if (revokeResult.directRevokeStatus === "rejected") {
            setNarrative(
              "Direct revoke was cancelled in MetaMask. The grant is still active, and no local revoke was recorded."
            );
          } else if (revokeResult.directRevokeStatus === "failed") {
            setNarrative(
              `Direct revoke failed${
                revokeResult.directRevokeMessage
                  ? `: ${revokeResult.directRevokeMessage}`
                  : "."
              } MetaMask still reports the grant as active, so no local revoke was recorded.`
            );
          } else {
            setNarrative(
              "MetaMask still reports this Advanced Permission as active after the revoke attempt. No local revoke was recorded."
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
            ? "MetaMask grant is expired. The local policy is now closed and the agent cannot spend."
            : revokeResult.directRevokeStatus === "submitted"
              ? "MetaMask direct revoke was confirmed by wallet sync. The local policy is now closed and the agent cannot spend."
              : "MetaMask no longer reports this grant. The local policy is now closed and the agent cannot spend."
        );
      } catch (error) {
        setState((current) => ({
          ...current,
          revocation: "failed"
        }));
        setNarrative(
          error instanceof Error
            ? error.message
            : "MetaMask permission sync failed before local revoke."
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
        setNarrative(error instanceof Error ? error.message : "Demo reset failed.");
      }
    });
  }

  return (
    <main className="app-shell">
      <header className="topbar" aria-label="SpendGuard dashboard header">
        <div>
          <p className="eyebrow">Agent SpendGuard</p>
          <h1>Scoped onchain budget for one AI agent</h1>
        </div>
        <div className="status-cluster" aria-label="Current state summary">
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

      <section className="dashboard-grid" aria-label="SpendGuard dashboard">
        <WalletPanel state={state} />
        <PolicyCard remainingBudget={remaining} state={state} />
        <PermissionPreview state={state} />
        <AgentControls state={state} />
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
