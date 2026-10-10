#!/usr/bin/env node
/**
 * OMC AI Tools · P1 · scheduler
 *
 * The only process holding the key that can actually move a job through the
 * market's state machine. assign(), confirmDelivery(), settle(), fail() and
 * resolveDispute() are all `onlyScheduler` on OMCComputeMarket; a browser can
 * never call them, which is exactly why a server process has to exist.
 *
 * Job lifecycle it drives:
 *
 *   ESCROWED(1) --assign--> ASSIGNED(2) --(node computes)-->
 *   DELIVERED(3) --settle--> SETTLED(4)
 *
 * and the unhappy paths it can take on the requester's behalf:
 *
 *   \\- deadline passed with no delivery -------- fail(TIMEOUT)  -> REFUNDED
 *   \\- delivered but the hash does not verify --- fail(BAD_OUTPUT) -> slash
 *
 * It chooses a provider by asking the chain who is eligible, never from a
 * hardcoded address: isEligible() is the contract's own answer to "can this
 * node take a tier-1 job right now", and it already folds in stake, tier and
 * overdue status.
 *
 * Eligibility is necessary but not sufficient. A node stays eligible while its
 * heartbeat is fresh even if its operator stopped the process, so the picker
 * additionally requires a live worker — see liveness.js and provider-select.js.
 * With no live worker the job is left ESCROWED (cancellable) rather than
 * handed to a node that will only time out. --assign-anyway overrides that for
 * demos.
 *
 * Usage:
 *   node p1-service/scheduler.js --once        # one pass over all jobs
 *   node p1-service/scheduler.js               # loop
 *   node p1-service/scheduler.js --status      # read-only report, no writes
 *   node p1-service/scheduler.js --assign-anyway   # ignore liveness (demo only)
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const C = require("./chain.js");
const store = require("./store.js");
const liveness = require("./liveness.js");
const P = require("./provider-select.js");

const SWEEP_MS = 15 * 1000;
const STALE_DELIVERY_S = 15 * 60;   // how long we wait for a result file before giving up

const args = process.argv.slice(2);
const ONCE = args.includes("--once");
const STATUS = args.includes("--status");
const ASSIGN_ANYWAY = args.includes("--assign-anyway");

function log(...a) {
  const t = new Date().toISOString().slice(11, 19);
  console.log("[" + t + "] [sched]", ...a);
}

/* -------------------------------------------------------------- actions --- */

async function actAssign(ctx, job, provider) {
  const { mkt, signer } = ctx;
  log("job #" + job.id + " ESCROWED — assigning to " + provider +
      " (escrow " + ethers.formatEther(job.maxPrice) + ")");
  const tx = await mkt.connect(signer).assign(job.id, provider);
  log("  assign tx " + tx.hash);
  const rc = await tx.wait();
  log("  mined in block " + rc.blockNumber + " (gas " + rc.gasUsed.toString() + ")");
  return rc;
}

/**
 * Check that the provider's artefact exists and matches what it claims.
 *
 *   1. the meta the node wrote must name a digest
 *   2. the artefact bytes on disk must hash to that digest
 *
 * The distinction between "not delivered yet" and "delivered a lie" carries
 * real money, so it is made explicitly rather than inferred:
 *
 *   no artefact yet                 -> waiting (a slow upload is not fraud)
 *   artefact present, hash agrees   -> ok
 *   artefact present, hash differs  -> lie, fail(BAD_OUTPUT) slashes the stake
 *
 * Returns { status: "ok" | "waiting" | "failed", meta, ver }.
 */
async function checkArtefact(ctx, job) {
  const { mkt, signer } = ctx;
  const meta = store.readResultMeta(job.id);
  const hasArtefact = fs.existsSync(store.resultPath(job.id));

  if (!meta || !meta.resultHash || !hasArtefact) {
    const now = (await mkt.runner.provider.getBlock("latest")).timestamp;
    if (now > job.deadline) {
      log("job #" + job.id + " past deadline with no delivery — fail(TIMEOUT)");
      const tx = await mkt.connect(signer).fail(job.id, C.FAIL_REASON.TIMEOUT);
      log("  fail tx " + tx.hash);
      await tx.wait();
      return { status: "failed" };
    }
    log("job #" + job.id + " no artefact yet — " +
        (meta && meta.resultHash ? "hash claimed but no bytes on disk" : "waiting on the node") +
        " (" + Math.round((job.deadline - now) / 60) + " min to deadline)");
    return { status: "waiting" };
  }

  const ver = store.verifyResult(job.id);
  if (!ver.ok) {
    log("job #" + job.id + " artefact does not match its committed hash — fail(BAD_OUTPUT)");
    log("  expected " + ver.expected + "  actual " + ver.actual);
    const tx = await mkt.connect(signer).fail(job.id, C.FAIL_REASON.BAD_OUTPUT);
    log("  fail(BAD_OUTPUT) tx " + tx.hash);
    await tx.wait();
    return { status: "failed" };
  }
  return { status: "ok", meta, ver };
}

/**
 * Commit the delivered digest on chain. Separate from settling because the two
 * are separate states: a job that reaches DELIVERED but not SETTLED must still
 * be finishable on a later sweep, otherwise one failed settle strands the
 * escrow forever.
 */
async function actConfirmDelivery(ctx, job) {
  const { mkt, signer } = ctx;
  const chk = await checkArtefact(ctx, job);
  if (chk.status !== "ok") return chk;

  log("job #" + job.id + " delivered, artefact verifies (" + chk.ver.bytes + " bytes) — confirming");
  const tx = await mkt.connect(signer).confirmDelivery(job.id, chk.meta.resultHash);
  log("  confirmDelivery tx " + tx.hash);
  await tx.wait();
  return { status: "delivered", meta: chk.meta };
}

/**
 * Release escrow for a job already in DELIVERED.
 *
 * The digest to settle against is the one *on chain*, not the local meta file:
 * the chain copy is what the requester will check their download against, so a
 * local meta that disagrees with it is an operator problem, not a provider
 * fault. In that case we refuse and say so rather than slashing anyone.
 *
 * The amount is maxPrice, not paid. `paid` is only written by settle() itself,
 * so reading it here yields 0 and the contract reverts on require(amount > 0) —
 * a bug the rehearsal harness never hit because it passes the price explicitly.
 */
async function actSettle(ctx, job) {
  const { mkt, signer } = ctx;
  const chk = await checkArtefact(ctx, job);
  if (chk.status !== "ok") return chk.status;

  if (job.resultHash && job.resultHash.toLowerCase() !== chk.ver.actual.toLowerCase()) {
    log("job #" + job.id + " chain commitment disagrees with the local artefact — REFUSING to settle");
    log("  on chain " + job.resultHash);
    log("  on disk  " + chk.ver.actual);
    log("  this is an operator/local-store problem, not a provider fault — not slashing");
    return "blocked";
  }

  const amount = job.maxPrice;
  log("  settling #" + job.id + " for " + ethers.formatEther(amount));
  const tx = await mkt.connect(signer).settle(job.id, amount);
  log("  settle tx " + tx.hash);
  await tx.wait();
  return "settled";
}

/* --------------------------------------------------------------- sweep ---- */

async function sweep(ctx) {
  const { mkt, sk } = ctx;
  const total = Number(await mkt.jobCount());
  if (total === 0) { log("jobCount = 0, nothing to schedule"); return; }

  for (let id = 1; id <= total; id++) {
    const job = await C.readJob(mkt, id);
    const label = "#" + id + " " + C.jobState(job.state);

    if (job.state === 1) {                       // ESCROWED
      const pick = await P.pickProvider(mkt, sk, job.hardwareTier, { allowOffline: ASSIGN_ANYWAY });
      if (!pick.addr) {
        log("job " + label + " — NOT assigning: " + pick.reason);
        for (const r of pick.rows) {
          log("    node " + r.addr + " tier=" + r.tier + " eligible=" + r.eligible +
              " live=" + r.live + " overdue=" + r.overdue);
        }
        log("    start a worker (node-worker.js) to make one of them live");
        continue;
      }
      if (pick.warned) log("WARNING: " + pick.reason);
      if (STATUS) { log("job " + label + " would assign to " + pick.addr + " (" + pick.reason + ")"); continue; }
      await actAssign(ctx, job, pick.addr);
    } else if (job.state === 2) {                // ASSIGNED — commit the delivery
      if (STATUS) { log("job " + label + " provider=" + job.provider); continue; }
      const r = await actConfirmDelivery(ctx, job);
      log("job " + label + " -> " + r.status);
      // A confirmed job is DELIVERED, and DELIVERED is a state this loop must
      // be able to finish on its own sweep — hence the fall-through below.
      if (r.status === "delivered") {
        const s = await actSettle(ctx, { ...job, state: 3, resultHash: r.meta.resultHash });
        log("job #" + id + " DELIVERED -> " + s);
      }
    } else if (job.state === 3) {                // DELIVERED — release escrow
      // Reached either by the branch above on a later sweep, or by a settle
      // that failed after the delivery was already committed on chain.
      if (STATUS) { log("job " + label + " provider=" + job.provider + " (settle pending)"); continue; }
      const s = await actSettle(ctx, job);
      log("job " + label + " -> " + s);
    } else {
      // terminal states (>= 4) and DISPUTED need no scheduler action
    }
  }
}

/* ------------------------------------------------------------ watch tick -- */

/**
 * Availability monitor. The scheduler is not the node and cannot heartbeat for
 * it, but it *should* shout when a provider goes dark, because that is the
 * failure that silently makes every future job unassignable.
 *
 * Two different kinds of dark are reported side by side, because they need
 * different fixes:
 *   overdue   — the node's own heartbeat lapsed; its operator must send one
 *   not live  — nobody is running a worker for that address right now
 */
async function reportAvailability(mkt, sk) {
  const snap = liveness.snapshot();
  const n = Number(await sk.nodeCount());
  if (n === 0) { log("WARNING: no registered nodes at all"); return; }
  log("liveness registry: " + snap.live.length + " live, " + snap.stale.length + " stale" +
      (snap.allowlist.length ? ", " + snap.allowlist.length + " from OMC_LIVE_NODES" : "") +
      "  (ttl " + Math.round(snap.ttlMs / 1000) + "s)");
  for (let i = 0; i < n; i++) {
    const addr = await sk.nodeAddresses(i);
    let s;
    try { s = await sk.nodeSummary(addr); }
    catch (e) { s = { tier: (await sk.node(addr)).tier, stake: (await sk.node(addr)).stake, overdue: await sk.isOverdue(addr) }; }
    const el = await mkt.isEligible(addr, Number(s.tier));
    const live = liveness.isLive(addr);
    log("node " + addr + " tier=" + s.tier + " stake=" + ethers.formatEther(s.stake) +
        " overdue=" + s.overdue + " eligible=" + el + " live=" + live +
        (s.overdue ? "  <-- HEARTBEAT OVERDUE, page is dark" : "") +
        (!live ? "  <-- no worker running" : ""));
  }
  if (!snap.live.length && !ASSIGN_ANYWAY) {
    log("WARNING: no live worker — new jobs will stay ESCROWED until one announces");
  }
}

/* ----------------------------------------------------------------- main --- */

async function main() {
  const provider = await C.provider();
  const d = C.deployments();
  const mkt = await C.market(provider);
  const sk = await C.staking(provider);
  const signer = await C.schedulerWallet();

  log("market    " + d.market);
  log("staking   " + d.staking);
  log("scheduler " + signer.address +
      "  (tBNB " + ethers.formatEther(await provider.getBalance(signer.address)) + ")");

  const onchain = await mkt.scheduler();
  if (onchain.toLowerCase() !== signer.address.toLowerCase()) {
    log("FATAL: our key is " + signer.address + " but the market's scheduler is " + onchain);
    process.exit(1);
  }

  const ctx = { mkt, sk, signer };

  if (STATUS) {
    await reportAvailability(mkt, sk);
    await sweep(ctx);
    return;
  }

  if (ONCE) {
    await reportAvailability(mkt, sk);
    await sweep(ctx);
    return;
  }

  log("sweeping every " + (SWEEP_MS / 1000) + "s — Ctrl-C to stop");
  let tick = 0;
  for (;;) {
    try {
      if (tick % 8 === 0) await reportAvailability(mkt, sk);
      await sweep(ctx);
    } catch (e) {
      log("sweep error: " + (e.shortMessage || e.message));
    }
    tick++;
    await new Promise((r) => setTimeout(r, SWEEP_MS));
  }
}

main().catch((e) => { console.error("[sched] fatal:", e); process.exit(1); });
