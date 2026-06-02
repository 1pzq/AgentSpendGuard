# Agent SpendGuard

Agent SpendGuard is an AI agent spending-control layer for onchain payments.

It lets a user authorize an AI agent with a limited budget, time window, and
scope. The agent can call paid x402 APIs such as DeepSeek, but every payment is
bounded, observable, and revocable through MetaMask Smart Accounts.

```text
AI decides when to spend.
SpendGuard decides whether it may spend.
x402 + ERC-7710 proves how it spent.
```

## Hackathon

MetaMask Smart Accounts Kit x 1Shot API x Venice AI Dev Cook-Off

## One-liner

Give AI agents a bounded onchain budget so they can pay for APIs without
touching a user's main wallet, private key, or unlimited token approvals.

## Target Tracks

- Best x402 + ERC-7710
- Best Agent
- Best use of Venice AI
- Best Use of 1Shot Permissionless Relayer
- Optional stretch: Best A2A coordination

## Core Demo Loop

1. User connects MetaMask.
2. User creates an agent budget policy.
3. User approves a scoped permission with MetaMask Smart Accounts Kit.
4. Agent generates an AI spending decision with a reason and estimated cost.
5. SpendGuard enforces budget, endpoint, token, network, and payTo policy.
6. If allowed, the request is paid through x402 + ERC-7710.
7. The payment execution is relayed and tracked through 1Shot.
8. The dashboard shows the AI rationale, spend, remaining budget, logs, and tx state.
9. A second over-budget request is blocked before any paid header or settlement.
10. User revokes or expires the permission.

## Current Files

- `docs/PROJECT_CHECKLIST.md` - detailed product, track, feature, MVP, and demo checklist.
- `docs/IMPLEMENTATION_PLAN.md` - staged build plan and integration order.
- `docs/CURRENT_PROGRESS.md` - current implementation status, verification notes, and real-vs-demo boundaries.
- `src/app/api/x402/deepseek/risk-brief/route.ts` - real x402-protected DeepSeek risk-brief endpoint.
- `prototype/index.html` - static clickable product prototype.
- `prototype/styles.css` - prototype styles.
- `prototype/app.js` - prototype interaction logic.

## Current Local Status

The app now has real MetaMask EOA connection, real DeepSeek mode, a real
x402-protected seller endpoint, and an AI Spending Decision Layer before paid
requests. The browser-side buyer path has been verified through a MetaMask
x402 typed-data signature, paid request, DeepSeek result, and demo ledger update
on Base Sepolia.

Permission approval, revoke, 1Shot relay, and ledger durability are still demo
state.

## How To View Prototype

Open this file in a browser:

```text
AgentSpendGuard/prototype/index.html
```

The prototype is static and does not require a dev server.
