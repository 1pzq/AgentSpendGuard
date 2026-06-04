import type {
  AiProvider,
  ChainConfig,
  PolicyConfig,
  ProtectedEndpointConfig,
  SpendGuardAllowlist,
  SpendGuardMockIds,
  SpendGuardMode,
  TokenConfig
} from "@/shared/types";
import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_CHAIN_KEY,
  BASE_SEPOLIA_CHAIN_NAME,
  BASE_SEPOLIA_EXPLORER_URL,
  BASE_SEPOLIA_USDC
} from "@/shared/chain";

type X402Network = `${string}:${string}`;

function readModeEnv(name: string, fallback: SpendGuardMode): SpendGuardMode {
  const value = process.env[name];
  if (!value) return fallback;
  if (value === "mock" || value === "real") return value;
  throw new Error(`${name} must be "mock" or "real".`);
}

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;

  const parsed = Number(value);
  if (Number.isSafeInteger(parsed) && parsed > 0) return parsed;

  throw new Error(`${name} must be a positive integer.`);
}

function readPositiveAtomicEnv(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  const amount = value || fallback;

  if (/^\d+$/.test(amount) && BigInt(amount) > BigInt(0)) return amount;

  throw new Error(`${name} must be a positive integer atomic token amount.`);
}

function readBooleanEnv(name: string, fallback = false): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  throw new Error(`${name} must be a boolean value.`);
}

function readOptionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function readOptionalAddressEnv(name: string): string | undefined {
  const value = readOptionalEnv(name);
  if (!value) return undefined;

  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new Error(`${name} must be a valid EVM address.`);
  }

  return value;
}

function readAddressListEnv(name: string, fallback: readonly string[] = []): string[] {
  const value = process.env[name]?.trim();
  const items = value
    ? value.split(",").map((item) => item.trim()).filter(Boolean)
    : [...fallback];

  const invalid = items.find((item) => !/^0x[a-fA-F0-9]{40}$/.test(item));
  if (invalid) {
    throw new Error(`${name} contains an invalid EVM address: ${invalid}.`);
  }

  return Array.from(
    new Map(items.map((item) => [item.toLowerCase(), item])).values()
  );
}

function readAiProviderEnv(name: string, fallback: AiProvider): AiProvider {
  const value = process.env[name];
  if (!value) return fallback;
  if (value === "venice" || value === "deepseek") return value;
  throw new Error(`${name} must be "venice" or "deepseek".`);
}

function readX402NetworkEnv(
  name: string,
  chainId: number,
  chainKey: string
): X402Network {
  const value = process.env[name]?.trim();
  if (!value || value === chainKey || value === String(chainId)) {
    return `eip155:${chainId}`;
  }
  if (/^eip155:\d+$/.test(value)) return value as X402Network;

  throw new Error(
    `${name} must be a CAIP-2 EVM network like "eip155:${chainId}" or "${chainKey}".`
  );
}

function atomicToDecimalString(amountAtomic: string, decimals: number): string {
  const amount = BigInt(amountAtomic);
  const scale = BigInt(10) ** BigInt(decimals);
  const whole = amount / scale;
  const fraction = amount % scale;

  if (fraction === BigInt(0)) return whole.toString();

  return `${whole}.${fraction.toString().padStart(decimals, "0").replace(/0+$/, "")}`;
}

const mode = readModeEnv("SPENDGUARD_MODE", "mock");
const aiProvider = readAiProviderEnv("AI_PROVIDER", "deepseek");
const aiMode = readModeEnv("AI_MODE", "mock");
const oneshotMode = readModeEnv("ONESHOT_MODE", "mock");
const oneShotBaseUrl = readOptionalEnv("ONESHOT_BASE_URL");
const oneShotRealCallsEnabled = readBooleanEnv(
  "ONESHOT_REAL_CALLS_ENABLED",
  false
);
const oneShotApiKeyConfigured = !!readOptionalEnv("ONESHOT_API_KEY");
const oneShotApiSecretConfigured = !!readOptionalEnv("ONESHOT_API_SECRET");
const oneShotWebhookSecretConfigured = !!readOptionalEnv(
  "ONESHOT_WEBHOOK_SECRET"
);
const veniceMode = readModeEnv("VENICE_MODE", "mock");
const deepseekMode = readModeEnv("DEEPSEEK_MODE", aiMode);
const erc7710PaidPocEnabled = readBooleanEnv(
  "ERC7710_PAID_POC_ENABLED",
  false
);
const erc7710PaidPocPriceAtomic = readPositiveAtomicEnv(
  "ERC7710_PAID_POC_PRICE_ATOMIC",
  "10000"
);
const policyPricePerCallAtomic = readPositiveAtomicEnv(
  "SPENDGUARD_PRICE_PER_CALL_ATOMIC",
  erc7710PaidPocPriceAtomic
);
const erc7710SelfSettleEnabled = readBooleanEnv(
  "ERC7710_SELF_SETTLE_ENABLED",
  false
);
const erc7710SelfSettleFacilitatorAddress =
  readOptionalAddressEnv("FACILITATOR_ADDRESS");
const x402FacilitatorUrl = readOptionalEnv("X402_FACILITATOR_URL");
const targetChainId = readPositiveIntegerEnv(
  "TARGET_CHAIN_ID",
  BASE_SEPOLIA_CHAIN_ID
);
const targetChainKey = process.env.TARGET_CHAIN_NAME ?? BASE_SEPOLIA_CHAIN_KEY;
const targetChainDisplayName =
  targetChainKey === BASE_SEPOLIA_CHAIN_KEY ? BASE_SEPOLIA_CHAIN_NAME : targetChainKey;
const oneShotBaseSepoliaFeeCollector =
  "0xE936e8FAf4A5655469182A49a505055B71C17604";
const oneShotBaseSepoliaTargetAddress =
  "0xf1ef956eff4181Ce913b664713515996858B9Ca9";
const oneShotFeeCollector =
  readOptionalAddressEnv("ONESHOT_FEE_COLLECTOR") ??
  (targetChainId === BASE_SEPOLIA_CHAIN_ID
    ? oneShotBaseSepoliaFeeCollector
    : undefined);
const oneShotTargetAddress =
  readOptionalAddressEnv("ONESHOT_TARGET_ADDRESS") ??
  (targetChainId === BASE_SEPOLIA_CHAIN_ID
    ? oneShotBaseSepoliaTargetAddress
    : undefined);
const metamaskBaseSepoliaErc7710FacilitatorAddresses = [
  "0xB01caEa8c6C47bbf4F4b4c5080Ca642043359C2E",
  "0xB42F812A44c22cc6b861478900401ee759EbEAD6",
  "0xC066ac5D385419B1A8c43A0E146fA439837a8B8c"
] as const;
const erc7710FacilitatorAddresses = readAddressListEnv(
  "X402_ERC7710_FACILITATOR_ADDRESSES",
  oneshotMode === "real" && oneShotTargetAddress
    ? [oneShotTargetAddress]
    : erc7710SelfSettleEnabled && erc7710SelfSettleFacilitatorAddress
    ? [erc7710SelfSettleFacilitatorAddress]
    : x402FacilitatorUrl?.includes("tx-sentinel-base-sepolia.api.cx.metamask.io")
    ? metamaskBaseSepoliaErc7710FacilitatorAddresses
    : []
);

export const spendguardChain: ChainConfig = {
  id: targetChainId,
  key: targetChainKey,
  name: targetChainDisplayName,
  rpcUrl: process.env.BASE_SEPOLIA_RPC_URL ?? null,
  wsUrl: process.env.BASE_SEPOLIA_WS_URL ?? null,
  explorerBaseUrl: BASE_SEPOLIA_EXPLORER_URL
};

export const spendguardToken: TokenConfig = {
  symbol: "USDC",
  decimals: BASE_SEPOLIA_USDC.decimals,
  chainId: spendguardChain.id,
  address: process.env.USDC_ADDRESS ?? BASE_SEPOLIA_USDC.address
};

const aiService =
  aiProvider === "deepseek"
    ? {
        id: "deepseek-risk-brief",
        serviceId: "deepseek-ai" as const,
        service: "DeepSeek",
        path: "/x402/deepseek/risk-brief",
        aiPath: "/chat/completions"
      }
    : {
        id: "venice-risk-brief",
        serviceId: "venice-ai" as const,
        service: "Venice AI",
        path: "/x402/venice/risk-brief",
        aiPath: "/api/v1/chat/completions"
      };

export const spendguardEndpoint: ProtectedEndpointConfig = {
  id: aiService.id,
  aiProvider,
  serviceId: aiService.serviceId,
  service: aiService.service,
  path: aiService.path,
  method: "POST",
  aiPath: aiService.aiPath,
  venicePath: aiProvider === "venice" ? aiService.aiPath : undefined
};

export const erc7710PaidPocPath = "/x402/deepseek/risk-brief/erc7710-paid-poc";

export const spendguardMockIds: SpendGuardMockIds = {
  policyId: `policy-demo-${aiProvider}-001`,
  permissionId: `perm-demo-${aiProvider}-001`,
  ledgerSeedId: "ledger-demo-seed-001",
  paymentRequirementId: "x402-req-demo-001",
  paymentReceiptId: "x402-receipt-demo-001",
  aiBriefId: `${aiProvider}-risk-brief-demo-001`,
  veniceBriefId: "venice-risk-brief-demo-001",
  quoteId: "quote_1shot_9a21",
  relayerTaskId: "task_1shot_7d4c92",
  txHash: "0x7c43ab91f1d5f30ed84564c61b4a3fcb1817db9cb70d0169cc30fb5944e2aa87",
  walletEoa: "0x8B91dF1f03566882fD6e4a832B5F6E8C0E434e2A",
  smartAccount: "0xA17e3C7B91C0C1E9D2a6E3C07Dcb8F1cB72591c0"
};

export const spendguardAllowlist: SpendGuardAllowlist = {
  services: [spendguardEndpoint.serviceId],
  endpoints: [spendguardEndpoint.path],
  methods: [spendguardEndpoint.method],
  chainIds: [spendguardChain.id],
  tokens: [spendguardToken.symbol],
  payTo: [process.env.X402_PAY_TO ?? spendguardMockIds.smartAccount]
};

export const fixedPolicyConfig: PolicyConfig = {
  id: spendguardMockIds.policyId,
  serviceId: spendguardEndpoint.serviceId,
  service: spendguardEndpoint.service,
  purpose: "钱包风险简报",
  token: spendguardToken.symbol,
  tokenDecimals: spendguardToken.decimals,
  chainId: spendguardChain.id,
  chainName: spendguardChain.name,
  maxSpendAtomic: "1000000",
  pricePerCallAtomic: policyPricePerCallAtomic,
  spentAtomic: "0",
  windowHours: 24,
  expiresAt: "2026-05-31T23:59:00+08:00",
  allowedEndpoint: spendguardEndpoint.path,
  allowedMethods: [spendguardEndpoint.method],
  payTo: spendguardAllowlist.payTo[0]
};

export function getOneShotApiKey(): string | undefined {
  return readOptionalEnv("ONESHOT_API_KEY");
}

export function getOneShotApiSecret(): string | undefined {
  return readOptionalEnv("ONESHOT_API_SECRET");
}

export const spendguardConfig = {
  mode,
  aiProvider,
  aiMode,
  oneshotMode,
  oneShot: {
    mode: oneshotMode,
    baseUrl: oneShotBaseUrl ?? null,
    feeCollector: oneShotFeeCollector ?? null,
    targetAddress: oneShotTargetAddress ?? null,
    realCallsEnabled: oneShotRealCallsEnabled,
    statusMaxPolls: readPositiveIntegerEnv("ONESHOT_STATUS_MAX_POLLS", 48),
    statusPollMs: readPositiveIntegerEnv("ONESHOT_STATUS_POLL_MS", 2_500),
    apiKeyConfigured: oneShotApiKeyConfigured,
    apiSecretConfigured: oneShotApiSecretConfigured,
    webhookSecretConfigured: oneShotWebhookSecretConfigured
  },
  veniceMode,
  veniceApiKey: process.env.VENICE_API_KEY,
  deepseekMode,
  deepseekApiKey: process.env.DEEPSEEK_API_KEY,
  deepseekApiBase: process.env.DEEPSEEK_API_BASE ?? "https://api.deepseek.com",
  deepseekModel: process.env.DEEPSEEK_MODEL ?? "deepseek-v4-pro",
  x402FacilitatorUrl,
  x402ProxyUrl:
    readOptionalEnv("X402_PROXY_URL") ??
    readOptionalEnv("HTTPS_PROXY") ??
    readOptionalEnv("https_proxy") ??
    readOptionalEnv("HTTP_PROXY") ??
    readOptionalEnv("http_proxy"),
  x402Network: readX402NetworkEnv(
    "X402_NETWORK",
    spendguardChain.id,
    spendguardChain.key
  ),
  x402PayTo: spendguardAllowlist.payTo[0],
  x402Price: `$${atomicToDecimalString(
    fixedPolicyConfig.pricePerCallAtomic,
    fixedPolicyConfig.tokenDecimals
  )}`,
  erc7710PaidPoc: {
    enabled: erc7710PaidPocEnabled,
    path: erc7710PaidPocPath,
    apiPath: `/api${erc7710PaidPocPath}`,
    priceAtomic: erc7710PaidPocPriceAtomic,
    price: `$${atomicToDecimalString(
      erc7710PaidPocPriceAtomic,
      fixedPolicyConfig.tokenDecimals
    )}`,
    priceLabel: `${atomicToDecimalString(
      erc7710PaidPocPriceAtomic,
      fixedPolicyConfig.tokenDecimals
    )} ${spendguardToken.symbol}`,
    facilitatorAddresses: erc7710FacilitatorAddresses,
    selfSettle: {
      enabled: erc7710SelfSettleEnabled,
      facilitatorAddress: erc7710SelfSettleFacilitatorAddress ?? null,
      privateKeyConfigured: !!readOptionalEnv("FACILITATOR_PRIVATE_KEY"),
      receiptPollingMs: readPositiveIntegerEnv(
        "ERC7710_SELF_SETTLE_RECEIPT_POLL_MS",
        2_000
      ),
      receiptTimeoutMs: readPositiveIntegerEnv(
        "ERC7710_SELF_SETTLE_RECEIPT_TIMEOUT_MS",
        120_000
      )
    }
  },
  chain: spendguardChain,
  token: spendguardToken,
  endpoint: spendguardEndpoint,
  allowlist: spendguardAllowlist,
  mockIds: spendguardMockIds,
  policy: fixedPolicyConfig
} as const;
