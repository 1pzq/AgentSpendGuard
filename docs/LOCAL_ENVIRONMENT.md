# Local Environment Configuration

Last updated: 2026-06-02

## Purpose

This document lists the local environment variables needed for the current DeepSeek-backed local demo, MetaMask EOA connection, and x402-protected endpoint.

Do not commit real API keys, RPC project IDs, private keys, or wallet secrets.

Use `.env.local` for real local values.

## Current Local Values To Use

```bash
SPENDGUARD_MODE=mock
AI_PROVIDER=deepseek
AI_MODE=real

TARGET_CHAIN_ID=84532
TARGET_CHAIN_NAME=base-sepolia
BASE_SEPOLIA_RPC_URL=https://base-sepolia.infura.io/v3/YOUR_INFURA_PROJECT_ID
BASE_SEPOLIA_WS_URL=wss://base-sepolia.infura.io/ws/v3/YOUR_INFURA_PROJECT_ID

USDC_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e
X402_PAY_TO=0xe61109ccCbf5a9b15F805e58e9A0ec286a46d0Be
X402_NETWORK=eip155:84532
X402_FACILITATOR_URL=https://tx-sentinel-base-sepolia.api.cx.metamask.io/platform/v2/x402
X402_ERC7710_FACILITATOR_ADDRESSES=
X402_PROXY_URL=http://127.0.0.1:7890

ERC7710_PAID_POC_ENABLED=true
ERC7710_PAID_POC_PRICE_ATOMIC=10000
SPENDGUARD_PRICE_PER_CALL_ATOMIC=10000
ERC7710_SELF_SETTLE_ENABLED=false
FACILITATOR_ADDRESS=
FACILITATOR_PRIVATE_KEY=
ERC7710_SELF_SETTLE_RECEIPT_POLL_MS=2000
ERC7710_SELF_SETTLE_RECEIPT_TIMEOUT_MS=120000

DEEPSEEK_MODE=real
DEEPSEEK_API_KEY=
DEEPSEEK_API_BASE=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-pro

VENICE_MODE=mock
VENICE_API_KEY=
VENICE_API_BASE=https://api.venice.ai/api/v1
VENICE_MODEL=

ONESHOT_MODE=mock
ONESHOT_REAL_CALLS_ENABLED=false
ONESHOT_BASE_URL=
ONESHOT_FEE_COLLECTOR=0xE936e8FAf4A5655469182A49a505055B71C17604
ONESHOT_TARGET_ADDRESS=0xf1ef956eff4181Ce913b664713515996858B9Ca9
ONESHOT_STATUS_MAX_POLLS=12
ONESHOT_STATUS_POLL_MS=2500
ONESHOT_API_KEY=
ONESHOT_API_SECRET=
ONESHOT_WEBHOOK_SECRET=

NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Replace `YOUR_INFURA_PROJECT_ID` in `.env.local` only.

## Variable Meanings

| Variable | Meaning | Current mode |
|---|---|---|
| `SPENDGUARD_MODE` | Overall runtime mode. | `mock` |
| `TARGET_CHAIN_ID` | Target EVM chain id. Base Sepolia is `84532`. | real config |
| `BASE_SEPOLIA_RPC_URL` | HTTP RPC for Base Sepolia. | real local secret-ish config |
| `BASE_SEPOLIA_WS_URL` | WebSocket RPC for Base Sepolia. | optional |
| `USDC_ADDRESS` | Base Sepolia USDC contract address. | real config |
| `X402_PAY_TO` | Demo merchant / x402 recipient address. | real config |
| `X402_NETWORK` | x402 v2 CAIP-2 network. `base-sepolia` is still accepted locally and normalized to `eip155:84532`. | real config |
| `X402_FACILITATOR_URL` | x402 facilitator URL. Use MetaMask's Base Sepolia x402 facilitator for the ERC-7710 paid PoC. Empty uses the `@x402/core` default facilitator, which only covers the existing EOA path. | real config |
| `X402_ERC7710_FACILITATOR_ADDRESSES` | Optional comma-separated ERC-7710 facilitator/redeemer signer addresses. When unset and `X402_FACILITATOR_URL` is MetaMask's Base Sepolia facilitator, the app defaults to the signer addresses advertised by `/supported` so the child delegation can include a RedeemerEnforcer. | optional local config |
| `X402_PROXY_URL` | Optional project-local HTTP proxy URL for server-side x402 facilitator fetches, for example `http://127.0.0.1:7890`. This only affects the local Next.js server process. Current local paid ERC-7710 PoC uses `http://127.0.0.1:7890` to reach the MetaMask facilitator. | optional local config |
| `ERC7710_SELF_SETTLE_ENABLED` | When true, the ERC-7710 paid PoC verifies through the existing x402 path but settles locally with the configured funded facilitator signer instead of calling the remote `/settle` endpoint. | optional paid PoC config |
| `FACILITATOR_ADDRESS` | Server-side ERC-7710 settlement signer address. When self-settle is enabled, this becomes the paid PoC `facilitatorAddresses` redeemer constraint. | local config |
| `FACILITATOR_PRIVATE_KEY` | Server-only funded signer private key for Base Sepolia gas. Never put this in chat, docs, or browser-visible config. | local secret only |
| `ERC7710_SELF_SETTLE_RECEIPT_POLL_MS` | Receipt polling interval for self-settled ERC-7710 transactions. | optional paid PoC config |
| `ERC7710_SELF_SETTLE_RECEIPT_TIMEOUT_MS` | Receipt wait timeout for self-settled ERC-7710 transactions. | optional paid PoC config |
| `SPENDGUARD_PRICE_PER_CALL_ATOMIC` | Main Run Agent per-call policy price. Defaults to `ERC7710_PAID_POC_PRICE_ATOMIC` so Run Agent, policy guard, and ERC-7710 settlement stay aligned. | optional policy config |
| `AI_PROVIDER` | Current paid AI provider. | `deepseek` |
| `AI_MODE` | Current AI adapter mode. | `real` locally |
| `DEEPSEEK_MODE` | DeepSeek adapter mode. | `real` locally |
| `DEEPSEEK_API_KEY` | DeepSeek API key. | local secret only |
| `DEEPSEEK_API_BASE` | DeepSeek API base URL. | real config |
| `DEEPSEEK_MODEL` | DeepSeek model for risk briefs. | real config |
| `VENICE_MODE` | Legacy Venice adapter mode. | `mock` |
| `VENICE_API_KEY` | Legacy Venice API key. | unused while DeepSeek is selected |
| `ONESHOT_MODE` | 1Shot adapter mode. Default stays `mock`; mock mode does not require an API key. | `mock` |
| `ONESHOT_REAL_CALLS_ENABLED` | Second guard for real 1Shot calls. A real adapter must refuse unless this is `true` and `ONESHOT_MODE=real`. | `false` |
| `ONESHOT_BASE_URL` | Server-side 1Shot API base URL for future real adapter work. Empty in mock mode. | real config only |
| `ONESHOT_FEE_COLLECTOR` | Base Sepolia fee collector returned by the single approved 1Shot capabilities smoke. Used as documented local config, not fetched on app startup. | real config only |
| `ONESHOT_TARGET_ADDRESS` | Base Sepolia 1Shot relayer target/redeemer address returned by the single approved capabilities smoke. In `ONESHOT_MODE=real`, this becomes the ERC-7710 redeemer constraint unless `X402_ERC7710_FACILITATOR_ADDRESSES` is explicitly set. | real config only |
| `ONESHOT_STATUS_MAX_POLLS` | Maximum bounded status checks after `relayer_send7710Transaction` in a real 1Shot settlement. | real config only |
| `ONESHOT_STATUS_POLL_MS` | Delay between bounded 1Shot status checks. | real config only |
| `ONESHOT_API_KEY` | 1Shot Dev Platform API key. Created successfully; keep it only in `.env.local` and never expose it in docs, chat, or browser code. Public Relayer may not require it. | local secret only |
| `ONESHOT_API_SECRET` | 1Shot Dev Platform API secret. Keep it only in `.env.local`; rotate it after demos if it was exposed during setup. Public Relayer may not require it. | local secret only |
| `ONESHOT_WEBHOOK_SECRET` | Optional server-side 1Shot webhook secret for future callback verification. Empty in mock mode. | local secret only |

## Security Notes

- Never place private keys in docs or chat.
- Do not commit `.env.local`.
- The current `.gitignore` ignores `.env`, `.env.local`, and `.env.*.local`.
- Rotate exposed RPC project IDs after the hackathon if they were shared publicly.
- Direct Advanced Permission revoke does not require a new environment variable.
  The browser attempts MetaMask's `wallet_revokeExecutionPermission` RPC and
  then verifies the result with `wallet_getGrantedExecutionPermissions`.
- If the current MetaMask build does not support direct ERC-7715 revoke, use the
  wallet UI to revoke the Dapp connection / Advanced Permission, then click the
  app's Revoke button again to sync local policy closure.

## Required Config For Wallet And x402

For the current local wallet/x402 path, these variables must be set:

```bash
BASE_SEPOLIA_RPC_URL
USDC_ADDRESS
X402_PAY_TO
```

No private key is required for browser MetaMask connect.

## P7 Non-Interactive Verification

Use the workspace bundled Node when running repeatable validation inside Codex:

```bash
/Users/puzhiqiu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/p7-verify.mjs
```

The script runs typecheck, Next build, caveat assertion smoke,
`git diff --check`, an isolated `next start` server, a local x402 `/supported`
facilitator stub, SSR page smoke, and Step 7 failure smoke.

It sets a temporary `SPENDGUARD_DATA_DIR`, so it does not reset the normal
`.spendguard` demo evidence or the user's live `http://127.0.0.1:3012` state.
It also avoids MetaMask clicks, real paid calls, DeepSeek calls, 1Shot real
calls, and settlement.
