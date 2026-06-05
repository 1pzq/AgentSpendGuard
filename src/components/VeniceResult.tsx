import type { SpendGuardDemoState } from "@/shared/types";
import { StatusBadge } from "./StatusBadge";

type VeniceResultProps = {
  state: SpendGuardDemoState;
};

function apiRouteForResource(resource: string) {
  return resource.startsWith("/api/") ? resource : `/api${resource}`;
}

export function VeniceResult({ state }: VeniceResultProps) {
  const sellerEndpoint = state.x402Evidence.protectedResource;
  const sellerApiRoute = apiRouteForResource(sellerEndpoint);
  const service = state.policyConfig.service;

  return (
    <article className="panel result-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">{state.policyConfig.service} 结果</p>
          <h2>返回报告</h2>
        </div>
        <StatusBadge value={state.veniceResult ? "succeeded" : "waiting"} />
      </div>
      <div className="result-card">
        {state.veniceResult ? (
          <>
            <h3>{state.veniceResult.title}</h3>
            <p>{state.veniceResult.summary}</p>
            <ul>
              {state.veniceResult.findings.map((finding) => (
                <li key={finding}>{finding}</li>
              ))}
            </ul>
          </>
        ) : (
          <p className="empty-text">
            授权后运行 agent，这里会展示付费 AI 输出
          </p>
        )}
      </div>
      <div className="result-boundary" aria-label="AI provider 边界">
        <dl className="detail-list">
          <div>
            <dt>x402 seller</dt>
            <dd>SpendGuard paid risk-brief API</dd>
          </div>
          <div>
            <dt>保护接口</dt>
            <dd>{sellerApiRoute}</dd>
          </div>
          <div>
            <dt>x402 resource</dt>
            <dd>{sellerEndpoint}</dd>
          </div>
          <div>
            <dt>AI provider</dt>
            <dd>{service} 在 settlement 后执行风险简报，不直接签发 x402 challenge</dd>
          </div>
        </dl>
      </div>
    </article>
  );
}
