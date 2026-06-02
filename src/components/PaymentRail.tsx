import type { PaymentStatus, SpendGuardDemoState } from "@/shared/types";
import { formatStateLabel, StatusBadge } from "./StatusBadge";

const PAYMENT_STEPS: Array<{
  copy: string;
  state: PaymentStatus;
}> = [
  {
    state: "none",
    copy: "尚未开始付费请求。"
  },
  {
    state: "required_402",
    copy: "受保护接口返回支付要求。"
  },
  {
    state: "paying",
    copy: "MetaMask 正在签署 x402 支付。"
  },
  {
    state: "paid",
    copy: "支出在策略范围内，已被接受。"
  },
  {
    state: "failed",
    copy: "支付流程在结算成功前退出。"
  },
  {
    state: "blocked",
    copy: "超预算前已停止支付。"
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

function settlementProofCopy(state: SpendGuardDemoState) {
  const evidence = state.x402Evidence;

  if (state.payment === "blocked") {
    return "付款前阻断，未提交 PAYMENT header，也没有 settlement tx。";
  }
  if (evidence.paidRequest.txHash) {
    return "已记录链上 settlement tx，可对照账本和区块浏览器。";
  }
  if (evidence.paymentHeaderStatus === "submitted") {
    return "PAYMENT header 已提交，正在等待 settlement 结果。";
  }

  return "尚未提交 paid request；无链上支付证据。";
}

function relayerModeCopy(state: SpendGuardDemoState) {
  return state.relayerInfo.mode === "real"
    ? "真实 1Shot / facilitator 结算路径。"
    : "当前中继为模拟模式；界面只在 tx hash 存在时声明已链上结算。";
}

function apiRouteForResource(resource: string) {
  return resource.startsWith("/api/") ? resource : `/api${resource}`;
}

export function PaymentRail({ state }: PaymentRailProps) {
  const evidence = state.x402Evidence;
  const requirement = evidence.selectedRequirement;
  const sellerName = "Agent SpendGuard paid risk-brief API";
  const sellerApiRoute = apiRouteForResource(evidence.protectedResource);

  return (
    <article className="panel status-rail">
      <div className="panel-header">
        <div>
          <p className="eyebrow">x402 支付</p>
          <h2>状态轨迹</h2>
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
        <dl className="detail-list x402-evidence-list">
          <div>
            <dt>受保护资源</dt>
            <dd>
              {requirement.method} {evidence.protectedResource}
            </dd>
          </div>
          <div>
            <dt>选中的支付要求</dt>
            <dd>
              scheme={requirement.scheme}，资产转移方式=
              {requirement.assetTransferMethod}
            </dd>
          </div>
          <div>
            <dt>金额</dt>
            <dd>
              {requirement.amountAtomic} atomic {requirement.token}
            </dd>
          </div>
          <div>
            <dt>网络</dt>
            <dd>{requirement.network}</dd>
          </div>
          <div>
            <dt>资产</dt>
            <dd>{shortenHex(requirement.asset)}</dd>
          </div>
          <div>
            <dt>收款地址</dt>
            <dd>{shortenHex(requirement.payTo)}</dd>
          </div>
          <div>
            <dt>付费 header</dt>
            <dd>{paymentHeaderCopy(evidence.paymentHeaderStatus)}</dd>
          </div>
          <div>
            <dt>交易 hash</dt>
            <dd>{shortenHex(evidence.paidRequest.txHash)}</dd>
          </div>
        </dl>
      </div>
      <div className="x402-evidence seller-boundary" aria-label="x402 seller 边界">
        <div className="evidence-header">
          <strong>Seller 边界</strong>
          <span>SpendGuard seller</span>
        </div>
        <dl className="detail-list x402-evidence-list">
          <div>
            <dt>x402 seller</dt>
            <dd>{sellerName}</dd>
          </div>
          <div>
            <dt>Seller endpoint</dt>
            <dd>
              {requirement.method} {sellerApiRoute}
            </dd>
          </div>
          <div>
            <dt>x402 resource</dt>
            <dd>{evidence.protectedResource}</dd>
          </div>
          <div>
            <dt>Seller 责任</dt>
            <dd>签发 402、验证 ERC-7710 payload，并在 settlement 后放行业务响应。</dd>
          </div>
          <div>
            <dt>下游 AI</dt>
            <dd>{state.policyConfig.service} 是结算后的后端 provider，不是 x402 seller。</dd>
          </div>
          <div>
            <dt>结算证据</dt>
            <dd>{settlementProofCopy(state)}</dd>
          </div>
          <div>
            <dt>中继模式</dt>
            <dd>{relayerModeCopy(state)}</dd>
          </div>
        </dl>
      </div>
    </article>
  );
}
