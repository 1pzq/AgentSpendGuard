import { NextResponse, type NextRequest } from "next/server";
import { spendguardConfig } from "@/server/config/spendguard";
import {
  erc7710DryRunPaymentRejectedResponse,
  erc7710DryRunPaymentRequiredResponse,
  findDryRunPaymentHeader
} from "@/server/x402/erc7710DryRunResourceServer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const paymentHeader = findDryRunPaymentHeader(request.headers);

  if (paymentHeader) {
    return erc7710DryRunPaymentRejectedResponse(paymentHeader);
  }

  if (spendguardConfig.aiProvider !== "deepseek") {
    return NextResponse.json(
      {
        dryRun: true,
        ok: false,
        error: {
          code: "X402_PROVIDER_NOT_ENABLED",
          message: "This x402 dry-run route is enabled only when AI_PROVIDER=deepseek."
        }
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-AgentSpendGuard-Dry-Run": "true"
        },
        status: 409
      }
    );
  }

  return erc7710DryRunPaymentRequiredResponse(request);
}
