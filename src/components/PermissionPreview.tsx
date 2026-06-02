import type { SpendGuardDemoState } from "@/shared/types";
import { StatusBadge } from "./StatusBadge";

type PermissionPreviewProps = {
  state: SpendGuardDemoState;
};

function shortenHex(value: string | null) {
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

function checkActive(value: boolean | null | undefined) {
  return value === true;
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

  return `${whole.toString()}.${displayFraction} ${token ?? "token"} (${amountAtomic} atomic)`;
}

function formatUnixTime(seconds: number | null | undefined) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return "未记录";
  if (seconds <= 0) return "无下限";

  return new Date(seconds * 1000).toLocaleString("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

function formatDuration(seconds: number | null | undefined) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return "未记录";
  if (seconds % 86400 === 0) return `${seconds / 86400} 天`;
  if (seconds % 3600 === 0) return `${seconds / 3600} 小时`;
  return `${seconds} 秒`;
}

function formatMethodSelector(selector: string) {
  return selector.toLowerCase() === "0xa9059cbb"
    ? "transfer(address,uint256) / 0xa9059cbb"
    : selector;
}

function formatAddressList(values: string[] | null | undefined) {
  if (!values || values.length === 0) return "未记录";
  return values.map((value) => shortenHex(value)).join(", ");
}

export function PermissionPreview({ state }: PermissionPreviewProps) {
  const grant = state.advancedPermissionGrant;
  const proof = state.erc7710Proof;
  const proofGrant = proof.grant;
  const payload = proof.payload;
  const childCaveats = payload?.childCaveats ?? null;
  const childTransferAmount =
    childCaveats?.erc20TransferAmount ?? payload?.childErc20TransferAmount ?? null;
  const childCaveatStatus = childCaveats
    ? `${childCaveats.caveatCount} caveats`
    : payload
      ? "历史 proof"
      : "待构造";
  const childCaveatsComplete = !!(
    childCaveats?.allowedMethods &&
    childCaveats.allowedTargets &&
    childCaveats.erc20TransferAmount &&
    childCaveats.limitedCalls &&
    childCaveats.timestamp &&
    childCaveats.valueLte
  );
  const checks = [
    {
      active: grant?.source === "metamask-erc7715",
      copy: "使用 MetaMask Advanced Permission 授权。"
    },
    {
      active: grant?.permissionType === "erc20-token-periodic",
      copy: "授权类型为 ERC-20 周期性支出。"
    },
    {
      active: state.block.attempted,
      copy: "超预算请求会在付费 header 提交前被阻断。"
    },
    {
      active: state.revocation === "revoked",
      copy: "撤销会关闭策略并阻止后续支出。"
    }
  ];
  const proofChecks = [
    {
      active: !!proofGrant,
      copy: "已保存 MetaMask Advanced Permission 授权。"
    },
    {
      active: !!proofGrant?.parentPermissionContextHash && !proof.rawContextExposed,
      copy: "父级 permission context 仅以 hash 展示。"
    },
    {
      active:
        checkActive(payload?.localPayloadMatchesGrant) ||
        checkActive(payload?.serverPayloadMatchesGrant),
      copy: "ERC-7710 payload 与已保存授权匹配。"
    },
    {
      active: !!payload?.childDelegationTarget,
      copy: "子 delegation target 已可见。"
    },
    {
      active: !!childTransferAmount,
      copy: "子 delegation 已包含 ERC-20 转账金额上限。"
    },
    {
      active: childCaveatsComplete,
      copy: "本次 child delegation 的关键 caveat 已完整解码。"
    },
    {
      active:
        checkActive(payload?.settlementPreflight) ||
        (proof.status === "settled" &&
          checkActive(payload?.serverPayloadMatchesGrant)),
      copy: "付费结算前验证已通过。"
    }
  ];

  return (
    <article className="panel permission-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">权限预览</p>
          <h2>签名前可读</h2>
        </div>
        <StatusBadge value={state.permission} />
      </div>
      <div className="permission-copy">
        <p>
          你正在授权 SpendGuard agent 在未来{" "}
          <strong>{state.policyConfig.windowHours} 小时</strong>
          内最多支出{" "}
          <strong>{state.policyConfig.maxSpend.toFixed(2)} {state.policyConfig.token}</strong>{" "}
          。
        </p>
        <p>
          该权限只能用于 {state.policyConfig.service} 风险简报任务，并且可以随时撤销。
        </p>
      </div>
      {proofGrant ? (
        <dl className="detail-list">
          <div>
            <dt>授权类型</dt>
            <dd>{proofGrant.permissionType}</dd>
          </div>
          <div>
            <dt>授权人 / 付款人</dt>
            <dd>{shortenHex(proof.payer ?? proofGrant.delegator)}</dd>
          </div>
          <div>
            <dt>Delegation 管理器</dt>
            <dd>{shortenHex(proofGrant.delegationManager)}</dd>
          </div>
          <div>
            <dt>会话 / redeemer</dt>
            <dd>{shortenHex(proofGrant.sessionAccount)}</dd>
          </div>
          <div>
            <dt>过期时间</dt>
            <dd>{proofGrant.expiresAt}</dd>
          </div>
        </dl>
      ) : null}
      <div className="erc7710-proof" aria-label="ERC-7710 证明">
        <div className="evidence-header">
          <strong>ERC-7710 证明</strong>
          <span>{proofStatusCopy(proof.status)}</span>
        </div>
        <dl className="detail-list erc7710-proof-list">
          <div>
            <dt>授权来源</dt>
            <dd>{proofGrant?.source ?? "未保存"}</dd>
          </div>
          <div>
            <dt>父 context hash</dt>
            <dd>{shortenHex(proofGrant?.parentPermissionContextHash ?? null)}</dd>
          </div>
          <div>
            <dt>Payload context 哈希</dt>
            <dd>{shortenHex(payload?.permissionContextHash ?? null)}</dd>
          </div>
          <div>
            <dt>子 target</dt>
            <dd>{shortenHex(payload?.childDelegationTarget ?? null)}</dd>
          </div>
          <div>
            <dt>子金额上限</dt>
            <dd>
              {childTransferAmount
                ? formatAtomicAmount(
                    childTransferAmount.maxAmountAtomic,
                    proofGrant?.tokenDecimals,
                    proofGrant?.tokenSymbol
                  )
                : "未记录"}
            </dd>
          </div>
          <div>
            <dt>Payload 检查</dt>
            <dd>
              {checkActive(payload?.localPayloadMatchesGrant)
                ? "客户端授权匹配"
                : checkActive(payload?.serverPayloadMatchesGrant)
                  ? "服务端授权匹配"
                  : "尚未构造"}
            </dd>
          </div>
          <div>
            <dt>原始 context</dt>
            <dd>{proof.rawContextExposed ? "已暴露" : "仅 hash"}</dd>
          </div>
        </dl>
        <div className="caveat-inspector" aria-label="Caveat inspector">
          <section className="caveat-group">
            <div className="caveat-group-header">
              <strong>父级授权限制</strong>
              <span>MetaMask permission</span>
            </div>
            <dl className="detail-list caveat-detail-list">
              <div>
                <dt>Token</dt>
                <dd>
                  {proofGrant
                    ? `${proofGrant.tokenSymbol} ${shortenHex(proofGrant.tokenAddress)}`
                    : "未记录"}
                </dd>
              </div>
              <div>
                <dt>周期额度</dt>
                <dd>
                  {proofGrant
                    ? formatAtomicAmount(
                        proofGrant.periodAmountAtomic,
                        proofGrant.tokenDecimals,
                        proofGrant.tokenSymbol
                      )
                    : "未记录"}
                </dd>
              </div>
              <div>
                <dt>周期窗口</dt>
                <dd>{proofGrant ? formatDuration(proofGrant.periodDuration) : "未记录"}</dd>
              </div>
              <div>
                <dt>开始时间</dt>
                <dd>{formatUnixTime(proofGrant?.startTime)}</dd>
              </div>
              <div>
                <dt>过期时间</dt>
                <dd>{formatUnixTime(proofGrant?.expiry)}</dd>
              </div>
              <div>
                <dt>Delegator</dt>
                <dd>{shortenHex(proofGrant?.delegator ?? null)}</dd>
              </div>
              <div>
                <dt>Redeemer</dt>
                <dd>{shortenHex(proofGrant?.redeemer ?? null)}</dd>
              </div>
              <div>
                <dt>Manager</dt>
                <dd>{shortenHex(proofGrant?.delegationManager ?? null)}</dd>
              </div>
            </dl>
          </section>
          <section className="caveat-group">
            <div className="caveat-group-header">
              <strong>本次 child delegation 限制</strong>
              <span>{childCaveatStatus}</span>
            </div>
            <dl className="detail-list caveat-detail-list">
              <div>
                <dt>limitedCalls</dt>
                <dd>
                  {childCaveats?.limitedCalls
                    ? `最多 ${childCaveats.limitedCalls.limit} 次`
                    : "未记录"}
                </dd>
              </div>
              <div>
                <dt>valueLte</dt>
                <dd>
                  {childCaveats?.valueLte
                    ? `${childCaveats.valueLte.maxValueAtomic} wei`
                    : "未记录"}
                </dd>
              </div>
              <div>
                <dt>allowedTargets</dt>
                <dd>{formatAddressList(childCaveats?.allowedTargets?.targets)}</dd>
              </div>
              <div>
                <dt>allowedMethods</dt>
                <dd>
                  {childCaveats?.allowedMethods?.selectors?.length
                    ? childCaveats.allowedMethods.selectors
                        .map(formatMethodSelector)
                        .join(", ")
                    : "未记录"}
                </dd>
              </div>
              <div>
                <dt>timestamp</dt>
                <dd>
                  {childCaveats?.timestamp
                    ? `${formatUnixTime(
                        childCaveats.timestamp.afterThreshold
                      )} -> ${formatUnixTime(childCaveats.timestamp.beforeThreshold)}`
                    : "未记录"}
                </dd>
              </div>
              <div>
                <dt>erc20TransferAmount</dt>
                <dd>
                  {childTransferAmount
                    ? formatAtomicAmount(
                        childTransferAmount.maxAmountAtomic,
                        proofGrant?.tokenDecimals,
                        proofGrant?.tokenSymbol
                      )
                    : "未记录"}
                </dd>
              </div>
            </dl>
            {childCaveats?.ordered?.length ? (
              <details className="caveat-raw-details">
                <summary>原始 caveat 摘要</summary>
                <ul>
                  {childCaveats.ordered.map((caveat, index) => (
                    <li key={`${caveat.enforcer}-${index}`}>
                      <span>{caveat.label}</span>
                      <strong>{caveat.summary}</strong>
                      <code>{shortenHex(caveat.enforcer)}</code>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </section>
        </div>
        <p className="proof-message">{proof.validationMessage}</p>
      </div>
      <ul className="check-list" aria-label="权限边界">
        {checks.map((check) => (
          <li className={check.active ? "is-active" : undefined} key={check.copy}>
            {check.copy}
          </li>
        ))}
      </ul>
      <ul className="check-list proof-check-list" aria-label="ERC-7710 证明检查">
        {proofChecks.map((check) => (
          <li className={check.active ? "is-active" : undefined} key={check.copy}>
            {check.copy}
          </li>
        ))}
      </ul>
    </article>
  );
}
