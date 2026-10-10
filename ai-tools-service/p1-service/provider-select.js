/**
 * OMC AI Tools · P1 · provider selection
 *
 * One function, used by both the scheduler and the rehearsal harness, so the
 * two can never disagree about who should get the next job.
 *
 * The rule, in order:
 *
 *   1. ask the chain who is eligible — isEligible() already folds in stake,
 *      tier and overdue, so this is the contract's own answer, not our guess
 *   2. among those, keep the ones with a live worker (see liveness.js)
 *   3. pick the least-loaded of the survivors (fewest completed work units,
 *      so load spreads as more providers join)
 *   4. if nobody is live: refuse
 *
 * Step 4 is the whole point of this file. Assigning to an eligible-but-dead
 * node fails *quietly*: the job sits in ASSIGNED until its deadline, then the
 * scheduler's TIMEOUT path refunds the requester and nothing was delivered. A
 * scheduler that does that logs a green "assigned to 0x…" every time while
 * every job times out — the most expensive kind of bug, because it looks like
 * success. Leaving the job ESCROWED instead keeps it cancellable by the
 * requester and states the real reason out loud.
 *
 * The override exists for rehearsals and for testnet demos where the worker is
 * a one-shot process and therefore is not, by definition, live.
 */
"use strict";

const liveness = require("./liveness.js");

/**
 * Walk the node registry and ask the chain about each entry. Returns plain
 * rows so callers can log exactly what the decision was made from.
 */
async function survey(mkt, sk, tier) {
  const n = Number(await sk.nodeCount());
  const rows = [];
  for (let i = 0; i < n; i++) {
    const addr = await sk.nodeAddresses(i);
    let summary;
    try {
      summary = await sk.nodeSummary(addr);      // 13 fields, includes overdue
    } catch (e) {
      const nd = await sk.node(addr);            // 11-field fallback
      summary = { tier: nd.tier, stake: nd.stake, overdue: await sk.isOverdue(addr), workUnits: 0n };
    }
    rows.push({
      index: i,
      addr,
      tier: Number(summary.tier),
      stake: summary.stake,
      overdue: !!summary.overdue,
      workUnits: Number(summary.workUnits || 0),
      eligible: await mkt.isEligible(addr, tier),
      live: liveness.isLive(addr),
    });
  }
  return rows;
}

function byLoad(a, b) { return a.workUnits - b.workUnits; }

/**
 * Choose a provider for a job of `tier`.
 *
 * Returns { addr, rows, reason, picked, warned }. `addr === null` means "do not
 * assign" — the caller must not treat that as an error to retry immediately,
 * only as a reason to wait and report.
 *
 * opts.allowOffline — assign to an eligible node even with no live worker
 *                     (rehearsals, manual testnet runs). Logged as a warning.
 */
async function pickProvider(mkt, sk, tier, opts) {
  const o = opts || {};
  const rows = await survey(mkt, sk, tier);
  const eligible = rows.filter((r) => r.eligible);

  if (!eligible.length) {
    return { addr: null, rows, reason: "no node is eligible for tier " + tier };
  }

  const live = eligible.filter((r) => r.live);
  if (live.length) {
    live.sort(byLoad);
    return { addr: live[0].addr, rows, picked: live[0], reason: "least-loaded live worker" };
  }

  if (o.allowOffline) {
    const any = eligible.slice().sort(byLoad);
    return {
      addr: any[0].addr, rows, picked: any[0], warned: true,
      reason: "no live worker — assigning anyway because allowOffline is set",
    };
  }

  return {
    addr: null, rows,
    reason: "no live worker among " + eligible.length + " eligible node(s)",
  };
}

module.exports = { survey, pickProvider };
