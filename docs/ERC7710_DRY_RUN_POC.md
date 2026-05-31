# ERC-7710 x402 Dry-Run PoC

Last updated: 2026-05-31

## Goal

Prove that Agent SpendGuard can use a stored MetaMask Advanced Permission grant
to build an ERC-7710 x402 payment payload without spending funds.

This phase is deliberately dry-run only:

- No paid request is submitted.
- No settlement is called.
- No chain transaction is sent.
- No Base Sepolia USDC is consumed.
- No new permission is requested.
- The existing EOA x402 `TransferWithAuthorization` flow remains intact.

Current status: implemented and locally verified on 2026-05-31. This document
describes the completed dry-run phase, not a paid ERC-7710 redemption flow.

## Deliverable Structure

Client dry-run payload builder:

```text
src/client/x402/dryRunErc7710Payment.ts
```

Dry-run seller route:

```text
src/server/x402/erc7710DryRunResourceServer.ts
src/app/api/x402/deepseek/risk-brief/dry-run/route.ts
```

Dashboard trigger and preview:

```text
src/components/Dashboard.tsx
src/components/AgentControls.tsx
src/app/globals.css
```

MetaMask session-account accessor:

```text
src/client/permissions/metamaskAdvancedPermissions.ts
```

Dependencies:

```text
package.json
package-lock.json
```

## Protocol Shape

The dry-run route returns an unpaid x402 `402 Payment Required` response whose
selected payment requirement includes:

```text
extra.assetTransferMethod = "erc7710"
```

The client registers `x402Erc7710Client` from `@metamask/x402` and uses
`createx402DelegationProvider` from
`@metamask/smart-accounts-kit/experimental`.

The stored MetaMask grant is validated before payload creation:

- `grant.from` is the delegator / payer.
- `grant.to` must match the local session account.
- `grant.context` is used as the parent permission context.
- `grant.delegationManager` must match the generated x402 payload.
- Base Sepolia, USDC, `payTo`, and amount must match policy.

The generated x402 payload contains a child delegation permission context
derived from `grant.context`; the preview intentionally exposes only hashes and
byte lengths, not raw permission context data.

## No-Spend Boundary

The dry-run client fetches only:

```text
POST /api/x402/deepseek/risk-brief/dry-run
```

It stops after `createPaymentPayload()` and never calls:

- `encodePaymentSignatureHeader`
- `processPaymentResult`
- the paid `/api/x402/deepseek/risk-brief` endpoint
- `wallet_requestExecutionPermissions`
- `eth_sendTransaction`

The dry-run server refuses payment headers:

- `PAYMENT-SIGNATURE`
- `X-PAYMENT`
- `payment`

If any of those headers are present, it returns `400` and does not verify or
settle.

## Acceptance Criteria

Accepted for this dry-run phase when all are true:

- The endpoint returns only an unpaid ERC-7710 x402 requirement.
- The requirement network, asset, `payTo`, and amount match policy.
- The generated payload exposes `delegationManager`, `permissionContext`, and
  `delegator` internally, with public preview limited to hashes/metadata.
- Payload `delegator` equals `grant.from`.
- Payload `delegationManager` equals `grant.delegationManager`.
- No payment headers are submitted by the dry-run client.
- Dry-run server rejects payment headers.
- No settlement, ledger spend, paid AI handler, or chain transaction occurs.
- Existing EOA x402 flow remains unchanged.
- Typecheck and build pass.

## Verification

Passed locally on 2026-05-31:

```bash
npm run typecheck
npm run build
```

Dry-run route smoke:

- Unpaid `POST /api/x402/deepseek/risk-brief/dry-run` returned `402`.
- The response included a `PAYMENT-REQUIRED` header.
- The selected requirement included `extra.assetTransferMethod = "erc7710"`.
- The response body reported `callsSettlement=false`,
  `recordsLedgerSpend=false`, and `runsPaidHandler=false`.
- A request with `PAYMENT-SIGNATURE` returned `400` with
  `DRY_RUN_PAYMENT_REJECTED`.

No-spend code audit:

- The dry-run client has one `fetch()` target:
  `/api/x402/deepseek/risk-brief/dry-run`.
- The dry-run client does not call `encodePaymentSignatureHeader`.
- The dry-run client does not call `processPaymentResult`.
- The dry-run client does not call `wallet_requestExecutionPermissions`.
- The dry-run client does not call `eth_sendTransaction`.
- The dry-run server does not call `processSettlement`.
- The dry-run server does not import or call the DeepSeek paid handler.
- The dry-run server does not write ledger spend.

## Limitation

This phase proves payload construction and safety boundaries only. It does not
prove that a facilitator will accept and settle the ERC-7710 payment.

The next real PoC should be a separate, explicitly approved phase and may spend
about `0.01 USDC` on Base Sepolia.
