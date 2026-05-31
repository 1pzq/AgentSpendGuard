import {
  BASE_SEPOLIA_CHAIN_HEX_ID,
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_CHAIN_NAME
} from "@/shared/chain";
import { updatePermissionRecord } from "@/server/permissions/store";
import {
  buildDashboardState,
  jsonError,
  jsonOk,
  setDemoPhase
} from "../../_lib/demoState";

type WalletConnectRequestBody = {
  walletInfo?: {
    eoa?: unknown;
    account?: unknown;
    chainId?: unknown;
  };
};

function isAddress(value: unknown): value is string {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function isBaseSepoliaChain(value: unknown): boolean {
  if (typeof value === "number") return value === BASE_SEPOLIA_CHAIN_ID;
  if (typeof value !== "string") return false;

  return (
    value.toLowerCase() === BASE_SEPOLIA_CHAIN_HEX_ID ||
    value === BASE_SEPOLIA_CHAIN_ID.toString()
  );
}

async function readBody(request: Request): Promise<WalletConnectRequestBody> {
  try {
    return (await request.json()) as WalletConnectRequestBody;
  } catch {
    return {};
  }
}

export async function POST(request: Request) {
  const body = await readBody(request);
  const eoa = body.walletInfo?.eoa ?? body.walletInfo?.account;
  const chainId = body.walletInfo?.chainId;

  if (!isAddress(eoa)) {
    return jsonError(
      "INVALID_WALLET_INFO",
      "Wallet connect requires a valid MetaMask EOA.",
      { status: 422 }
    );
  }

  if (!isBaseSepoliaChain(chainId)) {
    return jsonError(
      "UNSUPPORTED_WALLET_CHAIN",
      "Connect MetaMask on Base Sepolia before requesting permission.",
      { status: 422 }
    );
  }

  updatePermissionRecord({
    advancedPermissionGrant: null,
    approvedAt: null,
    mockSignature: null,
    revokedAt: null,
    revokedReason: null,
    status: "requested",
    wallet: {
      eoa,
      smartAccount: null,
      chain: BASE_SEPOLIA_CHAIN_NAME
    }
  });
  setDemoPhase("permission_requested");

  return jsonOk({
    state: buildDashboardState()
  });
}
