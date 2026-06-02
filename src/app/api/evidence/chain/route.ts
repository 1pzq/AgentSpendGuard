import { jsonError, jsonOk } from "@/app/api/_lib/demoState";
import { verifyChainEvidence } from "@/server/chain-evidence/verifyChainEvidence";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return typeof error === "string" ? error : "Unknown chain evidence error";
}

export async function GET() {
  try {
    return jsonOk(await verifyChainEvidence());
  } catch (error) {
    return jsonError(
      "CHAIN_EVIDENCE_VERIFY_FAILED",
      errorMessage(error),
      { status: 502 }
    );
  }
}
