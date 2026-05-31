import { spendguardConfig } from "@/server/config/spendguard";
import { readJsonFile, writeJsonFile } from "@/server/storage/jsonFile";
import type {
  AtomicAmount,
  AdvancedPermissionGrant,
  IsoDateTime,
  PermissionRecord,
  PermissionRecordUpdate,
  PermissionSpendUpdate,
  WalletInfo
} from "@/shared/types";

const { mockIds, policy } = spendguardConfig;
const PERMISSION_FILE = "permission.json";

type PermissionGlobal = typeof globalThis & {
  __spendguardPermissionRecord?: PermissionRecord;
  __spendguardPermissionLoaded?: boolean;
};

function nowIso(): IsoDateTime {
  return new Date().toISOString();
}

function subtractAtomic(left: AtomicAmount, right: AtomicAmount): AtomicAmount {
  const result = BigInt(left) - BigInt(right);
  return result > BigInt(0) ? result.toString() : "0";
}

function addAtomic(left: AtomicAmount, right: AtomicAmount): AtomicAmount {
  return (BigInt(left) + BigInt(right)).toString();
}

function statusAfterSpend(status: PermissionRecord["status"]): PermissionRecord["status"] {
  if (status === "active" || status === "fallback_local") return status;
  return "redeemed";
}

function createDefaultWallet(): WalletInfo {
  return {
    eoa: mockIds.walletEoa,
    smartAccount: mockIds.smartAccount,
    chain: policy.chainName
  };
}

function policyExpiryIso(): IsoDateTime {
  return new Date(Date.now() + policy.windowHours * 60 * 60 * 1000).toISOString();
}

function clonePermissionRecord(record: PermissionRecord): PermissionRecord {
  return {
    ...record,
    advancedPermissionGrant: record.advancedPermissionGrant ?? null,
    wallet: { ...record.wallet },
    allowedMethods: [...record.allowedMethods]
  };
}

export function createDefaultPermissionRecord(
  overrides: PermissionRecordUpdate = {}
): PermissionRecord {
  const timestamp = nowIso();
  const spentAtomic = overrides.spentAtomic ?? policy.spentAtomic;
  const remainingSpendAtomic =
    overrides.remainingSpendAtomic ?? subtractAtomic(policy.maxSpendAtomic, spentAtomic);

  const record: PermissionRecord = {
    id: mockIds.permissionId,
    policyId: policy.id,
    status: "not_requested",
    wallet: createDefaultWallet(),
    serviceId: policy.serviceId,
    service: policy.service,
    purpose: policy.purpose,
    token: policy.token,
    tokenDecimals: policy.tokenDecimals,
    chainId: policy.chainId,
    chainName: policy.chainName,
    allowedEndpoint: policy.allowedEndpoint,
    allowedMethods: [...policy.allowedMethods],
    payTo: policy.payTo,
    maxSpendAtomic: policy.maxSpendAtomic,
    pricePerCallAtomic: policy.pricePerCallAtomic,
    spentAtomic,
    remainingSpendAtomic,
    windowHours: policy.windowHours,
    spendCount: 0,
    createdAt: timestamp,
    approvedAt: null,
    updatedAt: timestamp,
    expiresAt: policyExpiryIso(),
    revokedAt: null,
    revokedReason: null,
    lastSpendAt: null,
    mockSignature: null,
    advancedPermissionGrant: null,
    ...overrides
  };

  return clonePermissionRecord(record);
}

function permissionGlobal(): PermissionGlobal {
  return globalThis as PermissionGlobal;
}

function isPermissionRecord(value: unknown): value is PermissionRecord {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as PermissionRecord).id === "string" &&
    typeof (value as PermissionRecord).policyId === "string" &&
    typeof (value as PermissionRecord).status === "string" &&
    typeof (value as PermissionRecord).spentAtomic === "string" &&
    typeof (value as PermissionRecord).remainingSpendAtomic === "string"
  );
}

function permissionMatchesCurrentConfig(record: PermissionRecord): boolean {
  return (
    record.policyId === policy.id &&
    record.serviceId === policy.serviceId &&
    record.chainId === policy.chainId &&
    record.token === policy.token &&
    record.allowedEndpoint === policy.allowedEndpoint &&
    record.payTo.toLowerCase() === policy.payTo.toLowerCase() &&
    record.maxSpendAtomic === policy.maxSpendAtomic &&
    record.pricePerCallAtomic === policy.pricePerCallAtomic
  );
}

function readPermissionSnapshot(): PermissionRecord {
  const stored = readJsonFile<unknown>(PERMISSION_FILE, null);

  if (isPermissionRecord(stored) && permissionMatchesCurrentConfig(stored)) {
    return clonePermissionRecord(stored);
  }

  return createDefaultPermissionRecord();
}

function ensurePermissionLoaded() {
  const store = permissionGlobal();

  if (store.__spendguardPermissionLoaded) return;

  store.__spendguardPermissionRecord = readPermissionSnapshot();
  store.__spendguardPermissionLoaded = true;
}

function getPermissionState(): PermissionRecord {
  ensurePermissionLoaded();
  const store = permissionGlobal();

  if (!store.__spendguardPermissionRecord) {
    store.__spendguardPermissionRecord = createDefaultPermissionRecord();
  }

  return store.__spendguardPermissionRecord;
}

function setPermissionState(record: PermissionRecord): PermissionRecord {
  permissionGlobal().__spendguardPermissionRecord = record;
  writeJsonFile(PERMISSION_FILE, record);
  return record;
}

export function getPermissionRecord(): PermissionRecord {
  return clonePermissionRecord(getPermissionState());
}

export function updatePermissionRecord(
  updates: PermissionRecordUpdate
): PermissionRecord {
  const current = getPermissionState();
  const next = setPermissionState({
    ...current,
    ...updates,
    updatedAt: nowIso()
  });
  return clonePermissionRecord(next);
}

export function updatePermissionSpend({
  permissionId = getPermissionState().id,
  amountAtomic,
  spentAt = nowIso()
}: PermissionSpendUpdate): PermissionRecord {
  const current = getPermissionState();

  if (permissionId !== current.id) {
    throw new Error(`Permission record not found: ${permissionId}`);
  }

  const spentAtomic = addAtomic(current.spentAtomic, amountAtomic);

  const next = setPermissionState({
    ...current,
    status: statusAfterSpend(current.status),
    spentAtomic,
    remainingSpendAtomic: subtractAtomic(current.maxSpendAtomic, spentAtomic),
    spendCount: current.spendCount + 1,
    lastSpendAt: spentAt,
    updatedAt: nowIso()
  });

  return clonePermissionRecord(next);
}

export function markPermissionRevoked(
  reason = "Permission revoked by user",
  revokedAt = nowIso(),
  advancedPermissionGrant?: AdvancedPermissionGrant | null
): PermissionRecord {
  const current = getPermissionState();
  const next = setPermissionState({
    ...current,
    advancedPermissionGrant:
      advancedPermissionGrant === undefined
        ? current.advancedPermissionGrant
        : advancedPermissionGrant,
    status: "revoked",
    revokedAt,
    revokedReason: reason,
    updatedAt: nowIso()
  });

  return clonePermissionRecord(next);
}

export function resetPermissionDemoState(): PermissionRecord {
  const next = setPermissionState(createDefaultPermissionRecord());
  return clonePermissionRecord(next);
}
