import { ProxyAgent, setGlobalDispatcher } from "undici";
import { spendguardConfig } from "@/server/config/spendguard";

type ProxyGlobal = typeof globalThis & {
  __spendguardProxyUrl?: string;
};

function proxyGlobal(): ProxyGlobal {
  return globalThis as ProxyGlobal;
}

export function configureProjectProxy() {
  const proxyUrl = spendguardConfig.x402ProxyUrl;
  if (!proxyUrl) return;

  const store = proxyGlobal();
  if (store.__spendguardProxyUrl === proxyUrl) return;

  setGlobalDispatcher(new ProxyAgent(proxyUrl));
  store.__spendguardProxyUrl = proxyUrl;
}
