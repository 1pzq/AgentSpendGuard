import { listLedgerEntries } from "@/server/ledger/store";
import { buildDashboardState, jsonOk } from "../_lib/demoState";

export const dynamic = "force-dynamic";

export async function GET() {
  return jsonOk({
    entries: listLedgerEntries(),
    state: buildDashboardState()
  });
}
