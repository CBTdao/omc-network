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
 * Usage:
 *   node p1-service/scheduler.js --once        # one pass over all jobs
 *   node p1-service/scheduler.js               # loop
 *   node p1-service/scheduler.js --status      # read-only report, no writes
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const C = require("./chain.js");
const store = require("./store.js");

const SWEEP_MS = 15 * 1000;
const STALE_DELIVERY_S = 15 * 60;   // how long we wait for a result file before giving up

const args = process.argv.slice(2);
const ONCE = args.includes("--once");
const STATUS = args.includes("--status");

function log(...a) {
  const t = new Date().toISOString().slice(11, 19);
  console.log("[" + t + "] [sched]", ...a);
}

/* -------------------------------------------------------- provider pick --- */

/**
 * Ask the chain which registered node can serve this tier, rather than keeping
 * a list. Returns the cheapest eligible address or null. Today there is one
 * node, but nothing here assumes that.
 */
async function pickProvider(mkt, sk, tier) {
  const n = Number(await sk.nodeCount());
  const candidates = [];
  for (let i = 0; i < n; i++) {
    const addr = await sk.nodeAddresses(i);
    const eligible = await mkt.isEligible(addr, tier);
    if (eligible) {
      const nd = await sk.node(addr);
      candidates.push({ addr, stake: nd.stake, workUnits: nd.workUnits });
    }
  }
  if (!candidates.length) return null;
  // Prefer the least-loaded node (fewest completed work units) so the load
  // spreads once a second provider joins.
  candidates.sort((a, b) => (a.workUnits < b.workUnits ? -1 : a.workUnits > b.workUnits ? 1 : 0));
  return candidates[0].addr;
}

/* -------------------------------------------------------------- actions --- */

async function actAssign(ctx, job, provider) {
  const { mkt, signer } = ctx;
  log("job #" + job.id + " ESCROWED — assigning to " + provider +
      " (paid " + ethers.formatEther(job.paid) + ")");
  const tx = await mkt.connect(signer).assign(job.id, provider);
  log("  assign tx " + tx.hash);
  const rc = await tx.wait();
  log("  mined in block " + rc.blockNumber + " (gas " + rc.gasUsed.toString() + ")");
  return rc;
}

/**
 * Settle a delivered job. Two guards before we release escrow:
 *
 *   1. The result file must exist and hash to what the node claims.
 *   2. The digest we are about to commit must be the one we verified.
 *
 * If the hash does not verify, a delivery is a lie and the honest move is
 * fail(BAD_OUTPUT) — which slashes the provider — not settle().
 */
async function actDeliverAndSettle(ctx, job) {
  const { mkt, sk, signer } = ctx;
  const meta = store.readResultMeta(job.id);
  if (!meta || !meta.resultHash) {
    // ASSIGNED but the node has not produced anything yet.
    const now = (await mkt.runner.provider.getBlock("latest")).timestamp;
    if (now > job.deadline) {
      log("job #" + job.id + " past deadline with no delivery — fail(TIMEOUT)");
      const tx = await mkt.connect(signer).fail(job.id, C.FAIL_REASON.TIMEOUT);
      log("  fail tx " + tx.hash);
      await tx.wait();
      return "failed";
    }
    return "waiting";
  }

  const ver = store.verifyResult(job.id);
  if (!ver.ok) {
    log("job #" + job.id + " result hash mismatch — refusing to settle");
    log("  expected " + ver.expected + "  actual " + ver.actual);
    const tx = await mkt.connect(signer).fail(job.id, C.FAIL_REASON.BAD_OUTPUT);
    log("  fail(BAD_OUTPUT) tx " + tx.hash);
    await tx.wait();
    return "failed";
  }

  log("job #" + job.id + " delivered, result verifies (" + ver.bytes + " bytes) — confirming");
  const c1 = await mkt.connect(signer).confirmDelivery(job.id, meta.resultHash);
  log("  confirmDelivery tx " + c1.hash);
  await c1.wait();

  // Settle for what was actually escrowed, less the protocol fee the contract
  // will take itself. Paying more than `paid` would revert.
  const amount = job.paid;
  log("  settling #" + job.id + " for " + ethers.formatEther(amount));
  const c2 = await mkt.connect(signer).settle(job.id, amount);
  log("  settle tx " + c2.hash);
  await c2.wait();
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
      const provider = await pickProvider(mkt, sk, job.hardwareTier);
      if (!provider) {
        log("job " + label + " — no eligible provider for tier " + job.hardwareTier);
        continue;
      }
      if (STATUS) { log("job " + label + " would assign to " + provider); continue; }
      await actAssign(ctx, job, provider);
    } else if (job.state === 2) {                // ASSIGNED
      if (STATUS) { log("job " + label + " provider=" + job.provider); continue; }
      const r = await actDeliverAndSettle(ctx, job);
      log("job " + label + " -> " + r);
    } else {
      // terminal states (>= 4) and DISPUTED need no scheduler action
      if (job.state === 3) log("job " + label + " (delivered, settle pending)");
    }
  }
}

/* ------------------------------------------------------------ watch tick -- */

/**
 * Heartbeat gap monitor. The scheduler is not the node and cannot heartbeat
 * for it, but it *should* shout when the only provider goes dark, because that
 * is the failure that silently makes every future job unassignable.
 */
async function reportAvailability(mkt, sk) {
  const n = Number(await sk.nodeCount());
  if (n === 0) { log("WARNING: no registered nodes at all"); return; }
  for (let i = 0; i < n; i++) {
    const addr = await sk.nodeAddresses(i);
    const overdue = await sk.isOverdue(addr);
    const nd = await sk.node(addr);
    const el = await mkt.isEligible(addr, Number(nd.tier));
    log("node " + addr + " tier=" + nd.tier + " stake=" + ethers.formatEther(nd.stake) +
        " overdue=" + overdue + " eligible=" + el +
        (overdue ? "  <-- HEARTBEAT OVERDUE, page is dark" : ""));
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
