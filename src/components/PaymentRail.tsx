import type { PaymentStatus, SpendGuardDemoState } from "@/shared/types";
import { StatusBadge } from "./StatusBadge";

const PAYMENT_STEPS: Array<{
  copy: string;
  state: PaymentStatus;
}> = [
  {
    state: "none",
    copy: "No paid request has started."
  },
  {
    state: "required_402",
    copy: "Protected endpoint asks for payment."
  },
  {
    state: "paying",
    copy: "MetaMask is signing the x402 payment."
  },
  {
    state: "paid",
    copy: "Spend accepted inside policy limits."
  },
  {
    state: "failed",
    copy: "Payment flow exited before a settled paid result."
  },
  {
    state: "blocked",
    copy: "Payment stopped before overspend."
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

export function PaymentRail({ state }: PaymentRailProps) {
  return (
    <article className="panel status-rail">
      <div className="panel-header">
        <div>
          <p className="eyebrow">x402 payment</p>
          <h2>Status rail</h2>
        </div>
        <StatusBadge value={state.payment} />
      </div>
      <ol className="rail-list" aria-label="Payment state rail">
        {PAYMENT_STEPS.map((step) => (
          <li className={classForPaymentStep(state.payment, step.state)} key={step.state}>
            <span>{step.state}</span>
            <p>{step.copy}</p>
          </li>
        ))}
      </ol>
    </article>
  );
}
