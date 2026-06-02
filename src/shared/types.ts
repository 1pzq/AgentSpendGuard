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

export type AgentSpendDecisionKind = "spend" | "skip" | "blocked";

export type AgentSpendDecisionConfidence = "low" | "medium" | "high";

export type AgentSpendDecisionPolicyCheck = "allowed" | "denied";

export type LedgerEntryStatus =
  | "success"
  | "blocked"
  | "revoked"
  | "paid_ai_failed";

export type PaymentRequirementStatus = "required" | "expired" | "cancelled";

export type PaymentReceiptStatus = "paid" | "failed" | "mocked";

export type RiskLevel = "low" | "medium" | "high" | "unknown";

export type StateTone = "ready" | "working" | "warn" | "danger";

export type X402ChallengeStatus =
  | "idle"
  | "received_402"
  | "paid_request_submitted"
  | "settled"
  | "blocked_before_payment"
  | "failed";

export type X402PaymentHeaderStatus =
  | "not_applicable"
  | "not_submitted"
  | "submitted"
  | "settled";

export type X402EvidenceRequirement = {
  id: string | null;
  endpoint: string;
  method: HttpMethod;
  scheme: string;
  network: string;
  asset: string;
  assetLabel: string;
  amountAtomic: AtomicAmount;
  token: TokenSymbol;
  tokenDecimals: number;
  payTo: string;
  assetTransferMethod: string;
  maxTimeoutSeconds: number | null;
  source: "policy_projection" | "unpaid_402" | "ledger";
};

export type X402Evidence = {
  challengeStatus: X402ChallengeStatus;
  paymentHeaderStatus: X402PaymentHeaderStatus;
  protectedResource: string;
  selectedRequirement: X402EvidenceRequirement;
  paidRequest: {
    submitted: boolean;
    settled: boolean;
    txHash: string | null;
  };
  updatedAt: IsoDateTime | null;
};

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

export type Erc7710ProofStatus =
  | "not_ready"
  | "grant_ready"
  | "payload_validated"
  | "settlement_preflighted"
  | "settled"
  | "blocked"
  | "failed";

export type Erc7710TransferAmountCaveatProof = {
  enforcer: string;
  maxAmountAtomic: AtomicAmount;
  tokenAddress: string;
};

export type Erc7710LimitedCallsCaveatProof = {
  enforcer: string;
  limit: number;
};

export type Erc7710ValueLteCaveatProof = {
  enforcer: string;
  maxValueAtomic: AtomicAmount;
};

export type Erc7710AllowedTargetsCaveatProof = {
  enforcer: string;
  targets: string[];
};

export type Erc7710AllowedMethodsCaveatProof = {
  enforcer: string;
  selectors: string[];
};

export type Erc7710TimestampCaveatProof = {
  afterThreshold: number;
  beforeThreshold: number;
  enforcer: string;
};

export type Erc7710DecodedCaveatProof = {
  decoded: boolean;
  enforcer: string;
  label: string;
  summary: string;
  termsBytes: number | null;
  type: string;
};

export type Erc7710ChildCaveatProof = {
  allowedMethods: Erc7710AllowedMethodsCaveatProof | null;
  allowedTargets: Erc7710AllowedTargetsCaveatProof | null;
  caveatCount: number;
  erc20TransferAmount: Erc7710TransferAmountCaveatProof | null;
  limitedCalls: Erc7710LimitedCallsCaveatProof | null;
  ordered: Erc7710DecodedCaveatProof[];
  timestamp: Erc7710TimestampCaveatProof | null;
  valueLte: Erc7710ValueLteCaveatProof | null;
};

export type Erc7710PayloadProof = {
  childCaveats?: Erc7710ChildCaveatProof | null;
  childDelegationDelegator: string | null;
  childErc20TransferAmount: Erc7710TransferAmountCaveatProof | null;
  childDelegationTarget: string | null;
  delegationCount: number | null;
  localPayloadMatchesGrant: boolean | null;
  permissionContextBytes: number | null;
  permissionContextHash: string | null;
  redeemerConstraint: boolean | null;
  serverPayloadMatchesGrant: boolean | null;
  settlementPreflight: boolean | null;
  validatedAt: IsoDateTime;
  validationSource: "client_local" | "server_verified" | "client_and_server";
};

export type Erc7710Proof = {
  status: Erc7710ProofStatus;
  grant: {
    delegationManager: string;
    delegator: string | null;
    expiresAt: IsoDateTime;
    parentPermissionContextBytes: number | null;
    parentPermissionContextHash: string | null;
    permissionType: AdvancedPermissionGrant["permissionType"];
    periodAmountAtomic: AtomicAmount;
    periodDuration: number;
    redeemer: string;
    sessionAccount: string;
    startTime: number;
    source: AdvancedPermissionGrant["source"];
    tokenAddress: string;
    tokenDecimals: number;
    tokenLimitAtomic: AtomicAmount;
    tokenSymbol: TokenSymbol;
    expiry: number;
  } | null;
  payer: string | null;
  payload: Erc7710PayloadProof | null;
  rawContextExposed: false;
  updatedAt: IsoDateTime | null;
  validationMessage: string;
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
  mode: SpendGuardMode;
  quoteId: string | null;
  fee: string | null;
  feeAtomic: AtomicAmount | null;
  feeCollector: string | null;
  taskId: string | null;
  totalWalletDebitAtomic: AtomicAmount | null;
  txHash: string | null;
};

export type OneShotPaymentTimeline = {
  quoteId: string;
  fee: string;
  feeAtomic?: AtomicAmount | null;
  feeCollector?: string | null;
  taskId: string;
  status: Extract<
    RelayerStatus,
    "submitted" | "pending" | "confirmed" | "failed" | "mocked"
  >;
  totalWalletDebitAtomic?: AtomicAmount | null;
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

export type AgentSpendDecision = {
  decision: AgentSpendDecisionKind;
  reason: string;
  estimatedCostAtomic: AtomicAmount;
  budgetBeforeAtomic: AtomicAmount;
  budgetAfterAtomic: AtomicAmount | null;
  confidence: AgentSpendDecisionConfidence;
  policyCheck: AgentSpendDecisionPolicyCheck;
  decidedAt: IsoDateTime;
};

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
  asset?: string;
  assetTransferMethod?: string;
  maxTimeoutSeconds?: number | null;
  network?: string;
  scheme?: string;
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
  erc7710Proof?: Erc7710PayloadProof | null;
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
  agentDecision: AgentSpendDecision | null;
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
    | "agentDecision"
    | "paymentRequirement"
    | "paymentReceipt"
    | "veniceRiskBrief"
    | "time"
    | "cost"
  >
> &
  Pick<LedgerEntry, "amountAtomic" | "status">;

export type DashboardAccounting = {
  agentBudgetConsumed: string;
  agentBudgetConsumedAtomic: AtomicAmount;
  policyBudgetCovers: "x402_service_price_only";
  policyNote: string;
  relayFee: string;
  relayFeeAtomic: AtomicAmount | null;
  remainingBudget: string;
  remainingBudgetAtomic: AtomicAmount;
  servicePrice: string;
  servicePriceAtomic: AtomicAmount;
  source: "policy_projection" | "latest_paid_call" | "blocked_request";
  token: TokenSymbol;
  totalWalletDebit: string;
  totalWalletDebitAtomic: AtomicAmount | null;
};

export type OnchainPermissionAvailableAmountStatus =
  | "not_applicable"
  | "not_queried"
  | "querying"
  | "available"
  | "unavailable"
  | "error";

export type OnchainPermissionAvailableAmount = {
  availableAmount: string;
  availableAmountAtomic: AtomicAmount | null;
  currentPeriod: string | null;
  delegationHash: string | null;
  enforcer: string | null;
  error: string | null;
  isNewPeriod: boolean | null;
  source: "metamask-period-transfer-enforcer";
  status: OnchainPermissionAvailableAmountStatus;
  token: TokenSymbol;
  tokenAddress: string | null;
  tokenDecimals: number;
  updatedAt: IsoDateTime | null;
};

export type DashboardAgentSpendDecision = {
  decision: AgentSpendDecisionKind;
  reason: string;
  estimatedCost: string;
  estimatedCostAtomic: AtomicAmount;
  budgetBefore: string;
  budgetBeforeAtomic: AtomicAmount;
  budgetAfter: string;
  budgetAfterAtomic: AtomicAmount | null;
  confidence: AgentSpendDecisionConfidence;
  policyCheck: AgentSpendDecisionPolicyCheck;
  enforcement: string;
  decidedAt: IsoDateTime;
};

export type DashboardLedgerEntry = {
  id: string;
  time: string;
  service: string;
  cost: string;
  budgetConsumed: string;
  relayFee: string;
  serviceCost: string;
  status: LedgerEntryStatus;
  callNumber: number | null;
  childDelegationTarget: string | null;
  agentDecision: DashboardAgentSpendDecision | null;
  agentDecisionReason: string | null;
  paymentRequirementId: string | null;
  payloadContextHash: string | null;
  remainingAfter: string;
  totalWalletDebit: string;
  txHash: string | null;
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
  erc7710Proof: Erc7710Proof;
  policyConfig: DashboardPolicyConfig;
  accounting: DashboardAccounting;
  agentDecision: DashboardAgentSpendDecision | null;
  onchainPermission: OnchainPermissionAvailableAmount;
  x402Evidence: X402Evidence;
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
  agentDecision: AgentSpendDecision | null;
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
