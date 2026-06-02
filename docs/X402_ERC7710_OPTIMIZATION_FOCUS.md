# Best x402 + ERC-7710 Optimization Focus

Last updated: 2026-06-01

## Decision

The project optimization focus is now:

```text
Best x402 + ERC-7710
```

Agent SpendGuard should be judged as a product that lets an AI agent pay an
x402-protected API with MetaMask Advanced Permissions and ERC-7710, while
SpendGuard enforces a scoped spending budget before settlement.

## What We Are Optimizing For

The next work should make this proof chain obvious and repeatable:

```text
MetaMask Advanced Permission approved once
-> ERC-7710 delegation payment payload generated from that grant
-> x402 protected endpoint returns 402 Payment Required
-> paid x402 request submits the ERC-7710 payment header
-> SpendGuard policy guard allows or blocks before settlement
-> settlement confirms on Base Sepolia
-> ledger records truthful service spend and tx proof
```

The goal is not to add more integrations. The goal is to make the existing
working path easy for judges to understand, verify, and trust.

## Current Proof

A real paid x402 + ERC-7710 run has already confirmed on Base Sepolia through
the current 1Shot-supported settlement path:

```text
tx: 0xf669edc46cd69491719937a6b8f416a88fc0a0d0f70f99f216c05c8b82bc2577
service payment: 10000 atomic USDC = 0.01 USDC
1Shot relay fee payment: 10944 atomic USDC = 0.010944 USDC
total wallet debit: 20944 atomic USDC = 0.020944 USDC
```

Explorer:

```text
https://sepolia.basescan.org/tx/0xf669edc46cd69491719937a6b8f416a88fc0a0d0f70f99f216c05c8b82bc2577
```

The Dashboard currently reaches:

```text
Agent Runner: succeeded
x402 Payment: paid
1Shot Relayer: confirmed
ledger: success record present
```

## Out Of Scope For This Optimization Phase

These can remain honest supporting notes, but they should not consume the main
implementation or demo attention now:

```text
- Best Use of 1Shot Permissionless Relayer as the primary target
- Venice as a main judging claim
- A2A coordination
- production-grade one-click revoke
- broad multi-service agent marketplace features
```

1Shot should be framed as settlement infrastructure that helped prove the main
x402 + ERC-7710 path. DeepSeek should be framed as the useful paid AI output,
not the sponsor-track center of gravity.

## Immediate Priorities

```text
1. Capture a clean reset-to-success rerun without manual ledger reconciliation.
2. Make x402 evidence visible: 402 challenge, exact scheme, erc7710 method,
   amount, asset, network, payTo, and payment-header state.
3. Make ERC-7710 evidence visible: grant, delegator, session account,
   delegation manager, permission context hash, and payload validation result.
4. Demonstrate one approval enabling multiple in-budget agent payments.
5. Show the third or oversized payment blocked before settlement.
6. Keep accounting clear: service price, relay fee, total wallet debit, budget
   consumed, and remaining budget.
7. Keep fail-closed smoke coverage and ledger idempotency evidence current.
8. Package final README, screenshots, transaction link, and demo script around
   Best x402 + ERC-7710.
```

## Judge-Facing One-Liner

```text
Agent SpendGuard lets an AI agent pay x402-protected APIs with MetaMask
Advanced Permissions and ERC-7710, while enforcing a scoped onchain spending
budget before settlement.
```
