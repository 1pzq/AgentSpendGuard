import { x402HTTPResourceServer } from "@x402/core/http";
import type {
  HTTPAdapter,
  ProcessSettleSuccessResponse,
  HTTPResponseInstructions,
  HTTPTransportContext,
  RouteConfig
} from "@x402/core/http";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import {
  HTTPFacilitatorClient,
  x402ResourceServer
} from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { NextResponse, type NextRequest } from "next/server";
import { spendguardConfig } from "@/server/config/spendguard";

export const x402ProtectedApiPath = `/api${spendguardConfig.endpoint.path}`;

export type X402VerifiedPaymentContext = {
  declaredExtensions?: Record<string, unknown>;
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
};

export type X402SettledPaymentContext<T> = X402VerifiedPaymentContext & {
  data: T;
  settlement: ProcessSettleSuccessResponse;
};

export type X402ProtectedJsonOptions<T> = {
  onSettled?(context: X402SettledPaymentContext<T>): Promise<void> | void;
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

function createX402HTTPServer() {
  const facilitatorClient = new HTTPFacilitatorClient({
    url: spendguardConfig.x402FacilitatorUrl
  });
  const resourceServer = new x402ResourceServer(facilitatorClient);

  resourceServer.register(
    spendguardConfig.x402Network,
    new ExactEvmScheme()
  );

  const routes: Record<string, RouteConfig> = {
    [`POST ${x402ProtectedApiPath}`]: {
      accepts: {
        scheme: "exact",
        network: spendguardConfig.x402Network,
        payTo: spendguardConfig.x402PayTo,
        price: spendguardConfig.x402Price,
        maxTimeoutSeconds: 300
      },
      description: `${spendguardConfig.endpoint.service} wallet risk brief`,
      mimeType: "application/json",
      serviceName: "Agent SpendGuard",
      tags: ["ai", "risk-brief", spendguardConfig.endpoint.aiProvider],
      unpaidResponseBody: () => ({
        contentType: "application/json",
        body: {
          ok: false,
          error: {
            code: "PAYMENT_REQUIRED",
            message:
              "x402 payment is required before the DeepSeek risk brief can run."
          }
        }
      }),
      settlementFailedResponseBody: (_context, settleResult) => ({
        contentType: "application/json",
        body: {
          ok: false,
          error: {
            code: "PAYMENT_SETTLEMENT_FAILED",
            message: settleResult.errorMessage ?? settleResult.errorReason
          }
        }
      })
    }
  };

  const httpServer = new x402HTTPResourceServer(resourceServer, routes);

  return httpServer;
}

async function getX402HTTPServer() {
  if (!httpServerPromise) {
    httpServerPromise = (async () => {
      const server = createX402HTTPServer();
      await server.initialize();
      return server;
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
    return NextResponse.json(instructions.body, {
      headers,
      status: instructions.status
    });
  }

  return new NextResponse(String(instructions.body), {
    headers,
    status: instructions.status
  });
}

export async function runX402ProtectedJson<T>(
  request: NextRequest,
  handler: (context: X402VerifiedPaymentContext) => Promise<T>,
  options: X402ProtectedJsonOptions<T> = {}
) {
  const server = await getX402HTTPServer();
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
          message: "This endpoint is not covered by the x402 route config."
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
