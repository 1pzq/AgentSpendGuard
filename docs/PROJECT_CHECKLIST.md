# Agent SpendGuard Project Checklist

## 1. Project Identity

| Item | Detail |
|---|---|
| Project name | Agent SpendGuard |
| Short name | SpendGuard |
| Category | AI agent wallet safety, onchain API payments, smart account permissions |
| One-liner | Give AI agents a bounded onchain budget so they can pay for APIs without touching a user's main wallet or unlimited approvals. |
| Tagline | Safe spending limits for autonomous onchain agents. |
| Primary user | AI agent users and builders |
| Secondary user | API providers, onchain automation builders, dApp teams |
| Core object | A revocable agent budget policy |
| Main proof | One successful paid AI action, one blocked over-budget action, one revocation flow |

## 2. Hackathon Tracks

| Track | Fit | How Agent SpendGuard Targets It |
|---|---:|---|
| Best x402 + ERC-7710 | Very high | The agent pays a protected x402 API using a MetaMask smart-account permission instead of an unlimited token approval. |
| Best Agent | Very high | The product is centered on an AI agent that performs a paid action inside user-defined spending limits. |
| Best use of Venice AI | High | Venice AI provides the real AI output in the demo, such as an onchain risk brief or market research note. |
| Best Use of 1Shot Permissionless Relayer | High, but integration-risky | The payment/action execution path should show 1Shot quote, relay submission, task id, and status. |
| Best A2A coordination | Optional stretch | A later version can let a manager agent delegate sub-budgets to worker agents. Not part of the first MVP. |
| Social Media presence | Optional | Post build logs explaining scoped agent permissions and safer x402 spending. |
| Feedback | Optional | Submit specific feedback on Smart Accounts Kit, Advanced Permissions, x402, and 1Shot docs. |

## 3. Problem Statement

AI agents are becoming able to call APIs, generate content, trade, research,
and trigger onchain actions. But today they usually need either:

- a private key,
- an API key,
- a hot wallet,
- an unlimited token approval,
- or repeated human signatures.

That creates a bad tradeoff: either the agent is powerful and risky, or safe and
annoying to use.

Agent SpendGuard makes the middle ground usable:

> Give the agent a small, explicit, revocable spending policy. Let it work
> automatically inside that policy. Block everything outside it.

## 4. User Pain Points

| Pain | User | Severity | Product Response |
|---|---|---:|---|
| Signature fatigue | Wallet users | High | User signs one scoped permission instead of every agent action. |
| Unlimited approval risk | Wallet users | Critical | Use bounded permissions with amount, time, and policy scope. |
| Agent can overspend | AI agent users | High | Enforce daily/session cap and show remaining budget. |
| API keys leak | AI/API users | High | Use x402 wallet-native payment instead of long-lived API keys where possible. |
| Gas friction | New users | High | Use smart account and 1Shot relayer path where supported. |
| Opaque agent behavior | AI agent users | High | Activity log explains action, cost, tx status, and output. |
| Hard developer integration | Builders | Medium | Keep the MVP as a reference implementation for scoped agent spending. |

## 5. Core Product Loop

### Happy Path

1. User opens SpendGuard.
2. User connects MetaMask.
3. User chooses an agent task: "Generate a wallet risk brief with Venice AI."
4. User configures policy:
   - Max spend: 1 USDC
   - Period: 24 hours
   - Allowed service: Venice AI
   - Expiry: 1 day
5. User approves permission through MetaMask Smart Accounts Kit.
6. Agent runs.
7. Protected API returns an x402 payment requirement.
8. Agent pays within the authorized budget.
9. Venice AI returns a report.
10. Dashboard displays:
    - cost,
    - remaining budget,
    - action status,
    - relayer status,
    - transaction hash or task id.

### Failure Path

1. Agent tries a second action that exceeds the 1 USDC limit.
2. SpendGuard blocks the request before or during payment execution.
3. UI shows: "Blocked: policy cap exceeded."
4. User sees the safety boundary working.

### Revocation Path

1. User clicks revoke.
2. Permission changes to revoked or inactive.
3. Agent can no longer spend.
4. UI shows the policy as closed.

## 6. MVP Feature List

| Priority | Feature | Description | Demo Requirement |
|---|---|---|---|
| P0 | Agent budget creation | User configures amount, period, expiry, and agent purpose. | Must be visible in first screen. |
| P0 | MetaMask smart account permission | User grants a scoped permission through Smart Accounts Kit / Advanced Permissions. | Must be in main demo path. |
| P0 | Venice AI action | Agent generates a useful output, not just a chat response. | Show returned report. |
| P0 | x402 payment | Agent pays for the protected API/action. | Show 402 -> payment -> success sequence. |
| P0 | Spending ledger | Show cost, remaining budget, time, service, and status. | Must be easy for judges to read. |
| P0 | Over-budget block | Attempt a second spend and block it. | Must prove bounded permission. |
| P0 | Revocation state | User can close the policy. | Show agent cannot spend afterward. |
| P1 | 1Shot status tracking | Show quote, relay task id, pending, confirmed. | Needed for 1Shot prize. |
| P1 | Policy templates | Daily Venice report, one-shot research, pay-per-call API. | Helps onboarding. |
| P1 | Human-readable policy preview | Plain-English explanation before signing. | Supports wallet UX story. |
| P2 | Risk scoring | Warn when agent action looks unusual. | Stretch only. |
| P2 | A2A sub-budget | Manager agent delegates a small budget to a worker agent. | Stretch for A2A. |

## 7. Technical Architecture

| Layer | Component | MVP Responsibility |
|---|---|---|
| Frontend | Web dashboard | Policy creation, agent run, logs, revoke UI |
| Wallet | MetaMask | User account and permission approval |
| Account layer | MetaMask Smart Accounts Kit | Smart account and scoped execution permission |
| Permission layer | ERC-7715 / ERC-7710 | Request and redeem bounded execution permission |
| Agent layer | SpendGuard agent runner | Executes one approved task inside policy |
| AI layer | Venice AI | Generates the paid AI report |
| Payment layer | x402 | Handles pay-per-request API payment |
| Execution layer | 1Shot Permissionless Relayer | Relays 7710 transaction and reports status |
| Observability | Spend ledger | Shows cost, policy status, and transaction state |

## 8. Demo Story

The demo should be narrated like this:

> AI agents are useful, but giving them a private key or unlimited token approval
> is dangerous. SpendGuard lets a user give an agent a small, readable,
> revocable budget. The agent can spend inside that policy, and nothing else.

Demo beats:

1. "Here is the policy."
2. "Here is the MetaMask permission."
3. "The agent is calling Venice."
4. "The API asks for x402 payment."
5. "The payment is executed through the authorized smart account path."
6. "Here is the result."
7. "Here is the spend ledger."
8. "Now the agent tries to exceed the budget."
9. "It is blocked."
10. "The user revokes the permission."

## 9. What Makes It Strong

| Strength | Why It Matters |
|---|---|
| Sponsor-tech native | MetaMask permissioning is not an add-on; it is the product core. |
| Easy to understand | Everyone understands a budget card for an agent. |
| Clear safety proof | Success and blocked failure are both visible. |
| Real payment loop | x402 gives the agent a reason to spend. |
| Real AI output | Venice makes the result concrete. |
| Strong demo shape | Authorize, act, pay, log, block, revoke. |
| Arbitrum reuse potential | The same permissioned-agent architecture can later be deployed to Arbitrum if network/tooling support allows. |

## 10. Risks And Mitigations

| Risk | Impact | Mitigation |
|---|---:|---|
| 1Shot relayer integration takes too long | High | Build a mocked status layer first, then replace with real relayer once the core app works. |
| ERC-7715 wallet support/version mismatch | High | Verify MetaMask version and supported networks on day one. Keep a fallback delegation demo path. |
| x402 buyer flow is complex | Medium | Start with a single protected endpoint and fixed USDC price. |
| Venice x402 route support changes | Medium | Keep direct Venice API integration as backup, while still demonstrating x402 on a local protected endpoint. |
| Product feels too small | Medium | Add spend ledger, revocation, over-budget failure, and policy preview to make the loop feel complete. |
| Too many technologies at once | High | MVP uses one agent, one service, one token, one budget policy, one successful call. |

## 11. Submission Assets Checklist

| Asset | Status Target |
|---|---|
| GitHub repo | Required |
| Live demo | Required if possible |
| Demo video | Required |
| Project description | Required |
| Track selection | Required |
| Screenshots | Recommended |
| Architecture diagram | Recommended |
| Transaction hashes / task ids | Strongly recommended |
| Social post thread | Optional prize |
| Sponsor feedback notes | Optional prize |

## 12. Final MVP Boundary

Do not build a full agent marketplace.
Do not build generic DeFi automation.
Do not support many chains in the first version.
Do not hand-write custom permission contracts unless absolutely required.

Build one sharp product:

> A user gives one AI agent one bounded budget to buy one paid AI service, then
> sees one successful spend, one blocked overspend, and one revocation.

