#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import net from "node:net";

const root = join(fileURLToPath(new URL("..", import.meta.url)));
const nodeBin = process.execPath;
const targetNetwork = process.env.X402_NETWORK || "eip155:84532";
const tokenAddress =
  process.env.USDC_ADDRESS || "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const facilitatorRedeemer =
  process.env.P7_FACILITATOR_REDEEMER ||
  "0xf1ef956eff4181ce913b664713515996858b9ca9";

const childProcesses = new Set();
let facilitatorServer = null;
let tempDir = null;

function log(message) {
  console.log(`\n[p7] ${message}`);
}

function commandLabel(command, args) {
  return [command, ...args].join(" ");
}

async function run(command, args, options = {}) {
  log(commandLabel(command, args));

  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: {
        ...process.env,
        ...(options.env ?? {})
      },
      stdio: "inherit"
    });

    childProcesses.add(child);
    child.exitPromise = new Promise((resolve) => {
      child.once("exit", resolve);
    });
    child.on("exit", (code, signal) => {
      childProcesses.delete(child);
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${commandLabel(command, args)} failed with ${
            signal ? `signal ${signal}` : `exit code ${code}`
          }`
        )
      );
    });
  });
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close(() => {
        if (port) resolve(port);
        else reject(new Error("Unable to allocate a free port."));
      });
    });
  });
}

async function listen(server, port) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
}

async function closeServer(server) {
  if (!server) return;
  await new Promise((resolve) => server.close(resolve));
}

function startFacilitatorStub(port) {
  const supported = {
    kinds: [
      {
        x402Version: 2,
        scheme: "exact",
        network: targetNetwork,
        extra: {
          assetTransferMethod: "erc7710",
          facilitatorAddresses: [facilitatorRedeemer]
        }
      }
    ],
    extensions: [],
    signers: {
      evm: [facilitatorRedeemer]
    }
  };

  const server = createServer((request, response) => {
    if (request.method === "GET" && request.url?.startsWith("/supported")) {
      response.writeHead(200, {
        "Content-Type": "application/json"
      });
      response.end(JSON.stringify(supported));
      return;
    }

    response.writeHead(501, {
      "Content-Type": "application/json"
    });
    response.end(
      JSON.stringify({
        ok: false,
        error: "P7 facilitator stub only serves GET /supported."
      })
    );
  });

  return server;
}

function startNextStart(port, env) {
  log(`starting isolated next start server on http://127.0.0.1:${port}`);
  const child = spawn(
    nodeBin,
    [
      "./node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port)
    ],
    {
      cwd: root,
      env,
      stdio: "inherit"
    }
  );

  childProcesses.add(child);
  child.exitPromise = new Promise((resolve) => {
    child.on("exit", () => {
      childProcesses.delete(child);
      resolve();
    });
  });
  return child;
}

async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([child.exitPromise, delay(5_000)]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await child.exitPromise;
  }
}

async function waitForHttp(url, timeoutMs = 45_000) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "text/html,application/json"
        }
      });
      if (response.ok) return response;
      lastError = new Error(`${url} returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(500);
  }

  throw new Error(
    `Timed out waiting for ${url}: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}

async function pageSmoke(baseUrl) {
  log(`HTTP page smoke ${baseUrl}/`);
  const response = await fetch(`${baseUrl}/`, {
    headers: {
      Accept: "text/html"
    }
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Page smoke returned HTTP ${response.status}.`);
  }
  if (!text.includes("Agent SpendGuard")) {
    throw new Error("Page smoke did not find Agent SpendGuard in SSR HTML.");
  }
}

async function cleanup() {
  for (const child of [...childProcesses]) {
    await stopChild(child);
  }
  await closeServer(facilitatorServer);
  if (tempDir) {
    await rm(tempDir, {
      force: true,
      recursive: true
    });
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    await cleanup();
    process.exit(1);
  });
}

try {
  tempDir = await mkdtemp(join(tmpdir(), "spendguard-p7-"));

  await run(nodeBin, ["./node_modules/typescript/bin/tsc", "--noEmit"]);
  await run(nodeBin, ["./node_modules/next/dist/bin/next", "build"]);
  await run(nodeBin, ["scripts/p3-caveat-assertion-smoke.mjs"]);
  await run("git", ["diff", "--check"]);

  const facilitatorPort = await freePort();
  facilitatorServer = startFacilitatorStub(facilitatorPort);
  await listen(facilitatorServer, facilitatorPort);

  const appPort = await freePort();
  const baseUrl = `http://127.0.0.1:${appPort}`;
  const isolatedEnv = {
    ...process.env,
    AI_MODE: "mock",
    AI_PROVIDER: "deepseek",
    DEEPSEEK_MODE: "mock",
    ERC7710_PAID_POC_ENABLED: "true",
    HTTPS_PROXY: "",
    HTTP_PROXY: "",
    NEXT_PUBLIC_APP_URL: baseUrl,
    ONESHOT_MODE: "mock",
    ONESHOT_REAL_CALLS_ENABLED: "false",
    SPENDGUARD_DATA_DIR: join(tempDir, "data"),
    SPENDGUARD_MODE: "mock",
    SPENDGUARD_PRICE_PER_CALL_ATOMIC: "10000",
    USDC_ADDRESS: tokenAddress,
    X402_FACILITATOR_URL: `http://127.0.0.1:${facilitatorPort}`,
    X402_NETWORK: targetNetwork,
    X402_PAY_TO:
      process.env.X402_PAY_TO ||
      "0xa17e3c7b91c0c1e9d2a6e3c07dcb8f1cb72591c0",
    X402_PROXY_URL: "",
    http_proxy: "",
    https_proxy: ""
  };
  const nextStart = startNextStart(appPort, isolatedEnv);

  try {
    await waitForHttp(`${baseUrl}/`);
    await pageSmoke(baseUrl);
    await run(nodeBin, ["scripts/step7-failure-smoke.mjs", baseUrl], {
      env: isolatedEnv
    });
  } finally {
    await stopChild(nextStart);
  }

  log("P7 verification passed");
} finally {
  await cleanup();
}
