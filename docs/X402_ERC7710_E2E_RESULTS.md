# x402 + ERC-7710 E2E Results

Last updated: 2026-06-02

## 2026-06-02 P5 Multi-Transaction User Run

Tester: user-run browser flow on `http://127.0.0.1:3012`.

Purpose:

```text
Validate P5 from docs/PROJECT_HARDENING_PLAN_CN.md:
one MetaMask Advanced Permission grant can back multiple independent
ERC-7710 x402 paid calls, and an oversized request is blocked without a tx.
```

Observed UI sequence:

```text
After call #1:
  paid calls = 1
  next call = #2
  remaining budget = 0.99 USDC

After call #2:
  paid calls = 2
  next call = #3
  remaining budget = 0.98 USDC

After call #3:
  paid calls = 3
  next call = #4
  remaining budget = 0.97 USDC
```

Ledger source:

```text
.spendguard/ledger.json
/api/ledger on port 3012
```

Paid transaction evidence:

| Call | Tx hash | Payload context hash | x402 service price | 1Shot relay fee | Total wallet debit | Remaining budget |
|---|---|---|---:|---:|---:|---:|
| #1 | `0x62e550bd889a8eeb72b72633371bd4be8118cd6026ad330ffeb0957d18b0aec0` | `0xe35522e53e9cf3c72e0150fa298e9b9446c83b91343ad6ce79da1be957481d10` | 10000 atomic USDC | 12042 atomic USDC | 22042 atomic USDC | 0.99 USDC |
| #2 | `0x9398cc02b95761f07c890a9a6346318e78ef4649c1c971659b92f4e1f9d1bd4e` | `0xf4a42c3b50e45e9e74bb3afc7c6f6691f97f41018752da0a3115e6b02110dc5f` | 10000 atomic USDC | 10626 atomic USDC | 20626 atomic USDC | 0.98 USDC |
| #3 | `0xa065cfa4d2e09048ae4015e2f4a779c26de05cccae4a14af65c8356d174f65d3` | `0xe3f22f2014585830d985097d945f4a4416f732aed2999f7764fdac63554a2d8a` | 10000 atomic USDC | 10626 atomic USDC | 20626 atomic USDC | 0.97 USDC |

Explorer links:

```text
https://sepolia.basescan.org/tx/0x62e550bd889a8eeb72b72633371bd4be8118cd6026ad330ffeb0957d18b0aec0
https://sepolia.basescan.org/tx/0x9398cc02b95761f07c890a9a6346318e78ef4649c1c971659b92f4e1f9d1bd4e
https://sepolia.basescan.org/tx/0xa065cfa4d2e09048ae4015e2f4a779c26de05cccae4a14af65c8356d174f65d3
```

Base Sepolia receipt check:

| Call | Receipt status | Block | To |
|---|---|---:|---|
| #1 | `0x1` | `0x2852bdd` | `0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3` |
| #2 | `0x1` | `0x2852c22` | `0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3` |
| #3 | `0x1` | `0x2852c44` | `0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3` |

Shared proof properties:

```text
payer / delegator: 0xE56937908B36022578ab8D66B0002f246722EE8e
payTo: 0xe61109ccCbf5a9b15F805e58e9A0ec286a46d0Be
session account / child delegator: 0x8fA57C6c8Ead2828ae92810d82199D7201f4A5A8
child delegation target: 0xf1ef956eff4181Ce913b664713515996858B9Ca9
child erc20TransferAmount max: 30000 atomic USDC
child allowed method: 0xa9059cbb
child allowed target: 0x036CbD53842c5426634e7929541eC2318f3dCF7e
```

Over-budget block evidence:

```text
POST /api/agent/precheck
body: {"amountAtomic":"1010000","recordBlockedOnly":true}
```

Observed result:

```text
state.payment = blocked
latest ledger status = blocked
reason = 支付金额超过单次价格上限
txHash = null
payloadContextHash = null
budgetConsumed = 0.00 USDC
totalWalletDebit = 无钱包扣款
success rows remained = 3
total rows after blocked proof = 4
```

The over-budget check only exercises the local policy precheck path. It does
not build an x402 payment header, does not open MetaMask, and does not submit a
settlement request.

P5 result:

```text
PASS
```

The P5 run proves:

```text
one MetaMask Advanced Permission grant
-> three independent ERC-7710 payload context hashes
-> three independent Base Sepolia settlement txs
-> three success ledger rows with decreasing budget
-> oversized request blocked before payment with no tx
```

## 2026-06-01 Clean User Run

Tester: user-run browser flow.

Purpose:

```text
Validate Step 2 from docs/X402_ERC7710_TRACK_OPTIMIZATION_PLAN_CN.md:
reset-to-success x402 + ERC-7710 paid flow, then over-budget block.
```

## Successful Paid Run

Confirmed transaction:

```text
0xd864924d7f92e498f51d5a0065c4d1a29ae6629087f5e9602177f0c8590c3a4d
```

Explorer:

```text
https://sepolia.basescan.org/tx/0xd864924d7f92e498f51d5a0065c4d1a29ae6629087f5e9602177f0c8590c3a4d
```

BaseScan status:

```text
Status: Success
Timestamp: Jun-01-2026 04:23:06 AM +UTC
Function: Redeem Delegations
Network: Base Sepolia Testnet
```

Observed ERC-20 transfers:

```text
From 0xE5693790...46722EE8e to 0xe61109cc...86a46d0Be: 0.01 USDC
From 0xE5693790...46722EE8e to 0xE936e8FA...B71C17604: 0.010944 USDC
```

Interpretation:

```text
0.01 USDC = x402 service payment
0.010944 USDC = 1Shot relay fee payment
```

Accounting boundary used by the demo:

```text
x402 service price: 10000 atomic USDC = 0.01 USDC
relay / settlement fee: 10944 atomic USDC = 0.010944 USDC
total wallet debit: 20944 atomic USDC = 0.020944 USDC
agent budget consumed: 10000 atomic USDC = 0.01 USDC
remaining budget after this paid call: 0.99 USDC
```

SpendGuard's demo policy cap intentionally counts the x402 service price. The
1Shot relay fee is paid by the wallet as part of settlement infrastructure and
is displayed separately so the ledger does not imply that the relay fee was
zero.

## Acceptance Checklist

The user provided a validation table showing:

```text
Agent Runner: "agentAction":"succeeded" -> pass
x402 Payment: "payment":"paid" -> pass
1Shot Relayer: "relayer":"confirmed" -> pass
ledger: "ledger":"has_success" and success record exists -> pass
spent: "spent":0.01 -> pass
txHash: txHash field exists -> pass
```

Step 2 result:

```text
PASS
```

The paid flow proved:

```text
MetaMask Advanced Permission grant
-> ERC-7710 payment payload
-> x402 paid request
-> 1Shot-supported settlement confirmation
-> ledger success state
```

## Over-Budget Block

The user then clicked `Try Over Budget`.

Observed UI state:

```text
Wallet: connected
Permission: redeemed
Agent Runner: blocked
Precheck: Budget check failed
Narrative: Oversized request blocked before payment. SpendGuard recorded the
policy violation without submitting a settlement.
```

Important result:

```text
The over-budget action did not create another paid settlement.
```

This verifies the SpendGuard safety claim for the demo:

```text
over-budget request -> blocked before payment / settlement
```

## Step 7 Failure Semantics Matrix

Command smoke added:

```text
/Users/puzhiqiu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/step7-failure-smoke.mjs http://127.0.0.1:3013
```

Observed result on 2026-06-01:

```text
5 checks passed
```

Acceptance matrix:

```text
missing ERC-7710 payment payload:
  HTTP 402, no success ledger

dry-run endpoint with payment-signature header:
  HTTP 400 DRY_RUN_PAYMENT_REJECTED, no settlement, no ledger spend, no paid handler

oversized precheck:
  dashboard agentAction=blocked, payment=blocked, paid header not_submitted,
  relayer txHash=null, no success ledger

1Shot numeric status parser:
  status=200 plus receipt.transactionHash normalizes to confirmed

duplicate settled payment identity:
  duplicate tx hash, x402 requirement id, or ERC-7710 payload context hash
  are treated as the same settled payment identity
```

Residual risk:

```text
Settlement failure is fail-closed by route structure because ledger success is
recorded only in onSettled after successful settlement. This smoke pass did not
generate a valid ERC-7710 payment payload that intentionally fails only during
settlement, so that specific branch remains code-reviewed rather than live-fixture
tested.
```

## Residual UI Note

After `Try Over Budget`, the Budget Policy badge showed:

```text
Policy: exhausted
$0.01 spent
$0.99 left
```

The security behavior is correct, but the wording can confuse judges because
the budget is not numerically exhausted. A later polish pass should rename this
state in the UI to something closer to:

```text
policy violation
blocked attempt
guard tripped
```

or separate `budget remaining` from `last attempted action blocked`.

## Next Recommended Step

Proceed to Step 8:

```text
Final Judge Demo Package
```

The next work should package the already-working protocol evidence into final
judging materials:

```text
clean demo script
screenshots
transaction links
README / checklist polish
no-secrets audit
```
