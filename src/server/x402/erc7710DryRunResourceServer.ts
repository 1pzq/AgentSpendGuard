import { x402Erc7710Server } from "@metamask/x402";
import { encodePaymentRequiredHeader } from "@x402/core/http";
import type { PaymentRequired, PaymentRequirements } from "@x402/core/types";
import { NextResponse, type NextRequest } from "next/server";
import { spendguardConfig } from "@/server/config/spendguard";

export const x402DeepSeekRiskBriefDryRunPath =
  "/x402/deepseek/risk-brief/dry-run";

export const x402DeepSeekRiskBriefDryRunApiPath =
  `/api${x402DeepSeekRiskBriefDryRunPath}`;

const erc7710Server = new x402Erc7710Server();

const PAYMENT_HEADER_NAMES = [
  "payment-signature",
  "x-payment",
  "payment"
] as const;

type PaymentHeaderName = (typeof PAYMENT_HEADER_NAMES)[number];

type DryRunErrorCode = "PAYMENT_REQUIRED_DRY_RUN" | "DRY_RUN_PAYMENT_REJECTED";

type DryRunError = {
  code: DryRunErrorCode;
  details?: Record<string, unknown>;
  message: string;
};

type DryRunPaymentRequiredBody = {
  dryRun: true;
  error: DryRunError;
  noSpend: {
    acceptsPaymentHeaders: false;
    callsSettlement: false;
    recordsLedgerSpend: false;
    runsPaidHandler: false;
  };
  ok: false;
  x402: PaymentRequired;
};

type DryRunRejectedBody = {
  dryRun: true;
  error: DryRunError;
  noSpend: {
    callsSettlement: false;
    recordsLedgerSpend: false;
    runsPaidHandler: false;
  };
  ok: false;
};

function noStoreHeaders() {
  return new Headers({
    "Cache-Control": "no-store",
    "X-AgentSpendGuard-Dry-Run": "true"
  });
}

function dryRunPaymentRequirementBase(): PaymentRequirements {
  return {
    amount: spendguardConfig.policy.pricePerCallAtomic,
    asset: spendguardConfig.token.address,
    extra: {},
    maxTimeoutSeconds: 300,
    network: spendguardConfig.x402Network,
    payTo: spendguardConfig.x402PayTo,
    scheme: "exact"
  };
}

async function buildErc7710Requirement(): Promise<PaymentRequirements> {
  const requirement = await erc7710Server.enhancePaymentRequirements(
    dryRunPaymentRequirementBase(),
    {}
  );

  return {
    ...requirement,
    network: spendguardConfig.x402Network,
    extra: requirement.extra ?? {}
  };
}

export function findDryRunPaymentHeader(headers: Headers): PaymentHeaderName | null {
  return PAYMENT_HEADER_NAMES.find((name) => headers.has(name)) ?? null;
}

export async function buildErc7710DryRunPaymentRequired(
  request: NextRequest
): Promise<PaymentRequired> {
  const requirement = await buildErc7710Requirement();

  return {
    accepts: [requirement],
    error: "Payment required",
    resource: {
      description: "DeepSeek wallet risk brief ERC-7710 dry-run requirement",
      mimeType: "application/json",
      serviceName: "Agent SpendGuard",
      tags: ["ai", "risk-brief", "deepseek", "erc7710", "dry-run"],
      url: request.url
    },
    x402Version: 2
  };
}

export async function erc7710DryRunPaymentRequiredResponse(
  request: NextRequest
) {
  const paymentRequired = await buildErc7710DryRunPaymentRequired(request);
  const headers = noStoreHeaders();

  headers.set("PAYMENT-REQUIRED", encodePaymentRequiredHeader(paymentRequired));

  const body: DryRunPaymentRequiredBody = {
    dryRun: true,
    error: {
      code: "PAYMENT_REQUIRED_DRY_RUN",
      message:
        "ERC-7710 x402 payment requirement generated for dry-run only. Do not submit a payment signature to this endpoint."
    },
    noSpend: {
      acceptsPaymentHeaders: false,
      callsSettlement: false,
      recordsLedgerSpend: false,
      runsPaidHandler: false
    },
    ok: false,
    x402: paymentRequired
  };

  return NextResponse.json(body, {
    headers,
    status: 402
  });
}

export function erc7710DryRunPaymentRejectedResponse(
  headerName: PaymentHeaderName
) {
  const body: DryRunRejectedBody = {
    dryRun: true,
    error: {
      code: "DRY_RUN_PAYMENT_REJECTED",
      details: {
        header: headerName
      },
      message:
        "Dry-run endpoint refuses payment headers; no payment verification or settlement was attempted."
    },
    noSpend: {
      callsSettlement: false,
      recordsLedgerSpend: false,
      runsPaidHandler: false
    },
    ok: false
  };

  return NextResponse.json(body, {
    headers: noStoreHeaders(),
    status: 400
  });
}
