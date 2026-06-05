import type { PaymentStatus, SpendGuardDemoState } from "@/shared/types";
import { formatStateLabel, StatusBadge } from "./StatusBadge";

const PAYMENT_STEPS: Array<{
  copy: string;
  state: PaymentStatus;
}> = [
  {
    state: "none",
    copy: "等待 agent 支出决策"
  },
  {
    state: "required_402",
    copy: "SpendGuard seller 返回 x402 402 challenge"
  },
  {
    state: "paying",
    copy: "用保存的授权构造 ERC-7710 payment payload"
  },
  {
    state: "paid",
    copy: "1Shot / facilitator 结算后写入账本"
  },
  {
    state: "blocked",
    copy: "超预算，未提交 paid header"
  },
  {
    state: "failed",
    copy: "结算前退出"
  }
];

const PAYMENT_ORDER: PaymentStatus[] = ["none", "required_402", "paying", "paid"];

function classForPaymentStep(current: PaymentStatus, step: PaymentStatus) {
  const currentIndex = PAYMENT_ORDER.indexOf(current);
  const stepIndex = PAYMENT_ORDER.indexOf(step);

  if (current === "blocked" && step === "blocked") return "is-blocked";
  if (current === "failed" && step === "failed") return "is-blocked";
  if (current === step) return "is-active";
  if (currentIndex > stepIndex && stepIndex >= 0) return "is-complete";
  return undefined;
}

type PaymentRailProps = {
  state: SpendGuardDemoState;
};

function shortenHex(value: string | null) {
  if (!value) return "未记录";
  if (value.length <= 16) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function challengeCopy(status: SpendGuardDemoState["x402Evidence"]["challengeStatus"]) {
  switch (status) {
    case "received_402":
      return "已收到 402";
    case "paid_request_submitted":
      return "已提交付费重试";
    case "settled":
      return "402 已结算";
    case "blocked_before_payment":
      return "402 支付前已阻断";
    case "failed":
      return "支付证据失败";
    case "idle":
    default:
      return "未请求";
  }
}

function paymentHeaderCopy(
  status: SpendGuardDemoState["x402Evidence"]["paymentHeaderStatus"]
) {
  switch (status) {
    case "not_submitted":
      return "未提交付费 header";
    case "submitted":
      return "已提交 x402 支付 header";
    case "settled":
      return "header 已接受并结算";
    case "not_applicable":
    default:
      return "尚无付费请求";
  }
}

export function PaymentRail({ state }: PaymentRailProps) {
  const evidence = state.x402Evidence;
  const requirement = evidence.selectedRequirement;

  return (
    <article className="panel status-rail">
      <div className="panel-header">
        <div>
          <p className="eyebrow">x402 支付</p>
          <h2>402 challenge 到 delegation payment</h2>
        </div>
        <StatusBadge value={state.payment} />
      </div>
      <ol className="rail-list" aria-label="支付状态轨迹">
        {PAYMENT_STEPS.map((step) => (
          <li className={classForPaymentStep(state.payment, step.state)} key={step.state}>
            <span>{formatStateLabel(step.state)}</span>
            <p>{step.copy}</p>
          </li>
        ))}
      </ol>
      <div className="x402-evidence" aria-label="x402 证据">
        <div className="evidence-header">
          <strong>协议证据</strong>
          <span>{challengeCopy(evidence.challengeStatus)}</span>
        </div>
        <dl className="detail-list x402-evidence-list compact-evidence-list">
          <div>
            <dt>Resource</dt>
            <dd>
              {requirement.method} {evidence.protectedResource}
            </dd>
          </div>
          <div>
            <dt>Requirement</dt>
            <dd>
              scheme={requirement.scheme} / {requirement.assetTransferMethod} /{" "}
              {requirement.amountAtomic} atomic {requirement.token}
            </dd>
          </div>
          <div>
            <dt>Paid header</dt>
            <dd>{paymentHeaderCopy(evidence.paymentHeaderStatus)}</dd>
          </div>
          <div>
            <dt>Tx</dt>
            <dd>{shortenHex(evidence.paidRequest.txHash)}</dd>
          </div>
        </dl>
      </div>
    </article>
  );
}
