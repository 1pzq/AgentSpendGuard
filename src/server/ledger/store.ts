import { spendguardConfig } from "@/server/config/spendguard";
import { readJsonFile, writeJsonFile } from "@/server/storage/jsonFile";
import type {
  AtomicAmount,
  IsoDateTime,
  LedgerEntry,
  LedgerEntryInput
} from "@/shared/types";
import {
  hasSettledPaymentIdentity,
  settledPaymentIdentitiesMatch,
  settledPaymentIdentity
} from "./settledPaymentIdentity";

const { mockIds, policy } = spendguardConfig;
const LEDGER_FILE = "ledger.json";

type LedgerSnapshot = {
  entries: LedgerEntry[];
  sequence: number;
};

type LedgerGlobal = typeof globalThis & {
  __spendguardLedgerEntries?: LedgerEntry[];
  __spendguardLedgerSequence?: number;
  __spendguardLedgerLoaded?: boolean;
};

function ledgerGlobal(): LedgerGlobal {
  return globalThis as LedgerGlobal;
}

function isLedgerEntry(value: unknown): value is LedgerEntry {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as LedgerEntry).id === "string" &&
    typeof (value as LedgerEntry).amountAtomic === "string" &&
    typeof (value as LedgerEntry).status === "string"
  );
}

function sequenceFromEntries(entries: LedgerEntry[]): number {
  return entries.reduce((max, entry) => {
    const suffix = entry.id.match(/-(\d+)$/)?.[1];
    if (!suffix) return max;
    return Math.max(max, Number(suffix));
  }, 0);
}

function readLedgerSnapshot(): LedgerSnapshot {
  const snapshot = readJsonFile<Partial<LedgerSnapshot>>(LEDGER_FILE, {});
  const entries = Array.isArray(snapshot.entries)
    ? snapshot.entries.filter(isLedgerEntry)
    : [];
  const sequence =
    typeof snapshot.sequence === "number" && Number.isSafeInteger(snapshot.sequence)
      ? snapshot.sequence
      : sequenceFromEntries(entries);

  return { entries, sequence };
}

function writeLedgerSnapshot(entries: LedgerEntry[], sequence: number) {
  writeJsonFile(LEDGER_FILE, { entries, sequence });
}

function ensureLedgerLoaded() {
  const store = ledgerGlobal();

  if (store.__spendguardLedgerLoaded) return;

  const snapshot = readLedgerSnapshot();
  store.__spendguardLedgerEntries = snapshot.entries;
  store.__spendguardLedgerSequence = snapshot.sequence;
  store.__spendguardLedgerLoaded = true;
}

function getLedgerEntriesState(): LedgerEntry[] {
  ensureLedgerLoaded();
  const store = ledgerGlobal();

  if (!store.__spendguardLedgerEntries) {
    store.__spendguardLedgerEntries = [];
  }

  return store.__spendguardLedgerEntries;
}

function setLedgerEntriesState(entries: LedgerEntry[]): LedgerEntry[] {
  const store = ledgerGlobal();
  store.__spendguardLedgerEntries = entries;
  writeLedgerSnapshot(entries, store.__spendguardLedgerSequence ?? 0);
  return entries;
}

function nextLedgerSequence(): number {
  ensureLedgerLoaded();
  const store = ledgerGlobal();
  store.__spendguardLedgerSequence = (store.__spendguardLedgerSequence ?? 0) + 1;
  return store.__spendguardLedgerSequence;
}

function resetLedgerSequence() {
  const store = ledgerGlobal();
  store.__spendguardLedgerSequence = 0;
}

function nowIso(): IsoDateTime {
  return new Date().toISOString();
}

function nextLedgerId(): string {
  return `${mockIds.ledgerSeedId}-${nextLedgerSequence().toString().padStart(3, "0")}`;
}

function formatTime(occurredAt: IsoDateTime): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai"
  }).format(new Date(occurredAt));
}

function formatAtomicUsdc(amountAtomic: AtomicAmount): string {
  const decimals = BigInt(10 ** policy.tokenDecimals);
  const amount = BigInt(amountAtomic);
  const whole = amount / decimals;
  const fraction = (amount % decimals).toString().padStart(policy.tokenDecimals, "0");
  const cents = fraction.slice(0, 2).padEnd(2, "0");

  return `${whole.toString()}.${cents} ${policy.token}`;
}

function cloneLedgerEntry(entry: LedgerEntry): LedgerEntry {
  return {
    ...entry,
    agentDecision: entry.agentDecision ? { ...entry.agentDecision } : null
  };
}

function matchingSettledLedgerEntry(input: LedgerEntryInput): LedgerEntry | null {
  if (
    input.status !== "success" &&
    input.status !== "paid_ai_failed"
  ) {
    return null;
  }

  const identity = settledPaymentIdentity(input);

  if (!hasSettledPaymentIdentity(identity)) {
    return null;
  }

  return (
    getLedgerEntriesState().find((entry) => {
      if (entry.status !== "success" && entry.status !== "paid_ai_failed") {
        return false;
      }

      const existing = settledPaymentIdentity(entry);

      return settledPaymentIdentitiesMatch(identity, existing);
    }) ?? null
  );
}

export function findSettledLedgerEntry(input: LedgerEntryInput): LedgerEntry | null {
  const duplicate = matchingSettledLedgerEntry(input);
  return duplicate ? cloneLedgerEntry(duplicate) : null;
}

export function appendLedgerEntry(input: LedgerEntryInput): LedgerEntry {
  const duplicate = findSettledLedgerEntry(input);
  if (duplicate) return duplicate;

  const occurredAt = input.occurredAt ?? nowIso();
  const entry: LedgerEntry = {
    id: input.id ?? nextLedgerId(),
    permissionId: input.permissionId ?? mockIds.permissionId,
    policyId: input.policyId ?? policy.id,
    serviceId: input.serviceId ?? policy.serviceId,
    service: input.service ?? policy.service,
    endpoint: input.endpoint ?? policy.allowedEndpoint,
    amountAtomic: input.amountAtomic,
    token: input.token ?? policy.token,
    tokenDecimals: input.tokenDecimals ?? policy.tokenDecimals,
    status: input.status,
    occurredAt,
    reason: input.reason ?? null,
    agentDecision: input.agentDecision ?? null,
    paymentRequirement: input.paymentRequirement ?? null,
    paymentReceipt: input.paymentReceipt ?? null,
    veniceRiskBrief: input.veniceRiskBrief ?? null,
    createdAt: nowIso(),
    time: input.time ?? formatTime(occurredAt),
    cost: input.cost ?? formatAtomicUsdc(input.amountAtomic)
  };

  setLedgerEntriesState([entry, ...getLedgerEntriesState()]);
  return cloneLedgerEntry(entry);
}

export function listLedgerEntries(): LedgerEntry[] {
  return getLedgerEntriesState().map(cloneLedgerEntry);
}

export function clearLedgerEntries(): LedgerEntry[] {
  resetLedgerSequence();
  setLedgerEntriesState([]);
  return [];
}

export function resetLedgerDemoState(): LedgerEntry[] {
  return clearLedgerEntries();
}
