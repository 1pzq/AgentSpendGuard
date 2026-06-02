#!/usr/bin/env node

import assert from "node:assert/strict";
import { normalizeOneShotStatus } from "../src/server/adapters/oneShotStatus.ts";
import {
  hasSettledPaymentIdentity,
  settledPaymentIdentitiesMatch,
  settledPaymentIdentity
} from "../src/server/ledger/settledPaymentIdentity.ts";

const DEFAULT_BASE_URL = "http://127.0.0.1:3013";
const baseUrl = new URL(
  process.env.SPENDGUARD_SMOKE_BASE_URL ?? process.argv[2] ?? DEFAULT_BASE_URL
);

const EOA = "0x8B91dF1f03566882fD6e4a832B5F6E8C0E434e2A";
const SESSION = "0xA17e3C7B91C0C1E9D2a6E3C07Dcb8F1cB72591c0";
const DELEGATION_MANAGER = "0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3";

function url(path) {
  return new URL(path, baseUrl);
}

async function requestJson(path, init = {}) {
  const response = await fetch(url(path), {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {})
    }
  });
  const text = await response.text();
  let body = null;

  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { text };
  }

  return { body, response };
}

async function postJson(path, body, init = {}) {
  return requestJson(path, {
    ...init,
    body: JSON.stringify(body),
    method: "POST"
  });
}

async function resetDemo() {
  const { body, response } = await postJson("/api/demo/reset", {});
  assert.equal(response.status, 200, "demo reset should return HTTP 200");
  assert.equal(body?.ok, true, "demo reset should return ok=true");
  return body.data.state;
}

async function ledgerState() {
  const { body, response } = await requestJson("/api/ledger");
  assert.equal(response.status, 200, "/api/ledger should return HTTP 200");
  assert.equal(body?.ok, true, "/api/ledger should return ok=true");
  return body.data;
}

function countSettledSuccess(entries) {
  return entries.filter(
    (entry) => entry.status === "success" || entry.status === "paid_ai_failed"
  ).length;
}

function countBlocked(entries) {
  return entries.filter((entry) => entry.status === "blocked").length;
}

async function activateDemoPermission() {
  const { state } = await ledgerState();
  const tokenAddress = state.x402Evidence.selectedRequirement.asset;
  const now = new Date();
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  const connected = await postJson("/api/wallet/connect", {
    walletInfo: {
      chainId: "84532",
      eoa: EOA
    }
  });

  assert.equal(connected.response.status, 200, "wallet connect should pass");
  assert.equal(connected.body?.ok, true, "wallet connect should return ok=true");

  const grant = {
    source: "metamask-erc7715",
    permissionType: "erc20-token-periodic",
    status: "granted",
    chainId: 84532,
    from: EOA,
    to: SESSION,
    sessionAccount: SESSION,
    context: "0x1234",
    delegationManager: DELEGATION_MANAGER,
    dependencies: [],
    rules: [],
    tokenAddress,
    tokenSymbol: "USDC",
    tokenDecimals: 6,
    periodAmountAtomic: "1000000",
    periodDuration: 24 * 60 * 60,
    startTime: nowSeconds,
    expiry: nowSeconds + 24 * 60 * 60,
    isAdjustmentAllowed: false,
    requestedAt: now.toISOString(),
    grantedAt: now.toISOString(),
    expiresAt,
    rawGrant: {}
  };
  const approved = await postJson("/api/permissions/request", {
    advancedPermissionGrant: grant
  });

  assert.equal(approved.response.status, 200, "permission request should pass");
  assert.equal(approved.body?.ok, true, "permission request should return ok=true");

  return approved.body.data.state;
}

const results = [];

async function check(name, fn) {
  await fn();
  results.push({ name, status: "pass" });
}

try {
await check("missing ERC-7710 payment payload returns 402 and writes no success ledger", async () => {
  await resetDemo();
  const paid = await postJson("/api/x402/deepseek/risk-brief/erc7710-paid-poc", {
    walletAddress: EOA
  });

  assert.notEqual(
    paid.response.status,
    404,
    "paid PoC route is disabled; set ERC7710_PAID_POC_ENABLED=true before running this smoke"
  );
  assert.equal(paid.response.status, 402, "missing payment payload should return HTTP 402");
  assert.equal(paid.body?.ok, false, "missing payment payload should not return ok=true");

  const ledger = await ledgerState();
  assert.equal(countSettledSuccess(ledger.entries), 0, "missing payload must not write success ledger");
  assert.equal(ledger.state.ledger, "empty", "missing payload must leave ledger empty");
});

await check("dry-run refuses payment headers without ledger spend", async () => {
  await resetDemo();
  const dryRun = await postJson(
    "/api/x402/deepseek/risk-brief/dry-run",
    {},
    {
      headers: {
        "payment-signature": "fake-payment-header"
      }
    }
  );

  assert.equal(dryRun.response.status, 400, "dry-run payment header should be rejected");
  assert.equal(dryRun.body?.error?.code, "DRY_RUN_PAYMENT_REJECTED");
  assert.equal(dryRun.body?.noSpend?.callsSettlement, false);
  assert.equal(dryRun.body?.noSpend?.recordsLedgerSpend, false);
  assert.equal(dryRun.body?.noSpend?.runsPaidHandler, false);

  const ledger = await ledgerState();
  assert.equal(countSettledSuccess(ledger.entries), 0, "dry-run rejection must not write success ledger");
  assert.equal(ledger.state.ledger, "empty", "dry-run rejection must leave ledger empty");
});

await check("oversized precheck blocks before paid header or settlement", async () => {
  await resetDemo();
  await activateDemoPermission();

  const precheck = await postJson("/api/agent/precheck", {
    amountAtomic: "1010000",
    recordBlockedOnly: true
  });

  assert.equal(precheck.response.status, 200, "recordBlockedOnly precheck should return dashboard state");
  assert.equal(precheck.body?.ok, true);
  assert.equal(precheck.body.data.state.agentAction, "blocked");
  assert.equal(precheck.body.data.state.payment, "blocked");
  assert.equal(precheck.body.data.state.x402Evidence.paymentHeaderStatus, "not_submitted");
  assert.equal(precheck.body.data.state.relayerInfo.txHash, null);

  const ledger = await ledgerState();
  assert.equal(countSettledSuccess(ledger.entries), 0, "oversized precheck must not write success ledger");
  assert.equal(countBlocked(ledger.entries), 1, "oversized precheck should write one blocked row");
});

await check("1Shot numeric status=200 with receipt.transactionHash normalizes to confirmed", async () => {
  const status = normalizeOneShotStatus("quote-step7", {
    id: "task-step7",
    receipt: {
      transactionHash:
        "0xd864924d7f92e498f51d5a0065c4d1a29ae6629087f5e9602177f0c8590c3a4d"
    },
    status: 200
  });

  assert.equal(status.status, "confirmed");
  assert.equal(status.taskId, "task-step7");
  assert.equal(
    status.txHash,
    "0xd864924d7f92e498f51d5a0065c4d1a29ae6629087f5e9602177f0c8590c3a4d"
  );
});

await check("settled payment identity catches duplicate tx, requirement, and ERC-7710 payload hash", async () => {
  const original = settledPaymentIdentity({
    paymentReceipt: {
      erc7710Proof: {
        permissionContextHash: "0xAAAAAAAA"
      },
      requirementId: "x402-erc7710-step7",
      txHash: "0xBBBBBBBB"
    }
  });
  const sameTx = settledPaymentIdentity({
    paymentReceipt: {
      txHash: "0xbbbbbbbb"
    }
  });
  const sameRequirement = settledPaymentIdentity({
    paymentRequirement: {
      id: "x402-erc7710-step7"
    }
  });
  const samePayload = settledPaymentIdentity({
    paymentReceipt: {
      erc7710Proof: {
        permissionContextHash: "0xaaaaaaaa"
      }
    }
  });

  assert.equal(hasSettledPaymentIdentity(original), true);
  assert.equal(settledPaymentIdentitiesMatch(original, sameTx), true);
  assert.equal(settledPaymentIdentitiesMatch(original, sameRequirement), true);
  assert.equal(settledPaymentIdentitiesMatch(original, samePayload), true);
  assert.equal(hasSettledPaymentIdentity(settledPaymentIdentity({})), false);
});
} finally {
  await resetDemo().catch((error) => {
    console.warn(
      `Step 7 smoke could not reset demo state: ${error instanceof Error ? error.message : String(error)}`
    );
  });
}

console.log(JSON.stringify({ baseUrl: baseUrl.toString(), results }, null, 2));
