import type { PaymentPayload } from "@x402/core/types";
import { NextResponse, type NextRequest } from "next/server";
import { spendguardConfig } from "@/server/config/spendguard";
import {
  runErc7710SettlementPreflight,
  type Erc7710SettlementPreflightResult
} from "@/server/x402/erc7710SelfSettlement";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PreflightBody = {
  paymentPayload?: unknown;
};

async function readBody(request: NextRequest): Promise<PreflightBody> {
  try {
    return (await request.json()) as PreflightBody;
  } catch {
    return {};
  }
}

function preflightFailures(results: Erc7710SettlementPreflightResult[]) {
  return results.filter((result) => !result.ok);
}

export async function POST(request: NextRequest) {
  if (!spendguardConfig.erc7710PaidPoc.enabled) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "ERC7710_PAID_POC_DISABLED",
          message: "The ERC-7710 paid PoC is disabled."
        }
      },
      { status: 404 }
    );
  }

  try {
    const body = await readBody(request);
    const paymentPayload = body.paymentPayload as PaymentPayload | undefined;

    if (!paymentPayload) {
      throw new Error("Missing payment payload.");
    }

    const results = await runErc7710SettlementPreflight(paymentPayload);
    const passing = results.filter((result) => result.ok);

    if (passing.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "ERC7710_SETTLEMENT_PREFLIGHT_REVERTED",
            message:
              "Local ERC-7710 settlement preflight reverted for every facilitator redeemer. The paid request was not submitted.",
            details: {
              results: preflightFailures(results)
            }
          }
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      ok: true,
      data: {
        okToSubmit: true,
        simulatedRedeemers: passing.map((result) => result.redeemer)
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "ERC7710_SETTLEMENT_PREFLIGHT_FAILED",
          message:
            error instanceof Error ? error.message : "ERC-7710 settlement preflight failed."
        }
      },
      { status: 400 }
    );
  }
}
