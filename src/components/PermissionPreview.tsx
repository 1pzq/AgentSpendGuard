import type { SpendGuardDemoState } from "@/shared/types";
import { StatusBadge } from "./StatusBadge";

type PermissionPreviewProps = {
  state: SpendGuardDemoState;
};

function shortenHex(value: string | null | undefined) {
  if (!value) return "未记录";
  if (value.length <= 16) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function proofStatusCopy(status: SpendGuardDemoState["erc7710Proof"]["status"]) {
  switch (status) {
    case "grant_ready":
      return "授权已就绪";
    case "payload_validated":
      return "payload 已验证";
    case "settlement_preflighted":
      return "预检通过";
    case "settled":
      return "已结算";
    case "blocked":
      return "支付前已阻断";
    case "failed":
      return "验证失败";
    case "not_ready":
    default:
      return "等待授权";
  }
}

function isAtomicAmount(value: string | null | undefined): value is string {
  return typeof value === "string" && /^\d+$/.test(value);
}

function formatAtomicAmount(
  amountAtomic: string | null | undefined,
  decimals: number | null | undefined,
  token: string | null | undefined
) {
  if (!isAtomicAmount(amountAtomic)) return "未记录";
  if (typeof decimals !== "number" || decimals < 0) {
    return `${amountAtomic} atomic ${token ?? "token"}`;
  }

  const unit = BigInt(10) ** BigInt(decimals);
  const amount = BigInt(amountAtomic);
  const whole = amount / unit;
  const fraction = (amount % unit).toString().padStart(decimals, "0");
  const trimmedFraction = fraction.replace(/0+$/, "");
  const displayFraction = (trimmedFraction || "00").padEnd(2, "0");

  return `${whole.toString()}.${displayFraction} ${token ?? "token"}`;
}

function payloadCheckCopy(state: SpendGuardDemoState) {
  const payload = state.erc7710Proof.payload;

  if (payload?.localPayloadMatchesGrant) return "客户端匹配";
  if (payload?.serverPayloadMatchesGrant) return "服务端匹配";
  if (state.payment === "blocked") return "付款前阻断";
  return "待运行";
}

export function PermissionPreview({ state }: PermissionPreviewProps) {
  const proof = state.erc7710Proof;
  const grant = proof.grant;
  const payload = proof.payload;
  const childTransferAmount =
    payload?.childCaveats?.erc20TransferAmount ??
    payload?.childErc20TransferAmount ??
    null;
  const summaryItems = [
    {
      label: "限额",
      value: `${state.policyConfig.maxSpend.toFixed(2)} ${state.policyConfig.token}`
    },
    {
      label: "窗口",
      value: `${state.policyConfig.windowHours} 小时`
    },
    {
      label: "用途",
      value: `${state.policyConfig.service} 风险简报`
    },
    {
      label: "授权方式",
      value: grant?.source === "metamask-erc7715" ? "MetaMask AP" : "待授权"
    }
  ];
  const checks = [
    {
      active: grant?.source === "metamask-erc7715",
      copy: "MetaMask scoped permission"
    },
    {
      active: !!payload?.permissionContextHash,
      copy: "ERC-7710 payment payload"
    },
    {
      active: state.block.attempted,
      copy: "超预算付款前阻断"
    }
  ];

  return (
    <article className="panel permission-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">权限预览</p>
          <h2>MetaMask AP，不是无限 approval。</h2>
        </div>
        <StatusBadge value={state.permission} />
      </div>
      <div className="permission-copy">
        <p>
          Agent 只能在批准的预算、时间窗口和服务范围内支付；不接触主钱包私钥，
          也不给 agent 无限 token allowance。
        </p>
      </div>
      <dl className="accounting-strip permission-summary-strip" aria-label="权限摘要">
        {summaryItems.map((item) => (
          <div key={item.label}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
      <div className="erc7710-proof compact-proof" aria-label="ERC-7710 证明">
        <div className="evidence-header">
          <strong>ERC-7710 proof</strong>
          <span>{proofStatusCopy(proof.status)}</span>
        </div>
        <dl className="detail-list compact-evidence-list">
          <div>
            <dt>Grant hash</dt>
            <dd>{shortenHex(grant?.parentPermissionContextHash)}</dd>
          </div>
          <div>
            <dt>Payload hash</dt>
            <dd>{shortenHex(payload?.permissionContextHash)}</dd>
          </div>
          <div>
            <dt>Amount cap</dt>
            <dd>
              {childTransferAmount
                ? formatAtomicAmount(
                    childTransferAmount.maxAmountAtomic,
                    grant?.tokenDecimals,
                    grant?.tokenSymbol
                  )
                : "运行后生成"}
            </dd>
          </div>
          <div>
            <dt>Check</dt>
            <dd>{payloadCheckCopy(state)}</dd>
          </div>
        </dl>
      </div>
      <ul className="check-list compact-check-list" aria-label="权限边界">
        {checks.map((check) => (
          <li className={check.active ? "is-active" : undefined} key={check.copy}>
            {check.copy}
          </li>
        ))}
      </ul>
    </article>
  );
}
