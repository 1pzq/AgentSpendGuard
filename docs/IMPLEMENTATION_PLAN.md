# Agent SpendGuard Implementation Plan

## Phase 0: Product Prototype

Goal: make the story visible before deep wallet integration.

- Create dashboard UI.
- Show agent budget policy card.
- Show permission preview.
- Show successful Venice/x402 action.
- Show spend ledger.
- Show blocked over-budget action.
- Show revoked state.

Deliverable:

- Static prototype in `prototype/`.

## Phase 1: Real Wallet And Smart Account Skeleton

Goal: connect the product shell to MetaMask.

- Add wallet connection.
- Detect account, chain, and MetaMask support.
- Add Smart Accounts Kit setup.
- Create or reference smart account.
- Show account status in UI.

Acceptance:

- User can connect MetaMask.
- UI can display EOA and smart account state.
- Unsupported environment is explained clearly.

## Phase 2: Scoped Permission Flow

Goal: make the permission the center of the product.

- Implement permission request flow.
- Request budget-like ERC-20/native token permission where supported.
- Store returned permission context.
- Display policy fields in human language.
- Add revoke/expire UI state.

Acceptance:

- User approves a real permission.
- App can display the permission boundary.
- App can show the permission status.

## Phase 3: x402 Protected Action

Goal: make the agent pay for a real resource.

- Create one protected API route.
- Use x402 seller middleware or compatible payment flow.
- Create x402 buyer path for agent call.
- Return a Venice-generated report after payment succeeds.

Acceptance:

- First request receives payment requirement.
- Agent pays.
- Protected endpoint returns useful output.

## Phase 4: 1Shot Relayer Integration

Goal: qualify for the 1Shot prize.

- Query relayer capabilities.
- Request fee quote.
- Submit ERC-7710 transaction through 1Shot.
- Store task id.
- Poll status or process webhook.
- Display relayer timeline.

Acceptance:

- UI shows quote, task id, pending, confirmed/failed.
- Demo includes at least one relayed action.

## Phase 5: Safety Proof

Goal: prove SpendGuard is not just a payment demo.

- Run one successful spend inside policy.
- Attempt one over-budget spend.
- Block it and explain why.
- Revoke permission.
- Attempt another action after revocation.

Acceptance:

- Judges can see both success and failure paths.
- The safety boundary is obvious without reading code.

## Phase 6: Submission Polish

Goal: make the project easy to judge.

- Add README with setup.
- Add architecture diagram.
- Add screenshots.
- Add demo video script.
- Add known limitations.
- Add links to transaction hashes or relayer task ids.

## Build Order

1. Static prototype.
2. Wallet connection.
3. Smart account status.
4. Permission request.
5. x402 protected endpoint.
6. Venice AI response.
7. 1Shot relayer path.
8. Safety failure path.
9. Revocation path.
10. Demo video and submission.

## Technical Unknowns To Verify First

- Exact MetaMask version required for Advanced Permissions.
- Whether the target permission type supports the intended budget shape.
- Network support for 1Shot relayer in the exact flow required by the hackathon.
- Venice x402 route/model availability.
- Whether x402 payment should be demonstrated against Venice directly or a local protected service that calls Venice.

