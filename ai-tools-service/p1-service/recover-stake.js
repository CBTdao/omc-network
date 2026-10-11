#!/usr/bin/env node
/**
 * OMC AI Tools · P1 · withdraw a node's stake from a superseded contract
 *
 * Redeploying OMCStaking leaves every node's bond sitting in the old instance.
 * The old contract still honours its own rules — the node can heartbeat and
 * unstake from it — but nobody will, because every tool in this directory now
 * points at the new address. The money is not lost, it is just invisible, and
 * "invisible" is how it stays lost.
 *
 * So a migration needs four steps, in this order:
 *
 *   1. heartbeat on the OLD contract   both deregister() and unstake() require
 *                                      _overdueIntervals == 0
 *   2. deregister()                    drops tier to 0 and registered to false
 *   3. unstake() the whole bond        the tokens return to the node wallet
 *   4. stake again on the NEW contract `bootstrap-node.js`
 *
 * Steps 1 and 2 are not interchangeable and neither can be done by the
 * scheduler: only the node's own key can heartbeat or deregister for it. And
 * step 2 must come before step 3 — while the node is still registered,
 * `unstake()` insists the remaining stake stays at or above the tier minimum,
 * so withdrawing the whole bond reverts with "OMCS: below tier minimum". This
 * script holds the node key and does 1-3.
 *
 * Usage:
 *   node p1-service/recover-stake.js --from 0x<old staking> [--dry-run]
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { ethers } = require("ethers");

const C = require("./chain.js");

const KEY_FILE = path.join(os.homedir(), ".workbuddy", "omc-node-key.env");

function argOf(n, d) { const i = process.argv.indexOf(n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; }
const FROM = argOf("--from", null);
const DRY = process.argv.includes("--dry-run");

function log(...a) { console.log("[recover]", ...a); }

function nodeKey() {
  if (process.env.OMC_NODE_PRIVATE_KEY) return process.env.OMC_NODE_PRIVATE_KEY.trim();
  if (fs.existsSync(KEY_FILE)) {
    for (const line of fs.readFileSync(KEY_FILE, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*(?:OMC_NODE_PRIVATE_KEY|PRIVATE_KEY)\s*=\s*(.+?)\s*$/);
      if (m) return m[1].replace(/^["']|["']$/g, "");
    }
  }
  throw new Error("no node key in " + KEY_FILE);
}

async function main() {
  if (!FROM) throw new Error("--from <superseded staking address> is required");

  const p = await C.provider();
  const d = C.deployments();
  const node = new ethers.Wallet(nodeKey(), p);

  /* The old contract needs the OLD artifact only if the ABI changed. It did not
     here — recovery uses unstake/heartbeat/node, none of which moved — but read
     the artifact from disk rather than hand-typing an ABI. */
  const art = C.artifact("OMCStaking");
  const old = new ethers.Contract(FROM, art.abi, node);
  const tok = await C.token(node);

  log("node        " + node.address);
  log("from        " + FROM + (FROM.toLowerCase() === String(d.staking).toLowerCase() ? "   <-- this is the CURRENT contract" : "   (superseded)"));
  log("tOMC held   " + ethers.formatEther(await tok.balanceOf(node.address)));

  let nd;
  try {
    nd = await old.node(node.address);
  } catch (e) {
    throw new Error("cannot read node() on " + FROM + " — wrong address? " + (e.shortMessage || e.message));
  }
  if (!nd.registered) {
    log("not registered on that contract — nothing to recover");
    return;
  }

  const stake = nd.stake;
  const overdue = await old.isOverdue(node.address);
  const now = (await p.getBlock("latest")).timestamp;
  const hb = Number(await old.heartbeatDeadline(node.address));

  log("registered  true | tier " + nd.tier + " | stake " + ethers.formatEther(stake) + " | earning " + nd.earning);
  log("overdue     " + overdue + " | heartbeat window " + (hb - now > 0 ? "opens in " + (hb - now) + "s" : "open"));

  if (stake === 0n) { log("stake is already zero — nothing to recover"); return; }
  if (DRY) { log("--dry-run: stopping here"); return; }

  /* 1. heartbeat first: unstake() reverts with "OMCS: heartbeat first" while the
     node has any overdue interval outstanding. */
  if (overdue) {
    log("heartbeating on the old contract so unstake() is allowed");
    const tx = await old.heartbeat();
    log("  tx " + tx.hash);
    await tx.wait();
  }

  /* 2. leave the registry. Required before a full withdrawal: while the node is
     still registered, unstake() requires the remaining stake to stay at or
     above minStakeForTier(tier), so taking everything out reverts. deregister()
     sets tier to 0 and registered to false, which lifts that check. */
  if (nd.registered) {
    log("deregistering on the old contract (lifts the tier-minimum check on unstake)");
    const tx = await old.deregister();
    log("  tx " + tx.hash);
    await tx.wait();
  }

  /* 3. withdraw the whole bond */
  const before = await tok.balanceOf(node.address);
  log("unstaking " + ethers.formatEther(stake) + " tOMC");
  const tx = await old.unstake(stake);
  log("  tx " + tx.hash);
  const rc = await tx.wait();
  log("  mined in block " + rc.blockNumber + " (gas " + rc.gasUsed.toString() + ")");

  const after = await tok.balanceOf(node.address);
  log("node tOMC   " + ethers.formatEther(before) + " -> " + ethers.formatEther(after));
  log("recovered   " + ethers.formatEther(after - before) + " tOMC");
  log("");
  log("next: node p1-service/bootstrap-node.js   # stake + register on the new contract");
}

main().catch((e) => { console.error("[recover] FAILED:", e.shortMessage || e.message); process.exit(1); });
