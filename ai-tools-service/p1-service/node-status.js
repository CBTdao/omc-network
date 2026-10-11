#!/usr/bin/env node
/**
 * OMC AI Tools · P1 · why is this node (in)eligible?
 *
 * isEligible() collapses five conditions into one bool, and the collapsed
 * answer is useless when it says no: stake, tier, registration, `earning` and
 * `overdue` all have to hold, and after a slash the one that flips is usually
 * `earning` — a node that just failed a job is deliberately taken out of the
 * earning set until it heartbeats again. This prints the five inputs and the
 * verdict, so the reason is never a guess.
 *
 * Usage: node p1-service/node-status.js [address]
 */
"use strict";

const C = require("./chain.js");
const { ethers } = require("ethers");

async function main() {
  const p = await C.provider();
  const stk = await C.staking(p);
  const mkt = await C.market(p);

  let who = process.argv[2];
  if (!who) {
    const n = Number(await stk.nodeCount());
    if (n === 0) { console.log("no nodes registered"); return; }
    who = await stk.nodeAddresses(0);
  }

  const tier = 1;
  const s = await stk.nodeSummary(who);
  const need = await stk.minStakeForTier(tier);
  const now = (await p.getBlock("latest")).timestamp;
  const hb = await stk.heartbeatDeadline(who);
  const eligible = await mkt.isEligible(who, tier);

  const f = (x) => ethers.formatEther(x);
  console.log("node        " + who);
  console.log("tier        " + s.tier);
  console.log("registered  " + s.registered);
  console.log("earning     " + s.earning + (s.earning ? "" : "   <-- taken out of the earning set; heartbeat() restores it"));
  console.log("overdue     " + s.overdue);
  console.log("stake       " + f(s.stake) + "   (tier " + tier + " min " + f(need) + (s.stake >= need ? "  ok" : "  SHORT"));
  console.log("workUnits   " + s.workUnits);
  console.log("heartbeat   due in " + Number(hb) - now + "s");
  console.log("isEligible  " + eligible);

  const reasons = [];
  if (!s.registered) reasons.push("not registered");
  if (!s.earning) reasons.push("not earning (heartbeat() fixes this)");
  if (s.overdue) reasons.push("overdue");
  if (s.stake < need) reasons.push("stake below tier minimum, needs +" + f(need - s.stake));
  if (Number(s.tier) < tier) reasons.push("tier too low");
  console.log("blocked by  " + (reasons.length ? reasons.join("; ") : "nothing"));
}

main().catch((e) => { console.error("FAILED:", e.shortMessage || e.message); process.exit(1); });
