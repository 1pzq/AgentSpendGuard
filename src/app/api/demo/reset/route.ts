import { resetLedgerDemoState } from "@/server/ledger/store";
import {
  resetPermissionDemoState,
  updatePermissionRecord
} from "@/server/permissions/store";
import { buildDashboardState, jsonOk, setDemoPhase } from "../../_lib/demoState";

export async function POST() {
  resetPermissionDemoState();
  updatePermissionRecord({
    approvedAt: null,
    mockSignature: null,
    status: "not_requested"
  });
  resetLedgerDemoState();
  setDemoPhase("initial");

  return jsonOk({
    state: buildDashboardState()
  });
}
