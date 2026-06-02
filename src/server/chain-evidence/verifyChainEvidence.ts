import {
  BASE_SEPOLIA_EXPLORER_URL,
  BASE_SEPOLIA_PUBLIC_RPC_URL
} from "@/shared/chain";
import { spendguardConfig } from "@/server/config/spendguard";

const DELEGATION_MANAGER = "0xdb9b1e94b5b69df7e401ddbede43491141047db3";
const REDEEM_DELEGATIONS_SELECTOR = "0xcef6d209";
const REDEEM_DELEGATIONS_SIGNATURE =
  "redeemDelegations(bytes[],bytes32[],bytes[])";
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const USDC = "0x036cbd53842c5426634e7929541ec2318f3dcf7e";
const PAYER = "0xe56937908b36022578ab8d66b0002f246722ee8e";
const PAY_TO = "0xe61109cccbf5a9b15f805e58e9a0ec286a46d0be";
const RELAY_FEE_COLLECTOR = "0xe936e8faf4a5655469182a49a505055b71c17604";

type RpcLog = {
  address: string;
  data: string;
  topics: string[];
};

type RpcTransaction = {
  input: string;
  to: string | null;
};

type RpcReceipt = {
  blockNumber: string | null;
  gasUsed: string | null;
  logs: RpcLog[];
  status: string | null;
};

type ChainEvidenceItem = {
  call: string;
  payloadContextHash: string;
  relayFeeAtomic: string;
  serviceAmountAtomic: string;
  txHash: string;
};

export type ChainEvidenceTransferCheck = {
  amountAtomic: string;
  from: string;
  ok: boolean;
  to: string;
  type: "service" | "relay_fee";
};

export type ChainEvidenceResult = {
  blockNumber: string | null;
  call: string;
  explorerUrl: string;
  failures: string[];
  gasUsed: string | null;
  inputSelector: string | null;
  ok: boolean;
  payloadContextHash: string;
  to: string | null;
  transferChecks: ChainEvidenceTransferCheck[];
  txHash: string;
};

export type ChainEvidenceReport = {
  checkedAt: string;
  delegationManager: string;
  functionSelector: string;
  functionSignature: string;
  network: string;
  ok: boolean;
  results: ChainEvidenceResult[];
};

const EVIDENCE: ChainEvidenceItem[] = [
  {
    call: "#1",
    payloadContextHash:
      "0xe35522e53e9cf3c72e0150fa298e9b9446c83b91343ad6ce79da1be957481d10",
    relayFeeAtomic: "12042",
    serviceAmountAtomic: "10000",
    txHash:
      "0x62e550bd889a8eeb72b72633371bd4be8118cd6026ad330ffeb0957d18b0aec0"
  },
  {
    call: "#2",
    payloadContextHash:
      "0xf4a42c3b50e45e9e74bb3afc7c6f6691f97f41018752da0a3115e6b02110dc5f",
    relayFeeAtomic: "10626",
    serviceAmountAtomic: "10000",
    txHash:
      "0x9398cc02b95761f07c890a9a6346318e78ef4649c1c971659b92f4e1f9d1bd4e"
  },
  {
    call: "#3",
    payloadContextHash:
      "0xe3f22f2014585830d985097d945f4a4416f732aed2999f7764fdac63554a2d8a",
    relayFeeAtomic: "10626",
    serviceAmountAtomic: "10000",
    txHash:
      "0xa065cfa4d2e09048ae4015e2f4a779c26de05cccae4a14af65c8356d174f65d3"
  }
];

function rpcUrl() {
  return spendguardConfig.chain.rpcUrl ?? BASE_SEPOLIA_PUBLIC_RPC_URL;
}

function lower(value: string | null | undefined) {
  return value?.toLowerCase() ?? "";
}

function addressTopic(address: string) {
  return `0x${lower(address).slice(2).padStart(64, "0")}`;
}

function atomicFromLogData(data: string) {
  return BigInt(data).toString();
}

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const response = await fetch(rpcUrl(), {
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
  const json = (await response.json()) as {
    error?: { code?: number | string; message?: string };
    result?: T;
  };

  if (json.error) {
    throw new Error(`${method} failed: ${json.error.message ?? json.error.code}`);
  }

  return json.result as T;
}

function hasTransfer(
  logs: RpcLog[],
  input: {
    amountAtomic: string;
    from: string;
    to: string;
  }
) {
  return logs.some((log) => {
    const topics = log.topics ?? [];

    return (
      lower(log.address) === USDC &&
      lower(topics[0]) === TRANSFER_TOPIC &&
      lower(topics[1]) === addressTopic(input.from) &&
      lower(topics[2]) === addressTopic(input.to) &&
      atomicFromLogData(log.data) === input.amountAtomic
    );
  });
}

async function verifyEvidenceItem(
  item: ChainEvidenceItem
): Promise<ChainEvidenceResult> {
  const [transaction, receipt] = await Promise.all([
    rpc<RpcTransaction | null>("eth_getTransactionByHash", [item.txHash]),
    rpc<RpcReceipt | null>("eth_getTransactionReceipt", [item.txHash])
  ]);
  const failures: string[] = [];
  const inputSelector = transaction?.input?.slice(0, 10) ?? null;
  const transferChecks: ChainEvidenceTransferCheck[] = [
    {
      amountAtomic: item.serviceAmountAtomic,
      from: PAYER,
      ok: hasTransfer(receipt?.logs ?? [], {
        amountAtomic: item.serviceAmountAtomic,
        from: PAYER,
        to: PAY_TO
      }),
      to: PAY_TO,
      type: "service"
    },
    {
      amountAtomic: item.relayFeeAtomic,
      from: PAYER,
      ok: hasTransfer(receipt?.logs ?? [], {
        amountAtomic: item.relayFeeAtomic,
        from: PAYER,
        to: RELAY_FEE_COLLECTOR
      }),
      to: RELAY_FEE_COLLECTOR,
      type: "relay_fee"
    }
  ];

  if (!transaction) failures.push("transaction missing");
  if (!receipt) failures.push("receipt missing");
  if (receipt?.status !== "0x1") failures.push(`receipt status ${receipt?.status}`);
  if (lower(transaction?.to) !== DELEGATION_MANAGER) {
    failures.push(`to ${transaction?.to ?? "missing"}`);
  }
  if (lower(inputSelector) !== REDEEM_DELEGATIONS_SELECTOR) {
    failures.push(`selector ${inputSelector ?? "missing"}`);
  }
  for (const check of transferChecks) {
    if (!check.ok) {
      failures.push(`missing ${check.amountAtomic} atomic USDC ${check.type}`);
    }
  }

  return {
    blockNumber: receipt?.blockNumber ?? null,
    call: item.call,
    explorerUrl: `${BASE_SEPOLIA_EXPLORER_URL}/tx/${item.txHash}`,
    failures,
    gasUsed: receipt?.gasUsed ?? null,
    inputSelector,
    ok: failures.length === 0,
    payloadContextHash: item.payloadContextHash,
    to: transaction?.to ?? null,
    transferChecks,
    txHash: item.txHash
  };
}

export async function verifyChainEvidence(): Promise<ChainEvidenceReport> {
  const results = await Promise.all(EVIDENCE.map(verifyEvidenceItem));

  return {
    checkedAt: new Date().toISOString(),
    delegationManager: DELEGATION_MANAGER,
    functionSelector: REDEEM_DELEGATIONS_SELECTOR,
    functionSignature: REDEEM_DELEGATIONS_SIGNATURE,
    network: "Base Sepolia",
    ok: results.every((result) => result.ok),
    results
  };
}
