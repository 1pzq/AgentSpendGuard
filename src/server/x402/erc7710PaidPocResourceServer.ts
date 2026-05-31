import { x402ExactEvmErc7710ServerScheme } from "@metamask/x402";
import {
  decodePaymentRequiredHeader,
  x402HTTPResourceServer
} from "@x402/core/http";
import type {
  HTTPAdapter,
  HTTPResponseInstructions,
  HTTPTransportContext,
  ProcessSettleSuccessResponse,
  RouteConfig
} from "@x402/core/http";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import {
  HTTPFacilitatorClient,
  x402ResourceServer
} from "@x402/core/server";
import { NextResponse, type NextRequest } from "next/server";
import { isHex, keccak256, size, type Hex } from "viem";
import { spendguardConfig } from "@/server/config/spendguard";
import { configureProjectProxy } from "@/server/network/proxy";
import { Erc7710SelfSettlingFacilitatorClient } from "@/server/x402/erc7710SelfSettlement";
import { inspectErc7710RedeemerConstraint } from "@/shared/x402/erc7710DelegationInspector";

export const x402Erc7710PaidPocApiPath =
  spendguardConfig.erc7710PaidPoc.apiPath;

export type Erc7710PaidPocVerifiedPaymentContext = {
  declaredExtensions?: Record<string, unknown>;
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
};

export type Erc7710PaidPocSettledPaymentContext<T> =
  Erc7710PaidPocVerifiedPaymentContext & {
    data: T;
    settlement: ProcessSettleSuccessResponse;
  };

export type Erc7710PaidPocProtectedJsonOptions<T> = {
  onSettled?(context: Erc7710PaidPocSettledPaymentContext<T>): Promise<void> | void;
};

class NextRequestX402Adapter implements HTTPAdapter {
  constructor(private readonly request: NextRequest) {}

  getHeader(name: string): string | undefined {
    return this.request.headers.get(name) ?? undefined;
  }

  getMethod(): string {
    return this.request.method;
  }

  getPath(): string {
    return new URL(this.request.url).pathname;
  }

  getUrl(): string {
    return this.request.url;
  }

  getAcceptHeader(): string {
    return this.request.headers.get("accept") ?? "";
  }

  getUserAgent(): string {
    return this.request.headers.get("user-agent") ?? "";
  }

  getQueryParams(): Record<string, string | string[]> {
    const params = new URL(this.request.url).searchParams;
    const result: Record<string, string | string[]> = {};

    params.forEach((value, key) => {
      const current = result[key];
      if (!current) {
        result[key] = value;
      } else if (Array.isArray(current)) {
        current.push(value);
      } else {
        result[key] = [current, value];
      }
    });

    return result;
  }

  getQueryParam(name: string): string | string[] | undefined {
    return this.getQueryParams()[name];
  }
}

let httpServerPromise: Promise<x402HTTPResourceServer> | null = null;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function optionalString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function optionalStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function summarizeErc7710PaymentPayload(paymentPayload: unknown) {
  const payment = asRecord(paymentPayload);
  const accepted = asRecord(payment?.accepted);
  const acceptedExtra = asRecord(accepted?.extra);
  const payload = asRecord(payment?.payload);
  const permissionContext = optionalString(payload?.permissionContext);
  const permissionContextIsHex = !!permissionContext && isHex(permissionContext);
  const facilitatorAddresses = optionalStringArray(acceptedExtra?.facilitatorAddresses);
  const redeemerInspection = permissionContextIsHex
    ? inspectErc7710RedeemerConstraint(
        permissionContext as Hex,
        facilitatorAddresses
      )
    : null;

  return {
    acceptedAmount: optionalString(accepted?.amount),
    acceptedNetwork: optionalString(accepted?.network),
    acceptedPayTo: optionalString(accepted?.payTo),
    acceptedMethod: optionalString(acceptedExtra?.assetTransferMethod),
    acceptedFacilitatorAddresses: facilitatorAddresses,
    delegationManager: optionalString(payload?.delegationManager),
    delegator: optionalString(payload?.delegator),
    permissionContextBytes: permissionContextIsHex ? size(permissionContext) : null,
    permissionContextHash: permissionContextIsHex
      ? keccak256(permissionContext)
      : null,
    redeemerEnforcer: redeemerInspection?.redeemerEnforcer ?? null,
    redeemerCaveatCount: redeemerInspection?.redeemerCaveatCount ?? 0,
    acceptedFacilitatorRedeemers:
      redeemerInspection?.acceptedRedeemers ?? [],
    missingAcceptedFacilitatorRedeemers:
      redeemerInspection?.missingRequiredRedeemers ?? facilitatorAddresses,
    hasRedeemerEnforcer: redeemerInspection?.hasRedeemerEnforcer ?? false,
    hasAcceptedFacilitatorRedeemer:
      redeemerInspection?.hasAcceptedFacilitatorRedeemer ?? false,
    hasAllAcceptedFacilitatorRedeemers:
      redeemerInspection?.hasAllRequiredRedeemers ?? false,
    redeemerInspectionError: redeemerInspection?.error ?? null
  };
}

function summarizeErc7710PaymentRequirements(requirements: PaymentRequirements) {
  const extra = asRecord(requirements.extra);

  return {
    amount: requirements.amount,
    asset: requirements.asset,
    network: requirements.network,
    payTo: requirements.payTo,
    scheme: requirements.scheme,
    assetTransferMethod: requirements.extra?.assetTransferMethod ?? null,
    facilitatorAddresses: optionalStringArray(extra?.facilitatorAddresses)
  };
}

function settlementFailureMessage(rawMessage: unknown) {
  const message =
    typeof rawMessage === "string" && rawMessage.trim().length > 0
      ? rawMessage.trim()
      : "ERC-7710 facilitator settlement failed.";
  const normalized = message.toLowerCase();

  if (
    normalized.includes("facilitator settle failed (504)") ||
    normalized.includes("<!doctype html") ||
    normalized.includes("<html")
  ) {
    return "MetaMask ERC-7710 facilitator settlement returned HTTP 504 before producing a tx hash. No SpendGuard ledger entry was recorded.";
  }

  return message.length > 500 ? `${message.slice(0, 500)}...` : message;
}

function createErc7710PaidPocHTTPServer() {
  configureProjectProxy();

  const httpFacilitatorClient = new HTTPFacilitatorClient({
    url: spendguardConfig.x402FacilitatorUrl
  });
  const facilitatorClient = spendguardConfig.erc7710PaidPoc.selfSettle.enabled
    ? new Erc7710SelfSettlingFacilitatorClient(httpFacilitatorClient)
    : httpFacilitatorClient;
  const resourceServer = new x402ResourceServer(facilitatorClient);
  const settlementStartTimes = new WeakMap<object, number>();

  resourceServer.register(
    spendguardConfig.x402Network,
    new x402ExactEvmErc7710ServerScheme()
  );
  resourceServer.onVerifyFailure(async ({ error, paymentPayload, requirements }) => {
    console.warn("ERC-7710 paid PoC x402 verification failed.", {
      amount: requirements.amount,
      assetTransferMethod: requirements.extra?.assetTransferMethod,
      error: error.message,
      network: requirements.network,
      payloadMethod: paymentPayload.accepted.extra?.assetTransferMethod
    });
  });
  resourceServer.onBeforeSettle(async ({ paymentPayload, requirements }) => {
    settlementStartTimes.set(paymentPayload, Date.now());
    console.info("ERC-7710 paid PoC settlement starting.", {
      payload: summarizeErc7710PaymentPayload(paymentPayload),
      requirements: summarizeErc7710PaymentRequirements(requirements)
    });
  });
  resourceServer.onAfterSettle(async ({ paymentPayload, result }) => {
    const startedAt = settlementStartTimes.get(paymentPayload);

    console.info("ERC-7710 paid PoC settlement completed.", {
      durationMs: startedAt ? Date.now() - startedAt : null,
      amount: result.amount ?? null,
      network: result.network ?? null,
      payer: result.payer ?? null,
      success: result.success,
      transaction: result.transaction ?? null
    });
  });
  resourceServer.onSettleFailure(async ({ error, paymentPayload, requirements }) => {
    const startedAt = settlementStartTimes.get(paymentPayload);

    console.warn("ERC-7710 paid PoC settlement failed.", {
      durationMs: startedAt ? Date.now() - startedAt : null,
      error: error instanceof Error ? error.message : String(error),
      payload: summarizeErc7710PaymentPayload(paymentPayload),
      requirements: summarizeErc7710PaymentRequirements(requirements)
    });
  });

  const erc7710Extra = {
    assetTransferMethod: "erc7710",
    ...(spendguardConfig.erc7710PaidPoc.facilitatorAddresses.length > 0
      ? {
          facilitatorAddresses:
            spendguardConfig.erc7710PaidPoc.facilitatorAddresses
        }
      : {})
  } as const;

  const routes: Record<string, RouteConfig> = {
    [`POST ${x402Erc7710PaidPocApiPath}`]: {
      accepts: {
        scheme: "exact",
        network: spendguardConfig.x402Network,
        payTo: spendguardConfig.x402PayTo,
        price: {
          amount: spendguardConfig.erc7710PaidPoc.priceAtomic,
          asset: spendguardConfig.token.address,
          extra: erc7710Extra
        },
        maxTimeoutSeconds: 300,
        extra: erc7710Extra
      },
      description: `${spendguardConfig.endpoint.service} wallet risk brief ERC-7710 paid PoC`,
      mimeType: "application/json",
      serviceName: "Agent SpendGuard",
      tags: ["ai", "risk-brief", "deepseek", "erc7710", "paid-poc"],
      unpaidResponseBody: () => ({
        contentType: "application/json",
        body: {
          ok: false,
          error: {
            code: "PAYMENT_REQUIRED",
            message:
              "ERC-7710 x402 payment is required for the 0.01 USDC paid PoC."
          }
        }
      }),
      settlementFailedResponseBody: (_context, settleResult) => ({
        contentType: "application/json",
        body: {
          ok: false,
          error: {
            code: "PAYMENT_SETTLEMENT_FAILED",
            message: settlementFailureMessage(
              settleResult.errorMessage ?? settleResult.errorReason
            ),
            details: {
              facilitatorUrl: spendguardConfig.x402FacilitatorUrl ?? null,
              ledgerRecorded: false,
              txHash: null
            }
          }
        }
      })
    }
  };

  return new x402HTTPResourceServer(resourceServer, routes);
}

async function getErc7710PaidPocHTTPServer() {
  if (!httpServerPromise) {
    httpServerPromise = (async () => {
      try {
        const server = createErc7710PaidPocHTTPServer();
        await server.initialize();
        return server;
      } catch (error) {
        httpServerPromise = null;
        throw error;
      }
    })();
  }

  return httpServerPromise;
}

function responseFromInstructions(instructions: HTTPResponseInstructions) {
  const headers = new Headers(instructions.headers);
  const contentType = headers.get("Content-Type") ?? "";

  if (
    instructions.body === undefined ||
    instructions.body === null ||
    instructions.body instanceof Uint8Array ||
    typeof instructions.body === "string"
  ) {
    return new NextResponse(instructions.body as BodyInit | null, {
      headers,
      status: instructions.status
    });
  }

  if (contentType.includes("application/json")) {
    return NextResponse.json(jsonBodyFromInstructions(instructions, headers), {
      headers,
      status: instructions.status
    });
  }

  return new NextResponse(String(instructions.body), {
    headers,
    status: instructions.status
  });
}

function isEmptyRecord(value: unknown) {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  );
}

function jsonBodyFromInstructions(
  instructions: HTTPResponseInstructions,
  headers: Headers
) {
  if (instructions.status !== 402 || !isEmptyRecord(instructions.body)) {
    return instructions.body;
  }

  const paymentRequiredHeader = headers.get("PAYMENT-REQUIRED");

  if (!paymentRequiredHeader) return instructions.body;

  try {
    const paymentRequired = decodePaymentRequiredHeader(paymentRequiredHeader);

    return {
      ok: false,
      error: {
        code: "X402_PAYMENT_VERIFICATION_FAILED",
        message: paymentRequired.error || "x402 payment verification failed."
      }
    };
  } catch {
    return instructions.body;
  }
}

export function erc7710PaidPocDisabledResponse() {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: "ERC7710_PAID_POC_DISABLED",
        message:
          "The ERC-7710 paid PoC is disabled. Set ERC7710_PAID_POC_ENABLED=true to enable this real 0.01 USDC testnet spend path."
      }
    },
    {
      headers: {
        "Cache-Control": "no-store"
      },
      status: 404
    }
  );
}

export async function runErc7710PaidPocProtectedJson<T>(
  request: NextRequest,
  handler: (context: Erc7710PaidPocVerifiedPaymentContext) => Promise<T>,
  options: Erc7710PaidPocProtectedJsonOptions<T> = {}
) {
  const server = await getErc7710PaidPocHTTPServer();
  const adapter = new NextRequestX402Adapter(request);
  const requestContext = {
    adapter,
    method: adapter.getMethod(),
    path: adapter.getPath()
  };
  const processResult = await server.processHTTPRequest(requestContext);

  if (processResult.type === "payment-error") {
    return responseFromInstructions(processResult.response);
  }

  if (processResult.type === "no-payment-required") {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "X402_ROUTE_NOT_PROTECTED",
          message: "This endpoint is not covered by the ERC-7710 paid PoC route config."
        }
      },
      { status: 500 }
    );
  }

  try {
    const verifiedContext = {
      declaredExtensions: processResult.declaredExtensions,
      paymentPayload: processResult.paymentPayload,
      paymentRequirements: processResult.paymentRequirements
    };
    const data = await handler(verifiedContext);
    const payload = {
      ok: true,
      data
    };
    const responseBody = Buffer.from(JSON.stringify(payload));
    const responseHeaders = {
      "Content-Type": "application/json"
    };
    const transportContext: HTTPTransportContext = {
      request: requestContext,
      responseBody,
      responseHeaders
    };
    const settlement = await server.processSettlement(
      processResult.paymentPayload,
      processResult.paymentRequirements,
      processResult.declaredExtensions,
      transportContext
    );

    if (!settlement.success) {
      return responseFromInstructions(settlement.response);
    }

    await options.onSettled?.({
      ...verifiedContext,
      data,
      settlement
    });

    const finalResponseBody = Buffer.from(JSON.stringify(payload));

    return new NextResponse(finalResponseBody, {
      headers: {
        ...responseHeaders,
        ...settlement.headers
      },
      status: 200
    });
  } catch (error) {
    await processResult.cancellationDispatcher.cancel({
      reason: "handler_threw",
      error
    });

    throw error;
  }
}
