import type { RelayerStatus, SpendGuardDemoState } from "@/shared/types";
import { formatStateLabel, StatusBadge } from "./StatusBadge";

const RELAYER_ORDER: RelayerStatus[] = [
  "quote_requested",
  "quoted",
  "submitted",
  "pending",
  "confirmed",
  "failed"
];

function shortValue(value: string | null) {
  if (!value) return null;
  if (value.length <= 18) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function txCopy(value: string | null, status: RelayerStatus) {
  if (status === "failed") return "任务在记录中继交易前失败";
  if (!value) return "暂无中继交易";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function feeCopy(state: SpendGuardDemoState) {
  const { accounting, relayerInfo } = state;

  if (accounting.relayFeeAtomic !== null) {
    const collector = shortValue(relayerInfo.feeCollector);

    return collector
      ? `${accounting.relayFee} 到 ${collector}`
      : accounting.relayFee;
  }

  return relayerInfo.fee ?? "暂无报价";
}

function classForRelayerStep(current: RelayerStatus, step: RelayerStatus) {
  const normalizedCurrent = current === "mocked" ? "confirmed" : current;
  const currentIndex = RELAYER_ORDER.indexOf(normalizedCurrent);
  const stepIndex = RELAYER_ORDER.indexOf(step);

  if (normalizedCurrent === "confirmed" && stepIndex >= 0) return "is-complete";
  if (normalizedCurrent === step) return "is-active";
  if (currentIndex > stepIndex && stepIndex >= 0) return "is-complete";
  return undefined;
}

type RelayerTimelineProps = {
  state: SpendGuardDemoState;
};

export function RelayerTimeline({ state }: RelayerTimelineProps) {
  const { relayerInfo } = state;
  const isMockMode = relayerInfo.mode === "mock";
  const modeCopy = isMockMode
    ? "模拟 1Shot 中继：不会发起真实 1Shot API 调用"
    : "真实 1Shot 中继：当前视图展示受保护的真实路径";
  const statusLabel = isMockMode
    ? `模拟 ${formatStateLabel(state.relayer)}`
    : formatStateLabel(state.relayer);
  const finalState = state.relayer === "failed" ? "failed" : "confirmed";
  const steps: Array<{
    state: RelayerStatus;
    title: string;
    copy: string;
  }> = [
    {
      state: "quote_requested" as const,
      title: "报价",
      copy:
        shortValue(relayerInfo.quoteId) ??
        (isMockMode ? "等待模拟报价" : "等待 1Shot 报价")
    },
    {
      state: "quoted" as const,
      title: "费用",
      copy: feeCopy(state)
    },
    {
      state: "submitted" as const,
      title: "任务",
      copy: shortValue(relayerInfo.taskId) ?? "暂无任务 id"
    },
    {
      state: "pending" as const,
      title: "等待确认",
      copy:
        state.relayer === "pending"
          ? isMockMode
            ? "模拟任务正在等待确认"
            : "1Shot 任务正在等待确认"
          : relayerInfo.taskId
            ? isMockMode
              ? "模拟时间线已通过等待步骤"
              : "1Shot 时间线已通过等待步骤"
            : "暂无待确认任务"
    },
    {
      state: finalState,
      title: finalState === "failed" ? "失败" : "已确认",
      copy: txCopy(relayerInfo.txHash, state.relayer)
    }
  ];

  return (
    <article className="panel relayer-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">1Shot 中继 {isMockMode ? "模拟" : "受保护"}</p>
          <h2>执行时间线</h2>
        </div>
        <StatusBadge label={statusLabel} value={state.relayer} />
      </div>
      <p className="mini-label">{modeCopy}</p>
      <dl className="relayer-accounting detail-list two-col" aria-label="钱包扣款记账">
        <div>
          <dt>x402 服务价</dt>
          <dd>{state.accounting.servicePrice}</dd>
        </div>
        <div>
          <dt>中继费</dt>
          <dd>{state.accounting.relayFee}</dd>
        </div>
        <div>
          <dt>钱包总扣款</dt>
          <dd>{state.accounting.totalWalletDebit}</dd>
        </div>
        <div>
          <dt>计入预算</dt>
          <dd>{state.accounting.agentBudgetConsumed}</dd>
        </div>
      </dl>
      <ol className="timeline" aria-label="1Shot 中继时间线">
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
