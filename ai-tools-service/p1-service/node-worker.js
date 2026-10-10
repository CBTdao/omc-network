#!/usr/bin/env node
/**
 * OMC AI Tools · P1 · provider node
 *
 * The staked GPU side. It does two jobs and nothing else:
 *
 *   1. stay eligible  — ping staking.heartbeat() inside the 30m + 10m window,
 *      otherwise isOverdue() flips true and no job can be assigned to us.
 *   2. serve work      — watch the market for jobs assigned to our address,
 *      run the real upscaler over the image bytes, and report the result hash
 *      back to the scheduler.
 *
 * What it deliberately does NOT do
 *   It never calls assign / settle / fail / resolveDispute. Those are
 *   scheduler-only on the market. The node's whole influence on the chain is
 *   the heartbeat and, indirectly, the resultHash it hands the scheduler.
 *
 * The image bytes never touch the chain. The node reads them from the
 * out-of-band store (see store.js) and the chain only ever sees keccak256
 * digests. That split is the point: an EVM cannot hold a megabyte of pixels,
 * so the hash binding is what makes the off-chain path checkable.
 *
 * Usage:
 *   node p1-service/node-worker.js --once          # one sweep, then exit
 *   node p1-service/node-worker.js                 # loop
 *   node p1-service/node-worker.js --no-infer      # chain plumbing only
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { ethers } = require("ethers");

const C = require("./chain.js");
const store = require("./store.js");

const HERE = __dirname;
const AI_TOOLS = path.resolve(HERE, "..");
const PY = path.join(AI_TOOLS, ".venv", "Scripts", "python.exe");
const UPSCALE_PY = path.join(AI_TOOLS, "p0-worker", "upscale.py");

const HEARTBEAT_SAFETY_S = 20 * 60;   // ping every 20 min against a 30m+10m window
const SWEEP_MS = 20 * 1000;

const args = process.argv.slice(2);
const ONCE = args.includes("--once");
const NO_INFER = args.includes("--no-infer");

function log(...a) {
  const t = new Date().toISOString().slice(11, 19);
  console.log("[" + t + "] [node]", ...a);
}

/* ---------------------------------------------------------------- key ---- */

/**
 * The node address is the owner wallet (0xc35711aa…), a different key from the
 * scheduler. Its private key is NOT in the shared secrets file today, so the
 * heartbeat path is opt-in: pass OMC_NODE_PRIVATE_KEY in the environment, or
 * point OMC_NODE_KEY_FILE at a file holding it. Without a key we still serve
 * assigned jobs; we just cannot self-heal the heartbeat.
 */
function nodeKey() {
  if (process.env.OMC_NODE_PRIVATE_KEY) return process.env.OMC_NODE_PRIVATE_KEY.trim();
  const f = process.env.OMC_NODE_KEY_FILE ||
    path.join(os.homedir(), ".workbuddy", "omc-node-key.env");
  if (fs.existsSync(f)) {
    for (const line of fs.readFileSync(f, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*(?:OMC_NODE_PRIVATE_KEY|PRIVATE_KEY)\s*=\s*(.+?)\s*$/);
      if (m) return m[1].replace(/^["']|["']$/g, "");
    }
  }
  return "";
}

/* ---------------------------------------------------------- heartbeats ---- */

async function tickHeartbeat(sk, signer) {
  const me = signer.address;
  const nd = await sk.node(me);
  if (!nd.registered) {
    log("wallet " + me + " is not a registered node — heartbeat skipped");
    return;
  }
  const now = (await sk.runner.provider.getBlock("latest")).timestamp;
  const deadline = Number(await sk.heartbeatDeadline(me));
  const left = deadline - now;
  const overdue = await sk.isOverdue(me);

  if (left > HEARTBEAT_SAFETY_S) {
    log("heartbeat ok, " + Math.round(left / 60) + " min left");
    return;
  }
  log("heartbeat due (" + (overdue ? "OVERDUE by " + Math.round(-left / 60) + " min"
    : Math.round(left / 60) + " min left") + ") — sending");
  const tx = await sk.connect(signer).heartbeat();
  log("heartbeat tx " + tx.hash);
  const rc = await tx.wait();
  log("heartbeat mined in block " + rc.blockNumber + " (gas " + rc.gasUsed.toString() + ")");
}

/* ----------------------------------------------------------- inference ---- */

/**
 * Run the real upscaler on a local file. Returns { ok, resultHash, outPath,
 * ms, w, h, error }.
 *
 * The result hash is keccak256 over the produced PNG bytes. That is the value
 * the scheduler writes into confirmDelivery(), and the value the requester
 * compares their download against. If the bytes are swapped anywhere in
 * between, the hashes stop matching.
 */
function runInference(inPath, outPath) {
  if (!fs.existsSync(PY)) {
    return { ok: false, error: "venv python missing at " + PY + " (skipped model run)" };
  }
  if (!fs.existsSync(UPSCALE_PY)) {
    return { ok: false, error: "upscale.py missing at " + UPSCALE_PY };
  }
  const t0 = Date.now();
  const r = spawnSync(PY, [UPSCALE_PY, inPath, outPath, "--tile", "256", "--pad", "16"], {
    cwd: AI_TOOLS,
    encoding: "utf8",
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
  });
  const ms = Date.now() - t0;
  if (r.status !== 0 || !fs.existsSync(outPath)) {
    const tail = ((r.stderr || "") + (r.stdout || "")).trim().split("\n").slice(-4).join(" | ");
    return { ok: false, error: "upscale exited " + r.status + ": " + tail, ms };
  }
  const bytes = fs.readFileSync(outPath);
  return {
    ok: true,
    resultHash: ethers.keccak256(bytes),
    bytes: bytes.length,
    ms,
  };
}

/* ---------------------------------------------------------------- sweep --- */

async function sweep(ctx) {
  const { mkt, sk, signer } = ctx;
  const provider = mkt.runner.provider;

  // Who can we be? If we hold the node key we are that address; otherwise we
  // still answer for the registered node found on chain.
  let me = signer ? signer.address : null;
  if (!me) {
    const n = Number(await sk.nodeCount());
    if (n > 0) me = await sk.nodeAddresses(0);
  }
  if (!me) { log("no node address available"); return; }

  if (signer) {
    try { await tickHeartbeat(sk, signer); }
    catch (e) { log("heartbeat failed: " + e.message); }
  }

  const eligible = await mkt.isEligible(me, 1);
  log("node " + me + " eligible(T1) = " + eligible);

  const total = Number(await mkt.jobCount());
  let served = 0;

  for (let id = 1; id <= total; id++) {
    const job = await C.readJob(mkt, id);
    const mine = job.provider.toLowerCase() === me.toLowerCase();
    if (!mine) continue;
    if (job.state !== 2) continue;          // 2 = ASSIGNED, waiting on us
    log("job #" + id + " assigned to us — spec=" + job.specHash.slice(0, 12) + "…");

    const outPath = store.resultPath(id);
    let inf;
    if (NO_INFER) {
      inf = { ok: true, resultHash: ethers.keccak256(ethers.toUtf8Bytes("omc-stub-result:" + id)),
              bytes: 0, ms: 0, stub: true };
      log("  --no-infer: emitting a stub result hash (chain plumbing test only)");
    } else {
      const inPath = store.specPath(id);
      if (!fs.existsSync(inPath)) {
        log("  no input image at " + inPath + " — cannot serve this job yet");
        continue;
      }
      log("  running Real-ESRGAN on " + path.basename(inPath) + " …");
      inf = runInference(inPath, outPath);
    }

    if (!inf.ok) { log("  inference failed: " + inf.error); continue; }

    log("  result hash = " + inf.resultHash + "  (" + (inf.ms / 1000).toFixed(1) + "s)");
    store.writeResultMeta(id, {
      jobId: id,
      requester: job.requester,
      specHash: job.specHash,
      resultHash: inf.resultHash,
      bytes: inf.bytes,
      inferMs: inf.ms,
      stub: !!inf.stub,
      at: new Date().toISOString(),
    });
    log("  result parked at " + outPath + " — scheduler will confirmDelivery(#" + id + ")");
    served++;
  }

  if (served === 0) log("nothing assigned to us right now");
}

/* ----------------------------------------------------------------- main --- */

async function main() {
  const provider = await C.provider();
  const d = C.deployments();
  const mkt = await C.market(provider);
  const sk = await C.staking(provider);

  const pk = nodeKey();
  let signer = null;
  if (pk) {
    signer = new ethers.Wallet(pk, provider);
    log("node key loaded, address " + signer.address);
  } else {
    log("no node key — heartbeat disabled (set OMC_NODE_PRIVATE_KEY to enable)");
  }

  const ctx = { mkt, sk, signer };
  log("market " + d.market);
  log("nodeCount = " + (await sk.nodeCount()).toString() +
      " | jobCount = " + (await mkt.jobCount()).toString());

  if (ONCE) { await sweep(ctx); return; }

  log("sweeping every " + (SWEEP_MS / 1000) + "s — Ctrl-C to stop");
  for (;;) {
    try { await sweep(ctx); }
    catch (e) { log("sweep error: " + (e.stack || e.message)); }
    await new Promise((r) => setTimeout(r, SWEEP_MS));
  }
}

main().catch((e) => { console.error("[node] fatal:", e); process.exit(1); });
