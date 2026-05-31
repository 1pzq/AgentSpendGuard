export type SpendGuardMode = "mock" | "real";

export type SpendGuardScaffoldStatus = "placeholder";

export type AiProvider = "venice" | "deepseek";

export type AtomicAmount = string;

export type IsoDateTime = string;

export type TokenSymbol = "USDC";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type SpendGuardServiceId = "venice-ai" | "deepseek-ai";

export type WalletStatus = "disconnected" | "connected" | "unsupported";

export type PolicyStatus =
  | "draft"
  | "ready_to_sign"
  | "active"
  | "exhausted"
  | "expired"
  | "revoked";

export type PermissionStatus =
  | "not_requested"
  | "requested"
  | "approved"
  | "active"
  | "rejected"
  | "redeemed"
  | "revoked"
  | "fallback_local";

export type AgentActionStatus =
  | "idle"
  | "prechecking"
  | "running"
  | "blocked"
  | "succeeded"
  | "failed";

export type PaymentStatus =
  | "none"
  | "required_402"
  | "paying"
  | "paid"
  | "failed"
  | "blocked";

export type RelayerStatus =
  | "not_used"
  | "quote_requested"
  | "quoted"
  | "submitted"
  | "pending"
  | "confirmed"
  | "failed"
  | "mocked";

export type LedgerStatus = "empty" | "has_success" | "has_blocked" | "closed";

export type RevocationStatus = "available" | "revoking" | "revoked" | "failed";

export type LedgerEntryStatus =
  | "success"
  | "blocked"
  | "revoked"
  | "paid_ai_failed";

export type PaymentRequirementStatus = "required" | "expired" | "cancelled";

export type PaymentReceiptStatus = "paid" | "failed" | "mocked";

export type RiskLevel = "low" | "medium" | "high" | "unknown";

export type StateTone = "ready" | "working" | "warn" | "danger";

export type StateEnums = {
  wallet: WalletStatus[];
  policy: PolicyStatus[];
  permission: PermissionStatus[];
  agentAction: AgentActionStatus[];
  payment: PaymentStatus[];
  relayer: RelayerStatus[];
  ledger: LedgerStatus[];
  revocation: RevocationStatus[];
};

export type WalletInfo = {
  eoa: string | null;
  smartAccount: string | null;
  chain: string;
};

export type AdvancedPermissionGrant = {
  source: "metamask-erc7715";
  permissionType: "erc20-token-periodic";
  status: "granted" | "revoked" | "expired";
  chainId: number;
  from: string | null;
  to: string;
  sessionAccount: string;
  context: string;
  delegationManager: string;
  dependencies: Array<{
    factory: string;
    factoryData: string;
  }>;
  rules: unknown[];
  tokenAddress: string;
  tokenSymbol: TokenSymbol;
  tokenDecimals: number;
  periodAmountAtomic: AtomicAmount;
  periodDuration: number;
  startTime: number;
  expiry: number;
  isAdjustmentAllowed: boolean;
  requestedAt: IsoDateTime;
  grantedAt: IsoDateTime;
  expiresAt: IsoDateTime;
  rawGrant: unknown;
};

export type TokenConfig = {
  symbol: TokenSymbol;
  decimals: number;
  chainId: number;
  address: string;
};

export type ChainConfig = {
  id: number;
  key: string;
  name: string;
  rpcUrl: string | null;
  wsUrl: string | null;
  explorerBaseUrl: string;
};

export type NativeCurrencyConfig = {
  name: string;
  symbol: string;
  decimals: number;
};

export type PublicWalletChainConfig = {
  id: number;
  hexId: string;
  key: string;
  name: string;
  rpcUrls: string[];
  blockExplorerUrls: string[];
  nativeCurrency: NativeCurrencyConfig;
};

export type ProtectedEndpointConfig = {
  id: string;
  aiProvider: AiProvider;
  serviceId: SpendGuardServiceId;
  service: string;
  path: string;
  method: HttpMethod;
  aiPath: string;
  venicePath?: string;
};

export type SpendGuardAllowlist = {
  services: SpendGuardServiceId[];
  endpoints: string[];
  methods: HttpMethod[];
  chainIds: number[];
  tokens: TokenSymbol[];
  payTo: string[];
};

export type SpendGuardMockIds = {
  policyId: string;
  permissionId: string;
  ledgerSeedId: string;
  paymentRequirementId: string;
  paymentReceiptId: string;
  aiBriefId: string;
  veniceBriefId: string;
  quoteId: string;
  relayerTaskId: string;
  txHash: string;
  walletEoa: string;
  smartAccount: string;
};

export type PolicyConfig = {
  id: string;
  serviceId: SpendGuardServiceId;
  service: string;
  purpose: string;
  token: TokenSymbol;
  tokenDecimals: number;
  chainId: number;
  chainName: string;
  maxSpendAtomic: AtomicAmount;
  pricePerCallAtomic: AtomicAmount;
  spentAtomic: AtomicAmount;
  windowHours: number;
  expiresAt: IsoDateTime;
  allowedEndpoint: string;
  allowedMethods: HttpMethod[];
  payTo: string;
};

export type DashboardPolicyConfig = {
  id: string;
  service: string;
  purpose: string;
  token: TokenSymbol;
  maxSpend: number;
  pricePerCall: number;
  spent: number;
  windowHours: number;
  expiresAt: IsoDateTime;
  allowedEndpoint: string;
  payTo: string;
};

export type RelayerInfo = {
  quoteId: string | null;
  fee: string | null;
  taskId: string | null;
  txHash: string | null;
};

export type OneShotPaymentTimeline = {
  quoteId: string;
  fee: string;
  taskId: string;
  status: Extract<
    RelayerStatus,
    "submitted" | "pending" | "confirmed" | "failed" | "mocked"
  >;
  txHash: string;
};

export type AiRiskBrief = {
  id: string;
  title: string;
  summary: string;
  findings: string[];
  walletAddress: string;
  riskLevel: RiskLevel;
  model: string;
  createdAt: IsoDateTime;
};

export type VeniceRiskBrief = AiRiskBrief;

export type AiResultReport = Pick<AiRiskBrief, "title" | "summary" | "findings">;

export type VeniceResultReport = AiResultReport;

export type PaymentRequirement = {
  id: string;
  endpoint: string;
  method: HttpMethod;
  amountAtomic: AtomicAmount;
  token: TokenSymbol;
  tokenDecimals: number;
  chainId: number;
  payTo: string;
  description: string;
  status: PaymentRequirementStatus;
  createdAt: IsoDateTime;
  expiresAt: IsoDateTime | null;
};

export type PaymentReceipt = {
  id: string;
  requirementId: string;
  status: PaymentReceiptStatus;
  amountAtomic: AtomicAmount;
  token: TokenSymbol;
  chainId: number;
  payer: string;
  payTo: string;
  txHash: string | null;
  paidAt: IsoDateTime;
  oneShot?: OneShotPaymentTimeline;
};

export type PermissionRecord = {
  id: string;
  policyId: string;
  status: PermissionStatus;
  wallet: WalletInfo;
  serviceId: SpendGuardServiceId;
  service: string;
  purpose: string;
  token: TokenSymbol;
  tokenDecimals: number;
  chainId: number;
  chainName: string;
  allowedEndpoint: string;
  allowedMethods: HttpMethod[];
  payTo: string;
  maxSpendAtomic: AtomicAmount;
  pricePerCallAtomic: AtomicAmount;
  spentAtomic: AtomicAmount;
  remainingSpendAtomic: AtomicAmount;
  windowHours: number;
  spendCount: number;
  createdAt: IsoDateTime;
  approvedAt: IsoDateTime | null;
  updatedAt: IsoDateTime;
  expiresAt: IsoDateTime;
  revokedAt: IsoDateTime | null;
  revokedReason: string | null;
  lastSpendAt: IsoDateTime | null;
  mockSignature: string | null;
  advancedPermissionGrant: AdvancedPermissionGrant | null;
};

export type PermissionRecordUpdate = Partial<
  Pick<
    PermissionRecord,
    | "status"
    | "wallet"
    | "spentAtomic"
    | "remainingSpendAtomic"
    | "spendCount"
    | "approvedAt"
    | "expiresAt"
    | "revokedAt"
    | "revokedReason"
    | "lastSpendAt"
    | "mockSignature"
    | "advancedPermissionGrant"
  >
>;

export type PermissionSpendUpdate = {
  permissionId?: string;
  amountAtomic: AtomicAmount;
  spentAt?: IsoDateTime;
};

export type LedgerEntry = {
  id: string;
  permissionId: string;
  policyId: string;
  serviceId: SpendGuardServiceId;
  service: string;
  endpoint: string;
  amountAtomic: AtomicAmount;
  token: TokenSymbol;
  tokenDecimals: number;
  status: LedgerEntryStatus;
  occurredAt: IsoDateTime;
  reason: string | null;
  paymentRequirement: PaymentRequirement | null;
  paymentReceipt: PaymentReceipt | null;
  veniceRiskBrief: VeniceRiskBrief | null;
  createdAt: IsoDateTime;
  time: string;
  cost: string;
};

export type LedgerEntryInput = Partial<
  Pick<
    LedgerEntry,
    | "id"
    | "permissionId"
    | "policyId"
    | "serviceId"
    | "service"
    | "endpoint"
    | "token"
    | "tokenDecimals"
    | "occurredAt"
    | "reason"
    | "paymentRequirement"
    | "paymentReceipt"
    | "veniceRiskBrief"
    | "time"
    | "cost"
  >
> &
  Pick<LedgerEntry, "amountAtomic" | "status">;

export type DashboardLedgerEntry = {
  time: string;
  service: string;
  cost: string;
  status: LedgerEntryStatus;
};

export type SpendBlock = {
  attempted: boolean;
  reason: string;
};

export type DashboardState = {
  wallet: WalletStatus;
  policy: PolicyStatus;
  permission: PermissionStatus;
  agentAction: AgentActionStatus;
  payment: PaymentStatus;
  relayer: RelayerStatus;
  ledger: LedgerStatus;
  revocation: RevocationStatus;
  block: SpendBlock;
  walletInfo: WalletInfo;
  advancedPermissionGrant: AdvancedPermissionGrant | null;
  policyConfig: DashboardPolicyConfig;
  relayerInfo: RelayerInfo;
  veniceResult: VeniceResultReport | null;
  ledgerEntries: DashboardLedgerEntry[];
};

export type SpendGuardDemoState = DashboardState;

export type ApiError = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export type ApiSuccess<T> = {
  ok: true;
  data: T;
};

export type ApiFailure = {
  ok: false;
  error: ApiError;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export type PermissionRecordResponse = ApiResponse<{
  permission: PermissionRecord;
}>;

export type LedgerListResponse = ApiResponse<{
  entries: LedgerEntry[];
  state: DashboardState;
}>;

export type RunnerSpendResult = {
  permission: PermissionRecord;
  ledgerEntry: LedgerEntry | null;
  paymentRequirement: PaymentRequirement | null;
  paymentReceipt: PaymentReceipt | null;
  veniceRiskBrief: VeniceRiskBrief | null;
  blockedReason: string | null;
};

export type RunnerSpendResponse = ApiResponse<
  RunnerSpendResult & {
    state: DashboardState;
  }
>;

export type DashboardStateResponse = ApiResponse<{
  state: DashboardState;
}>;
