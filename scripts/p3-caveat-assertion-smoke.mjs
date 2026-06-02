#!/usr/bin/env node

import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      return {
        shortCircuit: true,
        url: pathToFileURL(join(process.cwd(), "src", `${specifier.slice(2)}.ts`)).href
      };
    }

    return nextResolve(specifier, context);
  }
});

const {
  validateErc7710RequiredChildCaveats
} = await import("../src/shared/x402/erc7710DelegationInspector.ts");

const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const RELAYER_TARGET = "0xf1ef956eff4181Ce913b664713515996858B9Ca9";
const nowSeconds = 1_800_000_000;

function completeProof(overrides = {}) {
  return {
    childCaveats: {
      allowedMethods: {
        enforcer: "0x0000000000000000000000000000000000000001",
        selectors: ["0xa9059cbb"]
      },
      allowedTargets: {
        enforcer: "0x0000000000000000000000000000000000000002",
        targets: [USDC]
      },
      caveatCount: 6,
      erc20TransferAmount: {
        enforcer: "0x0000000000000000000000000000000000000003",
        maxAmountAtomic: "30000",
        tokenAddress: USDC
      },
      limitedCalls: {
        enforcer: "0x0000000000000000000000000000000000000004",
        limit: 2
      },
      ordered: [],
      timestamp: {
        afterThreshold: 0,
        beforeThreshold: nowSeconds + 300,
        enforcer: "0x0000000000000000000000000000000000000005"
      },
      valueLte: {
        enforcer: "0x0000000000000000000000000000000000000006",
        maxValueAtomic: "0"
      }
    },
    childDelegationDelegator: "0x0000000000000000000000000000000000000007",
    childDelegationTarget: RELAYER_TARGET,
    childErc20TransferAmount: null,
    delegationCount: 2,
    localPayloadMatchesGrant: null,
    permissionContextBytes: 512,
    permissionContextHash:
      "0x1111111111111111111111111111111111111111111111111111111111111111",
    redeemerConstraint: null,
    serverPayloadMatchesGrant: true,
    settlementPreflight: null,
    validatedAt: "2026-06-01T00:00:00.000Z",
    validationSource: "server_verified",
    ...overrides
  };
}

function validate(payloadProof) {
  return validateErc7710RequiredChildCaveats({
    expectedAllowedTargets: [USDC],
    expectedChildDelegationTargets: [RELAYER_TARGET],
    expectedMaxTransferAmountAtomic: "1000000",
    expectedMinTransferAmountAtomic: "10000",
    expectedTokenAddress: USDC,
    maxLimitedCalls: 2,
    maxTimeoutSeconds: 300,
    nowSeconds,
    payloadProof
  });
}

const ok = validate(completeProof());
assert.equal(ok.ok, true, "complete child caveats should pass");

const missing = validate(
  completeProof({
    childCaveats: {
      ...completeProof().childCaveats,
      allowedMethods: null,
      erc20TransferAmount: null
    }
  })
);
assert.equal(missing.ok, false, "missing key caveats should fail");
assert.deepEqual(
  missing.missing.sort(),
  ["allowedMethods", "erc20TransferAmount"].sort()
);

const wrongMethod = validate(
  completeProof({
    childCaveats: {
      ...completeProof().childCaveats,
      allowedMethods: {
        enforcer: "0x0000000000000000000000000000000000000001",
        selectors: ["0x095ea7b3"]
      }
    }
  })
);
assert.equal(wrongMethod.ok, false, "wrong method selector should fail");
assert.ok(wrongMethod.mismatches.includes("allowedMethods.selector"));

const amountTooWide = validate(
  completeProof({
    childCaveats: {
      ...completeProof().childCaveats,
      erc20TransferAmount: {
        enforcer: "0x0000000000000000000000000000000000000003",
        maxAmountAtomic: "1000001",
        tokenAddress: USDC
      }
    }
  })
);
assert.equal(amountTooWide.ok, false, "amount cap above grant should fail");
assert.ok(
  amountTooWide.mismatches.includes("erc20TransferAmount.maxAmountAboveGrant")
);

console.log(JSON.stringify({
  results: [
    { name: "complete child caveats", status: "pass" },
    { name: "missing required caveats", status: "pass" },
    { name: "wrong ERC-20 method selector", status: "pass" },
    { name: "amount cap above parent grant", status: "pass" }
  ]
}, null, 2));
