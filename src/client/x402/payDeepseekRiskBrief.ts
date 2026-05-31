"use client";

import { x402Client, x402HTTPClient } from "@x402/core/client";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_PUBLIC_RPC_URL,
  BASE_SEPOLIA_USDC
} from "@/shared/chain";
import type { AiRiskBrief, ApiResponse } from "@/shared/types";
import {
  detectMetaMaskProvider,
  ensureBaseSepolia,
  getCurrentWalletState,
  WalletConnectionError,
  WALLET_ERROR_CODES,
  type EthereumProvider
} from "@/client/wallet/metamask";

type HexAddress = `0x${string}`;
type X402Network = `eip155:${number}`;

type PaidRiskBriefData = {
  brief: AiRiskBrief;
  x402: {
    amountAtomic: string;
    asset: string;
    network: string;
    payTo: string;
    payer: string;
    requirementId: string;
  };
};

export type X402PaymentStage =
  | "requesting_402"
  | "awaiting_signature"
  | "submitting_paid_request"
  | "settling";

type PaidDeepSeekRiskBriefInput = {
  expectedPayTo: string;
  maxAmountAtomic: string;
  onStage?: (stage: X402PaymentStage) => void;
  walletAddress: string | null;
};

const X402_NETWORK: X402Network = `eip155:${BASE_SEPOLIA_CHAIN_ID}`;

function isHexAddress(value: string | null | undefined): value is HexAddress {
  return !!value && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function isHexSignature(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[a-fA-F0-9]+$/.test(value);
}

function stringifyTypedData(value: unknown) {
  return JSON.stringify(value, (_key, item) =>
    typeof item === "bigint" ? item.toString() : item
  );
}

function typedDataDomainTypes(domain: Record<string, unknown>) {
  const fields = [
    ["name", "string"],
    ["version", "string"],
    ["chainId", "uint256"],
    ["verifyingContract", "address"],
    ["salt", "bytes32"]
  ] as const;

  return fields
    .filter(([name]) => domain[name] !== undefined)
    .map(([name, type]) => ({ name, type }));
}

function normalizeTypedDataForMetaMask(message: {
  domain: Record<string, unknown>;
  types: Record<string, unknown>;
  primaryType: string;
  message: Record<string, unknown>;
}) {
  return {
    ...message,
    types: {
      EIP712Domain: typedDataDomainTypes(message.domain),
      ...message.types
    }
  };
}

function paymentAmountAllowed(amount: string, maxAmountAtomic: string) {
  try {
    return BigInt(amount) > BigInt(0) && BigInt(amount) <= BigInt(maxAmountAtomic);
  } catch {
    return false;
  }
}

function createMetaMaskSigner(provider: EthereumProvider, address: HexAddress) {
  return {
    address,
    async signTypedData(message: {
      domain: Record<string, unknown>;
      types: Record<string, unknown>;
      primaryType: string;
      message: Record<string, unknown>;
    }): Promise<`0x${string}`> {
      const signature = await provider.request({
        method: "eth_signTypedData_v4",
        params: [address, stringifyTypedData(normalizeTypedDataForMetaMask(message))]
      });

      if (!isHexSignature(signature)) {
        throw new Error("MetaMask returned an invalid x402 payment signature.");
      }

      return signature;
    }
  };
}

function createHttpClient(input: PaidDeepSeekRiskBriefInput, signer: ReturnType<typeof createMetaMaskSigner>) {
  const client = new x402Client();

  registerExactEvmScheme(client, {
    networks: [X402_NETWORK],
    policies: [
      (_version, requirements) =>
        requirements.filter(
          (requirement) =>
            requirement.scheme === "exact" &&
            requirement.network === X402_NETWORK &&
            requirement.asset.toLowerCase() ===
              BASE_SEPOLIA_USDC.address.toLowerCase() &&
            requirement.payTo.toLowerCase() === input.expectedPayTo.toLowerCase() &&
            paymentAmountAllowed(requirement.amount, input.maxAmountAtomic)
        )
    ],
    schemeOptions: {
      [BASE_SEPOLIA_CHAIN_ID]: {
        rpcUrl: BASE_SEPOLIA_PUBLIC_RPC_URL
      }
    },
    signer
  });

  return new x402HTTPClient(client);
}

async function parseApiResponse(response: Response): Promise<ApiResponse<PaidRiskBriefData>> {
  try {
    return (await response.json()) as ApiResponse<PaidRiskBriefData>;
  } catch {
    return {
      ok: false,
      error: {
        code: "INVALID_RESPONSE",
        message: `Protected endpoint returned HTTP ${response.status} without JSON.`
      }
    };
  }
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return typeof error === "string" ? error : "Unknown error";
}

export async function runPaidDeepSeekRiskBrief(
  input: PaidDeepSeekRiskBriefInput
): Promise<PaidRiskBriefData> {
  const provider = detectMetaMaskProvider();
  await ensureBaseSepolia(provider);

  const walletState = await getCurrentWalletState();
  if (!isHexAddress(walletState.account)) {
    throw new WalletConnectionError(
      WALLET_ERROR_CODES.UNKNOWN_WALLET_ERROR,
      "MetaMask did not return a connected Base Sepolia account."
    );
  }

  const body = JSON.stringify({
    walletAddress: input.walletAddress ?? walletState.account
  });
  const signer = createMetaMaskSigner(provider, walletState.account);
  const httpClient = createHttpClient(input, signer);
  const requestInit = {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body
  } satisfies RequestInit;

  input.onStage?.("requesting_402");
  const unpaidResponse = await fetch(
    "/api/x402/deepseek/risk-brief",
    requestInit
  );

  if (unpaidResponse.status !== 402) {
    const json = await parseApiResponse(unpaidResponse);
    if (!json.ok) throw new Error(json.error.message);
    return json.data;
  }

  const unpaidBody = await parseApiResponse(unpaidResponse);
  const paymentRequired = httpClient.getPaymentRequiredResponse(
    (name) => unpaidResponse.headers.get(name),
    unpaidBody
  );
  let paymentPayload;
  try {
    input.onStage?.("awaiting_signature");
    paymentPayload = await httpClient.createPaymentPayload(paymentRequired);
  } catch (error) {
    throw new Error(`x402 payment signing failed: ${errorMessage(error)}`);
  }

  input.onStage?.("submitting_paid_request");
  const paidResponse = await fetch("/api/x402/deepseek/risk-brief", {
    ...requestInit,
    headers: {
      ...requestInit.headers,
      ...httpClient.encodePaymentSignatureHeader(paymentPayload)
    }
  });
  const json = await parseApiResponse(paidResponse);

  try {
    input.onStage?.("settling");
    await httpClient.processPaymentResult(
      paymentPayload,
      (name) => paidResponse.headers.get(name),
      paidResponse.status
    );
  } catch (error) {
    throw new Error(`x402 payment result processing failed: ${errorMessage(error)}`);
  }

  if (!paidResponse.ok || !json.ok) {
    throw new Error(
      json.ok ? `Protected endpoint failed with HTTP ${paidResponse.status}.` : json.error.message
    );
  }

  return json.data;
}
