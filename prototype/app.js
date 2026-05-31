const policyDefaults = {
  id: "policy-demo-venice-001",
  service: "Venice AI",
  purpose: "Wallet risk brief",
  token: "USDC",
  maxSpend: 1,
  pricePerCall: 0.75,
  spent: 0,
  windowHours: 24,
  expiresAt: "2026-05-31T23:59:00+08:00",
  allowedEndpoint: "/x402/venice/risk-brief"
};

const STATE_ENUMS = {
  wallet: ["disconnected", "connected", "unsupported"],
  policy: ["draft", "ready_to_sign", "active", "exhausted", "expired", "revoked"],
  permission: ["not_requested", "requested", "approved", "rejected", "redeemed", "revoked", "fallback_local"],
  agentAction: ["idle", "prechecking", "running", "blocked", "succeeded", "failed"],
  payment: ["none", "required_402", "paying", "paid", "failed", "blocked"],
  relayer: ["not_used", "quote_requested", "quoted", "submitted", "pending", "confirmed", "failed", "mocked"],
  ledger: ["empty", "has_success", "has_blocked", "closed"],
  revocation: ["available", "revoking", "revoked", "failed"]
};

const initialState = {
  wallet: "disconnected",
  policy: "draft",
  permission: "not_requested",
  agentAction: "idle",
  payment: "none",
  relayer: "not_used",
  ledger: "empty",
  revocation: "available",
  block: {
    attempted: false,
    reason: "Second paid action has not been requested."
  },
  walletInfo: {
    eoa: null,
    smartAccount: null,
    chain: "Base Sepolia demo"
  },
  policyConfig: { ...policyDefaults },
  relayerInfo: {
    quoteId: null,
    fee: null,
    taskId: null,
    txHash: null
  },
  veniceResult: null,
  ledgerEntries: []
};

let state = clone(initialState);

const els = {
  narrative: document.querySelector("#demoNarrative"),
  connectBtn: document.querySelector("#connectBtn"),
  approveBtn: document.querySelector("#approveBtn"),
  runBtn: document.querySelector("#runBtn"),
  overBudgetBtn: document.querySelector("#overBudgetBtn"),
  revokeBtn: document.querySelector("#revokeBtn"),
  resetBtn: document.querySelector("#resetBtn"),
  walletAddress: document.querySelector("#walletAddress"),
  smartAccount: document.querySelector("#smartAccount"),
  networkName: document.querySelector("#networkName"),
  budgetUsed: document.querySelector("#budgetUsed"),
  budgetRemaining: document.querySelector("#budgetRemaining"),
  budgetBar: document.querySelector("#budgetBar"),
  precheckState: document.querySelector("#precheckState"),
  nextAction: document.querySelector("#nextAction"),
  quoteText: document.querySelector("#quoteText"),
  feeText: document.querySelector("#feeText"),
  taskText: document.querySelector("#taskText"),
  txText: document.querySelector("#txText"),
  veniceResult: document.querySelector("#veniceResult"),
  ledgerRows: document.querySelector("#ledgerRows"),
  blockState: document.querySelector("#blockState"),
  blockReason: document.querySelector("#blockReason"),
  revokeState: document.querySelector("#revokeState"),
  revokeReason: document.querySelector("#revokeReason"),
  stateJson: document.querySelector("#stateJson")
};

const statePills = {
  wallet: document.querySelector('[data-state-pill="wallet"]'),
  policy: document.querySelector('[data-state-pill="policy"]'),
  permission: document.querySelector('[data-state-pill="permission"]')
};

const badges = {
  wallet: document.querySelector('[data-badge="wallet"]'),
  policy: document.querySelector('[data-badge="policy"]'),
  permission: document.querySelector('[data-badge="permission"]'),
  agentAction: document.querySelector('[data-badge="agentAction"]'),
  payment: document.querySelector('[data-badge="payment"]'),
  relayer: document.querySelector('[data-badge="relayer"]'),
  ledger: document.querySelector('[data-badge="ledger"]'),
  revocation: document.querySelector('[data-badge="revocation"]'),
  result: document.querySelector('[data-badge="result"]')
};

const paymentOrder = ["none", "required_402", "paying", "paid"];
const relayerOrder = ["quote_requested", "quoted", "submitted", "confirmed"];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function currency(value) {
  return `$${value.toFixed(2)}`;
}

function label(value) {
  return value.replaceAll("_", " ");
}

function shortHash(value) {
  if (!value) return "None";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function toneFor(value) {
  if (["connected", "active", "approved", "redeemed", "succeeded", "paid", "confirmed", "has_success", "available"].includes(value)) {
    return "ready";
  }
  if (["requested", "ready_to_sign", "prechecking", "running", "required_402", "paying", "quote_requested", "quoted", "submitted", "pending", "revoking"].includes(value)) {
    return "working";
  }
  if (["draft", "not_requested", "idle", "none", "not_used", "empty", "mocked", "fallback_local"].includes(value)) {
    return "warn";
  }
  if (["unsupported", "rejected", "blocked", "failed", "exhausted", "expired", "revoked", "has_blocked", "closed"].includes(value)) {
    return "danger";
  }
  return "warn";
}

function setBadge(node, prefix, value) {
  if (!node) return;
  node.textContent = prefix ? `${prefix}: ${value}` : label(value);
  node.dataset.tone = toneFor(value);
}

function connectWallet() {
  if (state.wallet === "connected") return;
  state.wallet = "connected";
  state.policy = "ready_to_sign";
  state.permission = "requested";
  state.walletInfo = {
    eoa: "0x8B91...4e2A",
    smartAccount: "0xA17e...91c0",
    chain: "Base Sepolia demo"
  };
  state.block = {
    attempted: false,
    reason: "Second paid action has not been requested."
  };
  render("MetaMask is connected. Review the scoped permission before approval.");
}

function approvePermission() {
  if (state.wallet !== "connected") return;
  state.permission = "approved";
  state.policy = "active";
  state.agentAction = "idle";
  state.revocation = "available";
  render("Permission approved. The agent can now spend only inside this policy.");
}

function runAgent() {
  if (state.policy !== "active" || state.permission !== "approved") return;
  if (remainingBudget() < state.policyConfig.pricePerCall) {
    blockOverspend();
    return;
  }

  state.agentAction = "succeeded";
  state.payment = "paid";
  state.relayer = "confirmed";
  state.permission = "redeemed";
  state.policyConfig.spent = roundMoney(state.policyConfig.spent + state.policyConfig.pricePerCall);
  state.ledger = "has_success";
  state.relayerInfo = {
    quoteId: "quote_1shot_9a21",
    fee: "0.0021 ETH sponsored",
    taskId: "task_1shot_7d4c92",
    txHash: "0x7c43ab91f1d5f30ed84564c61b4a3fcb1817db9cb70d0169cc30fb5944e2aa87"
  };
  state.veniceResult = {
    title: "Wallet risk brief",
    summary: "Venice returned a concise risk report after the x402 payment cleared.",
    findings: [
      "No high-severity approval exposure found in the sampled wallet activity.",
      "Two stale testnet approvals should be reviewed before mainnet reuse.",
      "Recommended next action: keep this agent capped at 1.00 USDC per day."
    ]
  };
  state.ledgerEntries.unshift({
    time: "14:22",
    service: "Venice AI risk brief",
    cost: "0.75 USDC",
    status: "success"
  });

  render("Paid Venice response returned. The ledger now shows spend and remaining budget.");
}

function blockOverspend() {
  state.agentAction = "blocked";
  state.payment = "blocked";
  state.policy = "exhausted";
  state.ledger = "has_blocked";
  state.block = {
    attempted: true,
    reason: "Blocked before payment: 0.75 USDC requested but only 0.25 USDC remains."
  };
  state.ledgerEntries.unshift({
    time: "14:25",
    service: "Venice AI second brief",
    cost: "0.75 USDC",
    status: "blocked"
  });
  render("Second action blocked. SpendGuard stopped the request before overspending.");
}

function revokePermission() {
  if (state.wallet !== "connected") return;
  state.revocation = "revoked";
  state.permission = "revoked";
  state.policy = "revoked";
  state.agentAction = "blocked";
  state.payment = state.payment === "paid" ? "paid" : "blocked";
  state.ledger = state.ledgerEntries.length > 0 ? "closed" : "empty";
  if (!state.ledgerEntries.some((entry) => entry.status === "revoked")) {
    state.ledgerEntries.unshift({
      time: "14:27",
      service: "Scoped permission",
      cost: "0.00 USDC",
      status: "revoked"
    });
  }
  render("Permission revoked. The policy is closed and the agent cannot spend.");
}

function resetDemo() {
  state = clone(initialState);
  render("Connect MetaMask to begin the bounded agent budget flow.");
}

function remainingBudget() {
  return roundMoney(state.policyConfig.maxSpend - state.policyConfig.spent);
}

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

function render(narrative) {
  if (narrative) els.narrative.textContent = narrative;

  renderBadges();
  renderWallet();
  renderPolicy();
  renderPermissionChecks();
  renderAgent();
  renderPaymentRail();
  renderRelayer();
  renderResult();
  renderLedger();
  renderSafety();
  renderButtons();
  renderStateJson();
}

function renderBadges() {
  setBadge(statePills.wallet, "Wallet", state.wallet);
  setBadge(statePills.policy, "Policy", state.policy);
  setBadge(statePills.permission, "Permission", state.permission);
  setBadge(badges.wallet, "", state.wallet);
  setBadge(badges.policy, "", state.policy);
  setBadge(badges.permission, "", state.permission);
  setBadge(badges.agentAction, "", state.agentAction);
  setBadge(badges.payment, "", state.payment);
  setBadge(badges.relayer, "", state.relayer);
  setBadge(badges.ledger, "", state.ledger);
  setBadge(badges.revocation, "", state.revocation);
  setBadge(badges.result, "", state.veniceResult ? "succeeded" : "waiting");
}

function renderWallet() {
  els.walletAddress.textContent = state.walletInfo.eoa || "Not connected";
  els.smartAccount.textContent = state.walletInfo.smartAccount || "Pending connection";
  els.networkName.textContent = state.walletInfo.chain;
}

function renderPolicy() {
  const spent = state.policyConfig.spent;
  const remaining = Math.max(0, remainingBudget());
  const percent = Math.min(100, (spent / state.policyConfig.maxSpend) * 100);
  els.budgetUsed.textContent = `${currency(spent)} spent`;
  els.budgetRemaining.textContent = `${currency(remaining)} left`;
  els.budgetBar.style.width = `${percent}%`;
  els.budgetBar.style.background = state.policy === "revoked" || state.policy === "exhausted" ? "var(--red)" : "var(--green)";
}

function renderPermissionChecks() {
  const checkState = {
    wallet: state.wallet === "connected",
    scope: ["approved", "redeemed", "revoked"].includes(state.permission),
    budget: state.ledger !== "empty",
    revoke: state.revocation === "revoked"
  };
  document.querySelectorAll("[data-check]").forEach((item) => {
    item.classList.toggle("is-active", Boolean(checkState[item.dataset.check]));
  });
}

function renderAgent() {
  if (state.wallet !== "connected") {
    els.precheckState.textContent = "Waiting for wallet";
    els.nextAction.textContent = "Connect wallet";
    return;
  }
  if (state.permission === "requested") {
    els.precheckState.textContent = "Policy ready to sign";
    els.nextAction.textContent = "Approve scoped permission";
    return;
  }
  if (state.policy === "active") {
    els.precheckState.textContent = "Budget, scope, and expiry passed";
    els.nextAction.textContent = "Run Venice task";
    return;
  }
  if (state.policy === "exhausted") {
    els.precheckState.textContent = "Budget check failed";
    els.nextAction.textContent = "Revoke or wait for a new window";
    return;
  }
  if (state.policy === "revoked") {
    els.precheckState.textContent = "Permission revoked";
    els.nextAction.textContent = "No further spends allowed";
    return;
  }
  els.precheckState.textContent = "Waiting";
  els.nextAction.textContent = "Continue demo";
}

function renderPaymentRail() {
  document.querySelectorAll("[data-rail]").forEach((item) => {
    const railState = item.dataset.rail;
    const currentIndex = paymentOrder.indexOf(state.payment);
    const itemIndex = paymentOrder.indexOf(railState);
    item.classList.remove("is-active", "is-complete", "is-blocked");
    if (state.payment === "blocked" && railState === "blocked") {
      item.classList.add("is-blocked");
    } else if (railState === state.payment) {
      item.classList.add("is-active");
    } else if (currentIndex > itemIndex && itemIndex >= 0) {
      item.classList.add("is-complete");
    }
  });
}

function renderRelayer() {
  const info = state.relayerInfo;
  els.quoteText.textContent = info.quoteId ? info.quoteId : "Waiting for agent payment.";
  els.feeText.textContent = info.fee || "No quote yet.";
  els.taskText.textContent = info.taskId || "No task id yet.";
  els.txText.textContent = info.txHash ? shortHash(info.txHash) : "No relay transaction yet.";

  document.querySelectorAll("[data-relayer]").forEach((item) => {
    const relayState = item.dataset.relayer;
    const currentIndex = relayerOrder.indexOf(state.relayer);
    const itemIndex = relayerOrder.indexOf(relayState);
    item.classList.remove("is-active", "is-complete");
    if (relayState === state.relayer) {
      item.classList.add("is-active");
    } else if (currentIndex > itemIndex && itemIndex >= 0) {
      item.classList.add("is-complete");
    }
    if (state.relayer === "confirmed" && itemIndex >= 0) {
      item.classList.add("is-complete");
    }
  });
}

function renderResult() {
  if (!state.veniceResult) {
    els.veniceResult.innerHTML = '<p class="empty-text">Run the agent after permission approval to show the paid AI output.</p>';
    return;
  }

  const findings = state.veniceResult.findings
    .map((finding) => `<li>${finding}</li>`)
    .join("");

  els.veniceResult.innerHTML = `
    <h3>${state.veniceResult.title}</h3>
    <p>${state.veniceResult.summary}</p>
    <ul>${findings}</ul>
  `;
}

function renderLedger() {
  if (state.ledgerEntries.length === 0) {
    els.ledgerRows.innerHTML = '<div class="ledger-row"><span>No ledger entries yet</span><span>Waiting</span><span>0.00 USDC</span><span><span class="ledger-status">empty</span></span></div>';
    return;
  }

  els.ledgerRows.innerHTML = state.ledgerEntries
    .map((entry) => `
      <div class="ledger-row">
        <span>${entry.time}</span>
        <span>${entry.service}</span>
        <span>${entry.cost}</span>
        <span><span class="ledger-status ${entry.status}">${entry.status}</span></span>
      </div>
    `)
    .join("");
}

function renderSafety() {
  els.blockState.textContent = state.block.attempted ? "Blocked" : "Not attempted";
  els.blockReason.textContent = state.block.reason;
  els.revokeState.textContent = label(state.revocation);
  els.revokeReason.textContent = state.revocation === "revoked"
    ? "The smart account permission is closed for this agent."
    : "Active permission can be revoked by the user.";
}

function renderButtons() {
  els.connectBtn.disabled = state.wallet === "connected";
  els.approveBtn.disabled = !(state.wallet === "connected" && state.permission === "requested");
  els.runBtn.disabled = !(state.policy === "active" && state.permission === "approved");
  els.overBudgetBtn.disabled = !(state.policy === "active" && state.payment === "paid");
  els.revokeBtn.disabled = !(state.wallet === "connected" && state.revocation !== "revoked");
}

function renderStateJson() {
  const exposedState = {
    stateEnums: STATE_ENUMS,
    current: {
      wallet: state.wallet,
      policy: state.policy,
      permission: state.permission,
      agentAction: state.agentAction,
      payment: state.payment,
      relayer: state.relayer,
      ledger: state.ledger,
      revocation: state.revocation
    },
    wallet: state.wallet,
    policy: state.policy,
    permission: state.permission,
    agentAction: state.agentAction,
    payment: state.payment,
    relayer: state.relayer,
    ledger: state.ledger,
    revocation: state.revocation,
    policyConfig: state.policyConfig,
    relayerInfo: state.relayerInfo,
    ledgerEntries: state.ledgerEntries
  };
  els.stateJson.textContent = JSON.stringify(exposedState, null, 2);
}

els.connectBtn.addEventListener("click", connectWallet);
els.approveBtn.addEventListener("click", approvePermission);
els.runBtn.addEventListener("click", runAgent);
els.overBudgetBtn.addEventListener("click", blockOverspend);
els.revokeBtn.addEventListener("click", revokePermission);
els.resetBtn.addEventListener("click", resetDemo);

render("Connect MetaMask to begin the bounded agent budget flow.");
