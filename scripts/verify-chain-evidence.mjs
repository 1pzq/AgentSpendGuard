const RPC_URL = process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org";

const DELEGATION_MANAGER = "0xdb9b1e94b5b69df7e401ddbede43491141047db3";
const REDEEM_DELEGATIONS_SELECTOR = "0xcef6d209";
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const USDC = "0x036cbd53842c5426634e7929541ec2318f3dcf7e";
const PAYER = "0xe56937908b36022578ab8d66b0002f246722ee8e";
const PAY_TO = "0xe61109cccbf5a9b15f805e58e9a0ec286a46d0be";
const RELAY_FEE_COLLECTOR = "0xe936e8faf4a5655469182a49a505055b71c17604";

const EVIDENCE = [
  {
    call: "#1",
    relayFeeAtomic: "12042",
    serviceAmountAtomic: "10000",
    txHash:
      "0x62e550bd889a8eeb72b72633371bd4be8118cd6026ad330ffeb0957d18b0aec0"
  },
  {
    call: "#2",
    relayFeeAtomic: "10626",
    serviceAmountAtomic: "10000",
    txHash:
      "0x9398cc02b95761f07c890a9a6346318e78ef4649c1c971659b92f4e1f9d1bd4e"
  },
  {
    call: "#3",
    relayFeeAtomic: "10626",
    serviceAmountAtomic: "10000",
    txHash:
      "0xa065cfa4d2e09048ae4015e2f4a779c26de05cccae4a14af65c8356d174f65d3"
  }
];

function lower(value) {
  return value.toLowerCase();
}

function addressTopic(address) {
  return `0x${lower(address).slice(2).padStart(64, "0")}`;
}

async function rpc(method, params) {
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params
    })
  });
  const json = await response.json();

  if (json.error) {
    throw new Error(`${method} failed: ${json.error.message ?? json.error.code}`);
  }

  return json.result;
}

function atomicFromLogData(data) {
  return BigInt(data).toString();
}

function hasTransfer(logs, { amountAtomic, from, to }) {
  return logs.some((log) => {
    const topics = log.topics ?? [];

    return (
      lower(log.address) === USDC &&
      lower(topics[0] ?? "") === TRANSFER_TOPIC &&
      lower(topics[1] ?? "") === addressTopic(from) &&
      lower(topics[2] ?? "") === addressTopic(to) &&
      atomicFromLogData(log.data) === amountAtomic
    );
  });
}

async function verifyEvidenceItem(item) {
  const [transaction, receipt] = await Promise.all([
    rpc("eth_getTransactionByHash", [item.txHash]),
    rpc("eth_getTransactionReceipt", [item.txHash])
  ]);

  const failures = [];

  if (!transaction) failures.push("transaction missing");
  if (!receipt) failures.push("receipt missing");
  if (receipt?.status !== "0x1") failures.push(`receipt status ${receipt?.status}`);
  if (lower(transaction?.to ?? "") !== DELEGATION_MANAGER) {
    failures.push(`to ${transaction?.to ?? "missing"}`);
  }
  if (lower(transaction?.input?.slice(0, 10) ?? "") !== REDEEM_DELEGATIONS_SELECTOR) {
    failures.push(`selector ${transaction?.input?.slice(0, 10) ?? "missing"}`);
  }
  if (
    !hasTransfer(receipt?.logs ?? [], {
      amountAtomic: item.serviceAmountAtomic,
      from: PAYER,
      to: PAY_TO
    })
  ) {
    failures.push(`missing ${item.serviceAmountAtomic} atomic USDC service transfer`);
  }
  if (
    !hasTransfer(receipt?.logs ?? [], {
      amountAtomic: item.relayFeeAtomic,
      from: PAYER,
      to: RELAY_FEE_COLLECTOR
    })
  ) {
    failures.push(`missing ${item.relayFeeAtomic} atomic USDC relay fee transfer`);
  }

  return {
    blockNumber: receipt?.blockNumber ?? null,
    call: item.call,
    failures,
    gasUsed: receipt?.gasUsed ?? null,
    ok: failures.length === 0,
    txHash: item.txHash
  };
}

const results = await Promise.all(EVIDENCE.map(verifyEvidenceItem));
const failed = results.filter((result) => !result.ok);

for (const result of results) {
  const status = result.ok ? "PASS" : "FAIL";
  console.log(
    `${status} ${result.call} ${result.txHash} block=${result.blockNumber ?? "n/a"} gas=${result.gasUsed ?? "n/a"}`
  );

  for (const failure of result.failures) {
    console.log(`  - ${failure}`);
  }
}

if (failed.length > 0) {
  process.exitCode = 1;
}
