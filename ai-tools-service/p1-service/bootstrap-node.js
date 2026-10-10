#!/usr/bin/env node
/**
 * OMC AI Tools · P1 · bootstrap a provider node we actually hold the key for.
 *
 * Why this exists: the one node on chain is the owner wallet 0xc35711aa…, and
 * its private key has never been on this machine. So the heartbeat could only
 * be sent by hand every 40 minutes, and the moment it lapsed isEligible()
 * flipped false and assign() reverted — which is exactly what blocked the
 * end-to-end run.
 *
 * This registers a *separate* node key so the two roles stay distinct, as the
 * architecture intends (scheduler signs assign/settle; the node signs only its
 * own heartbeat). The key is written to ~/.workbuddy/omc-node-key.env, which is
 * the same file node-worker.js already looks for.
 *
 * What it does, in order:
 *   1. load or create the node key (never printed)
 *   2. top the node up with tBNB for gas, and with the tier-1 stake in tOMC
 *   3. approve -> stake(20, 1) -> registerNode(1, endpoint), all signed by the node
 *   4. print the resulting eligibility so the chain state is the proof
 *
 * Usage:
 *   node p1-service/bootstrap-node.js            # do it
 *   node p1-service/bootstrap-node.js --status    # read-only report
 *   node p1-service/bootstrap-node.js --endpoint https://example.org/node
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { ethers } = require("ethers");

const C = require("./chain.js");

const STATUS = process.argv.includes("--status");
let ENDPOINT = "https://omc.network/stake";
const ei = process.argv.indexOf("--endpoint");
if (ei !== -1 && process.argv[ei + 1]) ENDPOINT = process.argv[ei + 1];

const TIER = 1;
const KEY_FILE = path.join(os.homedir(), ".workbuddy", "omc-node-key.env");
const GAS_FLOOR = ethers.parseEther("0.004");   // keep the node able to sign

function log(...a) { console.log("[bootstrap]", ...a); }

/* ------------------------------------------------------------- node key --- */

function loadNodeKey() {
  if (process.env.OMC_NODE_PRIVATE_KEY) return process.env.OMC_NODE_PRIVATE_KEY.trim();
  if (fs.existsSync(KEY_FILE)) {
    for (const line of fs.readFileSync(KEY_FILE, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*(?:OMC_NODE_PRIVATE_KEY|PRIVATE_KEY)\s*=\s*(.+?)\s*$/);
      if (m) return m[1].replace(/^["']|["']$/g, "");
    }
  }
  return "";
}

function saveNodeKey(pk) {
  const body =
    "# OMC AI Tools provider node key — signs ONLY this node's own heartbeat.\n" +
    "# It can never call assign/settle/fail; those are scheduler-only on the market.\n" +
    "OMC_NODE_PRIVATE_KEY=" + pk + "\n";
  fs.writeFileSync(KEY_FILE, body, { mode: 0o600 });
}

/* ------------------------------------------------------------------ main --- */

async function main() {
  const p = await C.provider();
  const dep = C.deployments();

  let pk = loadNodeKey();
  let created = false;
  if (!pk) {
    if (STATUS) throw new Error("no node key yet — run without --status to create one");
    const w = ethers.Wallet.createRandom();
    pk = w.privateKey;
    created = true;
  }
  const node = new ethers.Wallet(pk, p);

  const funder = await C.schedulerWallet();          // the deployer holds 5,000,000 tOMC
  const tokNode = await C.token(node);
  const tokFunder = await C.token(funder);
  const sk = await C.staking(node);
  const mkt = await C.market(p);

  const need = await sk.minStakeForTier(TIER);
  const bal = await tokNode.balanceOf(node.address);
  const gas = await p.getBalance(node.address);

  log("node wallet   =", node.address, created ? "(NEW — key written to " + KEY_FILE + ")" : "(existing key)");
  log("funder        =", funder.address);
  log("tier " + TIER + " min     =", ethers.formatEther(need), "tOMC");
  log("node tOMC     =", ethers.formatEther(bal));
  log("node tBNB     =", ethers.formatEther(gas), "| nonce", await p.getTransactionCount(node.address));
  log("endpoint      =", JSON.stringify(ENDPOINT));

  const nd0 = await sk.node(node.address);
  log("registered    =", nd0.registered, "| tier =", nd0.tier,
      "| stake =", ethers.formatEther(nd0.stake), "| earning =", nd0.earning);
  log("isEligible    =", await mkt.isEligible(node.address, TIER));

  if (STATUS) return;

  if (created) { saveNodeKey(pk); log("saved node key ->", KEY_FILE); }

  /* 1. gas: the brand-new node cannot sign anything without tBNB */
  if (gas < GAS_FLOOR) {
    const top = GAS_FLOOR - gas;
    log("send", ethers.formatEther(top), "tBNB to node for gas");
    const tx = await funder.sendTransaction({ to: node.address, value: top });
    log("  tx", tx.hash);
    await tx.wait();
  }

  /* 2. the stake itself, in tOMC */
  if (bal < need) {
    const top = need - bal;
    log("transfer", ethers.formatEther(top), "tOMC to node");
    const tx = await tokFunder.transfer(node.address, top);
    log("  tx", tx.hash);
    await tx.wait();
  }

  /* 3. approve -> stake -> register, all signed by the node */
  const al = await tokNode.allowance(node.address, dep.staking);
  if (al < need) {
    log("node approves", ethers.formatEther(need), "tOMC to staking");
    const tx = await tokNode.approve(dep.staking, need);
    log("  tx", tx.hash);
    await tx.wait();
  }

  const nd1 = await sk.node(node.address);
  if (nd1.stake < need) {
    log("node stakes", ethers.formatEther(need), "tOMC at tier " + TIER);
    const tx = await sk.stake(need, TIER);
    log("  tx", tx.hash);
    await tx.wait();
  }

  const nd2 = await sk.node(node.address);
  if (!nd2.registered) {
    log("node registers (tier " + TIER + ")");
    const tx = await sk.registerNode(TIER, ENDPOINT);
    log("  tx", tx.hash);
    await tx.wait();
  } else {
    log("node already registered — refreshing heartbeat");
    const tx = await sk.heartbeat();
    log("  tx", tx.hash);
    await tx.wait();
  }

  /* 4. the chain is the source of truth */
  const nd3 = await sk.node(node.address);
  const hb = await sk.heartbeatDeadline(node.address);
  const now = (await p.getBlock("latest")).timestamp;
  log("--- result ---");
  log("registered    =", nd3.registered, "| tier =", nd3.tier,
      "| stake =", ethers.formatEther(nd3.stake), "| earning =", nd3.earning);
  log("overdue       =", await sk.isOverdue(node.address));
  log("isEligible    =", await mkt.isEligible(node.address, TIER));
  log("nodeCount     =", (await sk.nodeCount()).toString());
  log("heartbeat due in", Number(hb) - now, "s");
}

main().catch((e) => {
  console.error("[bootstrap] FAILED:", e.shortMessage || e.message);
  process.exit(1);
});
