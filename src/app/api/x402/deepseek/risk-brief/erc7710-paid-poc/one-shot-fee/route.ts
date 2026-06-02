import { NextResponse } from "next/server";
import { oneShotAdapter } from "@/server/adapters/oneShotAdapter";
import { spendguardConfig } from "@/server/config/spendguard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function decimalTokenAmountToAtomic(value: string) {
  if (!/^\d+(\.\d+)?$/.test(value)) {
    throw new Error("1Shot minFee is not a decimal token amount.");
  }

  const [whole, fraction = ""] = value.split(".");
  const decimals = spendguardConfig.token.decimals;
  const padded = fraction.padEnd(decimals, "0").slice(0, decimals);

  return (BigInt(whole) * BigInt(10) ** BigInt(decimals) + BigInt(padded || "0")).toString();
}

export async function GET() {
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
    const feeData = await oneShotAdapter.getFeeData({
      chainId: spendguardConfig.chain.id,
      token: spendguardConfig.token.address
    });
    const feeCollector =
      feeData.feeCollector ?? spendguardConfig.oneShot.feeCollector;
    const targetAddress =
      feeData.targetAddress ?? spendguardConfig.oneShot.targetAddress;

    if (!feeCollector || !targetAddress) {
      throw new Error("1Shot fee collector or target address is unavailable.");
    }

    return NextResponse.json(
      {
        ok: true,
        data: {
          chainId: String(spendguardConfig.chain.id),
          feeCollector,
          minFeeAtomic: decimalTokenAmountToAtomic(feeData.minFee ?? "0"),
          targetAddress,
          tokenAddress: feeData.token?.address ?? spendguardConfig.token.address
        }
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "ONESHOT_FEE_QUOTE_FAILED",
          message:
            error instanceof Error ? error.message : "Failed to quote 1Shot fee metadata."
        }
      },
      { status: 502 }
    );
  }
}
