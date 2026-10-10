#!/usr/bin/env node
/**
 * OMC AI Tools · P1 · end-to-end rehearsal
 *
 * Walks one job through the entire market, on BNB Smart Chain Testnet, for
 * real. No mocks: every state change below is an on-chain transaction, and the
 * script refuses to continue if any step's precondition is not actually true.
 *
 * Steps and who pays for them:
 *
 *   0. requester needs tOMC + tBNB          (minted by the deployer, which
 *                                            still holds the token supply)
 *   1. approve + createJob                  (requester signs; escrow moves)
 *   2. assign(jobId, provider)              (scheduler = deployer key)
 *   3. node runs Real-ESRGAN, hashes output (local compute, off-chain bytes)
 *   4. confirmDelivery + settle             (scheduler key)
 *
 * Every step prints the transaction hash and the resulting chain state, so the
 * output is itself the evidence.
 *
 * The script is idempotent-ish and safe to re-run: it mints only if the
 * requester is short, and it starts a fresh job each run so you can watch
 * jobCount climb.
 *
 * Usage:
 *   node p1-service/e2e-rehearsal.js --image testdata/sample.png --price 5
 *   node p1-service/e2e-rehearsal.js --no-infer     # stub result hash, chain only
 *   node p1-service/e2e-rehearsal.js --status       # describe, change nothing
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { ethers } = require("ethers");

const C = require("./chain.js");
const store = require("./store.js");
const P = require("./provider-select.js");

const AI_TOOLS = path.resolve(__dirname, "..");
const PY = path.join(AI_TOOLS, ".venv", "Scripts", "python.exe");
const UPSCALE_PY = path.join(AI_TOOLS, "p0-worker", "upscale.py");

/* --------------------------------------------------------------- args ---- */

function argOf(name, dflt) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return dflt;
}
const IMAGE = argOf("--image", path.join(AI_TOOLS, "testdata", "sample.png"));
const PRICE_OMC = argOf("--price", "5");                 // whole OMC, human units
const TIER = Number(argOf("--tier", "1"));
/* Pin the provider when several nodes are eligible. Without this the run takes
   the first eligible node in registration order, which may not be the node
   whose worker is actually running on this machine. */
const PROVIDER_ARG = argOf("--provider", "");
const NO_INFER = process.argv.includes("--no-infer");
const STATUS_ONLY = process.argv.includes("--status");

const DEADLINE_MIN = 60;

function log(...a) { console.log("  " + a.join(" ")); }
function step(n, title) {
  console.log("\n" + "=".repeat(72));
  console.log("STEP " + n + "  " + title);
  console.log("=".repeat(72));
}
function txline(name, tx) { console.log("  " + name + " tx: " + tx.hash); }

/* --------------------------------------------------------------- main ---- */

async function main() {
  const provider = await C.provider();
  const d = C.deployments();
  const mkt = await C.market(provider);
  const sk = await C.staking(provider);
  const tok = await C.token(provider);

  const scheduler = await C.schedulerWallet();       // deployer key
  const requester = await C.schedulerWallet();       // reuse it: one funded key

  console.log("OMC AI Tools · end-to-end rehearsal");
  console.log("  market     " + d.market);
  console.log("  staking    " + d.staking);
  console.log("  scheduler  " + scheduler.address);
  console.log("  requester  " + requester.address);

  /* ---- 0. preconditions ------------------------------------------------ */

  step(0, "preconditions — funding and provider availability");

  const regBal = await provider.getBalance(requester.address);
  log("requester tBNB  = " + ethers.formatEther(regBal));
  const regO = await tok.balanceOf(requester.address);
  const price = ethers.parseEther(PRICE_OMC);
  log("requester tOMC  = " + ethers.formatEther(regO) + "  (need " + PRICE_OMC + ")");

  if (regO < price) {
    if (STATUS_ONLY) { log("SHORT of tOMC — re-run without --status to mint"); return; }
    const need = price * 2n - regO;
    log("minting " + ethers.formatEther(need) + " tOMC to requester");
    const tx = await tok.connect(scheduler).mint(requester.address, need);
    txline("mint", tx); await tx.wait();
    log("requester tOMC now = " + ethers.formatEther(await tok.balanceOf(requester.address)));
  }

  /* Pick the provider with the same code the scheduler uses, so the two can
     never drift apart. That picker prefers a node with a live worker; this
     harness starts its worker as a one-shot process later in the run, so it
     passes allowOffline and reports when it had to fall back. */
  const candidates = await P.survey(mkt, sk, TIER);
  let providerAddr = null;

  log("nodes on chain  = " + candidates.length);
  for (const c of candidates) {
    log("  [" + c.index + "] " + c.addr + "  tier=" + c.tier +
        "  overdue=" + c.overdue + "  eligible(T" + TIER + ")=" + c.eligible +
        "  live=" + c.live);
  }

  if (PROVIDER_ARG) {
    const want = PROVIDER_ARG.toLowerCase();
    const hit = candidates.find((c) => c.addr.toLowerCase() === want);
    if (!hit) { console.log("\nFATAL: --provider " + PROVIDER_ARG + " is not a registered node."); process.exit(3); }
    if (!hit.eligible) { console.log("\nFATAL: --provider " + PROVIDER_ARG + " is not eligible for tier " + TIER + "."); process.exit(3); }
    providerAddr = hit.addr;
    log("provider        = " + providerAddr + "  (pinned by --provider)");
  } else {
    const pick = await P.pickProvider(mkt, sk, TIER, { allowOffline: true });
    if (pick.addr) {
      providerAddr = pick.addr;
      log("provider        = " + providerAddr + "  (" + pick.reason + ")");
      if (!pick.picked.live) {
        log("  note: no worker has announced liveness yet — this run starts one below,");
        log("        which is why the rehearsal is allowed to assign offline.");
      }
    }
  }

  if (!providerAddr) {
    console.log("\nFATAL: no eligible provider for tier " + TIER + ".");
    console.log("  Every registered node is overdue or below its tier minimum.");
    console.log("  A node heals itself with staking.heartbeat() from its OWN key:");
    console.log("    node p1-service/node-worker.js --once --no-infer");
    process.exit(3);
  }

  if (STATUS_ONLY) { console.log("\n--status: everything looks ready."); return; }

  /* ---- 1. approve + createJob ----------------------------------------- */

  step(1, "requester escrows a job (approve + createJob)");

  const allow = await tok.allowance(requester.address, d.market);
  if (allow < price) {
    log("approving " + PRICE_OMC + " tOMC to the market");
    const tx = await tok.connect(requester).approve(d.market, ethers.MaxUint256);
    txline("approve", tx); await tx.wait();
  } else {
    log("allowance already " + ethers.formatEther(allow));
  }

  const specHash = computeSpecHashFromDisk();
  log("image          = " + IMAGE);
  log("imageHash      = " + store.hashBytes(fs.readFileSync(IMAGE)));
  log("specHash       = " + specHash);

  const block = await provider.getBlock("latest");
  const deadline = block.timestamp + DEADLINE_MIN * 60;

  const cj = await mkt.connect(requester).createJob(
    specHash, TIER, C.VERIFY_POLICY.SPOT_CHECK, C.PROTECTION.STANDARD,
    price, deadline, true                    // paidInOMC: gets the 10% fee discount
  );
  txline("createJob", cj);
  const rc = await cj.wait();
  log("mined in block " + rc.blockNumber + " (gas " + rc.gasUsed.toString() + ")");

  const jobId = Number(await mkt.jobCount());
  log("jobCount is now " + jobId + " — new job id #" + jobId);

  // Park the bytes and the commitment in the out-of-band store, keyed by id.
  store.putSpec(jobId, fs.readFileSync(IMAGE), {
    specHash, tier: TIER, price: PRICE_OMC,
    verifyPolicy: C.VERIFY_POLICY.SPOT_CHECK, protection: C.PROTECTION.STANDARD,
  });
  log("input parked at " + store.specPath(jobId));

  let job = await C.readJob(mkt, jobId);
  log("state = " + C.jobState(job.state) + "  escrow = " + ethers.formatEther(job.maxPrice));

  /* ---- 2. assign ------------------------------------------------------- */

  step(2, "scheduler assigns the job to the eligible provider");

  const asg = await mkt.connect(scheduler).assign(jobId, providerAddr);
  txline("assign", asg); await asg.wait();
  job = await C.readJob(mkt, jobId);
  log("state = " + C.jobState(job.state) + "  provider = " + job.provider);

  /* ---- 3. node computes ------------------------------------------------ */

  step(3, "node runs the model and commits to the result hash");

  const outPath = store.resultPath(jobId);
  let resultHash, bytes = 0, inferMs = 0, ortProvider = "unknown";

  if (NO_INFER) {
    resultHash = ethers.keccak256(ethers.toUtf8Bytes("omc-stub-result:" + jobId));
    log("--no-infer: stub result hash (chain plumbing only, no GPU used)");
  } else {
    if (!fs.existsSync(PY)) { console.log("\nFATAL: venv python missing at " + PY); process.exit(4); }
    log("running Real-ESRGAN (this is the real 4x, on the local GPU) …");
    const t0 = Date.now();
    const r = spawnSync(PY, [UPSCALE_PY, IMAGE, outPath, "--tile", "256", "--pad", "16"],
      { cwd: AI_TOOLS, encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
    inferMs = Date.now() - t0;
    if (r.status !== 0) {
      console.log(r.stdout); console.error(r.stderr);
      console.log("\nFATAL: upscale failed"); process.exit(4);
    }
    ortProvider = (r.stdout.match(/provider:\s*(\S+)/) || [])[1] || "unknown";
    const out = fs.readFileSync(outPath);
    bytes = out.length;
    resultHash = store.hashBytes(out);
    log("provider   = " + ortProvider);
    log("output     = " + outPath + "  (" + bytes + " bytes, " + (inferMs / 1000).toFixed(1) + "s)");
  }

  log("resultHash = " + resultHash);
  store.writeResultMeta(jobId, {
    jobId, requester: requester.address, specHash, resultHash,
    bytes, inferMs, provider: ortProvider, stub: NO_INFER, at: new Date().toISOString(),
  });

  /* ---- 4. confirm + settle -------------------------------------------- */

  step(4, "scheduler confirms delivery and settles");

  const cd = await mkt.connect(scheduler).confirmDelivery(jobId, resultHash);
  txline("confirmDelivery", cd); await cd.wait();
  job = await C.readJob(mkt, jobId);
  log("state = " + C.jobState(job.state) + "  resultHash on chain = " + job.resultHash);
  log("matches local result: " + (job.resultHash.toLowerCase() === resultHash.toLowerCase()));

  const st = await mkt.connect(scheduler).settle(jobId, price);
  txline("settle", st); await st.wait();
  job = await C.readJob(mkt, jobId);

  /* ---- 5. verify ------------------------------------------------------ */

  step(5, "verify the outcome");

  const ps = await mkt.protocolStats();
  log("job #" + jobId + " final state = " + C.jobState(job.state));
  log("paid           = " + ethers.formatEther(job.paid));
  log("feePaid        = " + ethers.formatEther(job.feePaid));
  log("provider got   = " + ethers.formatEther(job.paid - job.feePaid));
  log("resultHash     = " + job.resultHash);
  log("");
  log("market totals: jobsTotal=" + ps.jobsTotal + " settled=" + ps.jobsSettled +
      " escrowedNow=" + ps.escrowedNow + " settledVolume=" + ethers.formatEther(ps.settledVolume));
  log("provider tOMC balance = " + ethers.formatEther(await tok.balanceOf(providerAddr)));

  console.log("\n" + "=".repeat(72));
  console.log("DONE — job #" + jobId + " is " + C.jobState(job.state) +
    " on BNB Smart Chain Testnet (" + d.market + ")");
  console.log("=".repeat(72));
}

/* Hash the spec exactly the way the page does, from the file on disk. */
function computeSpecHashFromDisk() {
  const bytes = fs.readFileSync(IMAGE);
  const imageHash = store.hashBytes(bytes);
  return store.specHashFor(imageHash, TIER, C.VERIFY_POLICY.SPOT_CHECK, C.PROTECTION.STANDARD);
}

main().catch((e) => { console.error("\nFATAL:", e.shortMessage || e.message || e); process.exit(1); });
