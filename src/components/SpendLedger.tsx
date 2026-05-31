import type { SpendGuardDemoState } from "@/shared/types";
import { StatusBadge } from "./StatusBadge";

type SpendLedgerProps = {
  state: SpendGuardDemoState;
};

export function SpendLedger({ state }: SpendLedgerProps) {
  const rows =
    state.ledgerEntries.length > 0
      ? state.ledgerEntries
      : [
          {
            time: "No ledger entries yet",
            service: "Waiting",
            cost: "0.00 USDC",
            status: "empty"
          }
        ];

  return (
    <article className="panel ledger-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Spend ledger</p>
          <h2>Observable agent spend</h2>
        </div>
        <StatusBadge value={state.ledger} />
      </div>
      <div className="ledger-table" role="table" aria-label="Spend ledger">
        <div className="ledger-row ledger-head" role="row">
          <span role="columnheader">Time</span>
          <span role="columnheader">Service</span>
          <span role="columnheader">Cost</span>
          <span role="columnheader">Status</span>
        </div>
        {rows.map((entry) => (
          <div className="ledger-row" key={`${entry.time}-${entry.service}-${entry.status}`}>
            <span>{entry.time}</span>
            <span>{entry.service}</span>
            <span>{entry.cost}</span>
            <span>
              <span className={`ledger-status ${entry.status}`}>{entry.status}</span>
            </span>
          </div>
        ))}
      </div>
    </article>
  );
}
