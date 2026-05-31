import type { RelayerStatus, SpendGuardDemoState } from "@/shared/types";
import { StatusBadge } from "./StatusBadge";

const RELAYER_ORDER: RelayerStatus[] = [
  "quote_requested",
  "quoted",
  "submitted",
  "confirmed"
];

function shortHash(value: string | null) {
  if (!value) return "No relay transaction yet.";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function classForRelayerStep(current: RelayerStatus, step: RelayerStatus) {
  const currentIndex = RELAYER_ORDER.indexOf(current);
  const stepIndex = RELAYER_ORDER.indexOf(step);

  if (current === "confirmed" && stepIndex >= 0) return "is-complete";
  if (current === step) return "is-active";
  if (currentIndex > stepIndex && stepIndex >= 0) return "is-complete";
  return undefined;
}

type RelayerTimelineProps = {
  state: SpendGuardDemoState;
};

export function RelayerTimeline({ state }: RelayerTimelineProps) {
  const { relayerInfo } = state;
  const steps = [
    {
      state: "quote_requested" as const,
      title: "Quote requested",
      copy: relayerInfo.quoteId ?? "Waiting for agent payment."
    },
    {
      state: "quoted" as const,
      title: "Fee quoted",
      copy: relayerInfo.fee ?? "No quote yet."
    },
    {
      state: "submitted" as const,
      title: "Task submitted",
      copy: relayerInfo.taskId ?? "No task id yet."
    },
    {
      state: "confirmed" as const,
      title: "Confirmed",
      copy: shortHash(relayerInfo.txHash)
    }
  ];

  return (
    <article className="panel relayer-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">1Shot relayer</p>
          <h2>Execution timeline</h2>
        </div>
        <StatusBadge value={state.relayer} />
      </div>
      <ol className="timeline" aria-label="1Shot relayer timeline">
        {steps.map((step) => (
          <li className={classForRelayerStep(state.relayer, step.state)} key={step.state}>
            <span aria-hidden="true" />
            <div>
              <strong>{step.title}</strong>
              <p>{step.copy}</p>
            </div>
          </li>
        ))}
      </ol>
    </article>
  );
}
