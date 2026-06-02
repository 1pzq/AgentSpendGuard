#!/usr/bin/env node

import assert from "node:assert/strict";
import { createRequire, register } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const rootUrl = pathToFileURL(`${process.cwd()}/`).href;
const typescriptUrl = pathToFileURL(require.resolve("typescript")).href;
const aliasLoader = `
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import ts from ${JSON.stringify(typescriptUrl)};

const rootUrl = ${JSON.stringify(rootUrl)};

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    return {
      shortCircuit: true,
      url: new URL("src/" + specifier.slice(2) + ".ts", rootUrl).href
    };
  }

  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      context.parentURL?.endsWith(".ts")
    ) {
      return {
        shortCircuit: true,
        url: new URL(specifier + ".ts", context.parentURL).href
      };
    }

    throw error;
  }
}

export async function load(url, context, nextLoad) {
  if (url.endsWith(".ts")) {
    const source = await readFile(fileURLToPath(url), "utf8");
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022
      }
    });

    return {
      format: "module",
      shortCircuit: true,
      source: transpiled.outputText
    };
  }

  return nextLoad(url, context);
}
`;

register(`data:text/javascript,${encodeURIComponent(aliasLoader)}`, import.meta.url);

const {
  applyAgentDecisionPolicyCheck,
  buildAgentSpendDecisionInput,
  normalizeAgentSpendDecision
} = await import("../src/server/agent-runner/agentSpendDecision.ts");
const {
  AGENT_RUNNER_ACTION,
  precheckPolicyGuard
} = await import("../src/server/agent-runner/policyGuard.ts");
const { isAgentRunnerError } = await import("../src/server/agent-runner/errors.ts");
const {
  createDefaultPermissionRecord
} = await import("../src/server/permissions/store.ts");

const pricePerCallAtomic = "10000";

function permission(overrides = {}) {
  return createDefaultPermissionRecord({
    approvedAt: new Date().toISOString(),
    pricePerCallAtomic,
    status: "fallback_local",
    ...overrides
  });
}

function decisionFor({ amountAtomic, intent, permissionRecord }) {
  return normalizeAgentSpendDecision(
    buildAgentSpendDecisionInput({
      action: AGENT_RUNNER_ACTION,
      amountAtomic,
      permission: permissionRecord,
      policyId: permissionRecord.policyId,
      recentLedgerEntries: []
    }),
    {
      estimatedCostAtomic: amountAtomic,
      confidence: "high",
      reason: `${intent.decision} smoke`,
      ...intent
    }
  );
}

function simulatePrecheck({ amountAtomic, intent, permissionRecord }) {
  const initialDecision = decisionFor({ amountAtomic, intent, permissionRecord });

  if (initialDecision.decision !== "spend") {
    return {
      agentDecision: applyAgentDecisionPolicyCheck(initialDecision, "denied"),
      paidHeaderSubmitted: false,
      policyReached: false,
      txHash: null
    };
  }

  try {
    precheckPolicyGuard({
      action: AGENT_RUNNER_ACTION,
      amountAtomic: initialDecision.estimatedCostAtomic,
      permissionRecord,
      policyId: permissionRecord.policyId
    });

    return {
      agentDecision: applyAgentDecisionPolicyCheck(initialDecision, "allowed"),
      paidHeaderSubmitted: false,
      policyReached: true,
      txHash: null
    };
  } catch (error) {
    if (!isAgentRunnerError(error)) throw error;

    return {
      agentDecision: applyAgentDecisionPolicyCheck(initialDecision, "denied"),
      errorCode: error.code,
      paidHeaderSubmitted: false,
      policyReached: true,
      txHash: null
    };
  }
}

const results = [];

function check(name, fn) {
  fn();
  results.push({ name, status: "pass" });
}

check("AI decision=skip writes no paid header or tx", () => {
  const result = simulatePrecheck({
    amountAtomic: pricePerCallAtomic,
    intent: {
      decision: "skip",
      reason: "The agent can answer without a paid call."
    },
    permissionRecord: permission()
  });

  assert.equal(result.agentDecision.decision, "skip");
  assert.equal(result.agentDecision.policyCheck, "denied");
  assert.equal(result.paidHeaderSubmitted, false);
  assert.equal(result.policyReached, false);
  assert.equal(result.txHash, null);
});

check("AI decision=spend but over budget is blocked before payment", () => {
  const result = simulatePrecheck({
    amountAtomic: pricePerCallAtomic,
    intent: {
      decision: "spend",
      reason: "The wallet risk brief is worthwhile."
    },
    permissionRecord: permission({
      remainingSpendAtomic: "5000",
      spentAtomic: "995000",
      spendCount: 99
    })
  });

  assert.equal(result.agentDecision.decision, "spend");
  assert.equal(result.agentDecision.policyCheck, "denied");
  assert.equal(result.errorCode, "BUDGET_EXCEEDED");
  assert.equal(result.paidHeaderSubmitted, false);
  assert.equal(result.txHash, null);
});

check("AI decision=spend within budget reaches precheck path", () => {
  const result = simulatePrecheck({
    amountAtomic: pricePerCallAtomic,
    intent: {
      decision: "spend",
      reason: "The wallet risk brief needs a paid analysis call."
    },
    permissionRecord: permission()
  });

  assert.equal(result.agentDecision.decision, "spend");
  assert.equal(result.agentDecision.policyCheck, "allowed");
  assert.equal(result.policyReached, true);
  assert.equal(result.paidHeaderSubmitted, false);
  assert.equal(result.txHash, null);
});

console.log(JSON.stringify({ results }, null, 2));
