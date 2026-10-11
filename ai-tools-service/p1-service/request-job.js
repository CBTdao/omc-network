#!/usr/bin/env node
/**
 * OMC AI Tools · P1 · requester-only job creation
 *
 * Everything else in this directory drives a job from both sides: the
 * rehearsal harness assigns, confirms and settles with the scheduler key. That
 * proves the contract works, but it does not prove the *architecture* works —
 * that a job handed to the network by an ordinary requester is picked up and
 * finished by two separate server processes holding two different keys, with
 * nobody in the middle.
 *
 * This script is the requester. It holds the requester key and calls exactly
 * one privileged function, `createJob` — the same call a browser makes. Then it
 * stops, and the resident `scheduler.js` and `node-worker.js` have to do the
 * rest on their own:
 *
 *   request-job.js      createJob          (requester key)
 *   node-worker.js      delivers the bytes (node key)
 *   scheduler.js        confirmDelivery + settle (scheduler key)
 *
 * Usage:
 *   node p1-service/request-job.js --price 5            # create, then watch
 *   node p1-service/request-job.js --price 5 --no-watch  # create and exit
 *   node p1-service/request-job.js --status              # list jobs, do nothing
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const C = require("./chain.js");
const store = require("./store.js");

const AI_TOOLS = path.resolve(__dirname, "..");

function argOf(name, dflt) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return dflt;
}
const IMAGE = argOf("--image", path.join(AI_TOOLS, "testdata", "sample.png"));
const PRICE_OMC = argOf("--price", "5");
const TIER = Number(argOf("--tier", "1"));
const DEADLINE_MIN = Number(argOf("--deadline-min", "60"));
const STATUS = process.argv.includes("--status");
const NO_WATCH = process.argv.includes("--no-watch");

function log(m) { console.log("  " + m); }
function stamp() { return new Date().toTimeString().slice(0, 8); }

async function main() {
  const p = await C.provider();
  const d = C.deployments();
  const mkt = await C.market(p);

  if (STATUS) {
    const all = await C.readAllJobs(mkt);
    console.log("jobs on " + d.market + ": " + all.length);
    for (const j of all) console.log("  " + C.describeJob(j));
    return;
  }

  /* The requester is an ordinary wallet here. On testnet the only funded key is
     the deployer, and it happens to also be the scheduler — which is precisely
     the arrangement this script exists to expose as a limitation rather than to
     hide. The call it makes is still only createJob. */
  const requester = await C.schedulerWallet();
  const tok = await C.token(requester);
  const price = ethers.parseEther(String(PRICE_OMC));

  const bytes = fs.readFileSync(IMAGE);
  const imageHash = store.hashBytes(bytes);
  const specHash = store.specHashFor(
    imageHash, TIER, C.VERIFY_POLICY.SPOT_CHECK, C.PROTECTION.STANDARD
  );

  console.log("OMC AI Tools · requester-only job creation");
  console.log("  " + stamp());
  log("market     = " + d.market);
  log("requester  = " + requester.address);
  log("tOMC       = " + ethers.formatEther(await tok.balanceOf(requester.address)));
  log("imageHash  = " + imageHash);
  log("specHash   = " + specHash);

  const allow = await tok.allowance(requester.address, d.market);
  if (allow < price) {
    const ap = await tok.connect(requester).approve(d.market, ethers.MaxUint256);
    log("approve    tx: " + ap.hash);
    await ap.wait();
  }

  const block = await p.getBlock("latest");
  const deadline = block.timestamp + DEADLINE_MIN * 60;

  const cj = await mkt.connect(requester).createJob(
    specHash, TIER, C.VERIFY_POLICY.SPOT_CHECK, C.PROTECTION.STANDARD,
    price, deadline, true
  );
  log("createJob  tx: " + cj.hash);
  await cj.wait();

  const jobId = Number(await mkt.jobCount());
  store.putSpec(jobId, bytes, {
    specHash, tier: TIER, price: PRICE_OMC,
    verifyPolicy: C.VERIFY_POLICY.SPOT_CHECK, protection: C.PROTECTION.STANDARD,
  });
  log("job #" + jobId + " is ESCROWED with " + ethers.formatEther(price) + " tOMC");
  log("now nothing else happens from here: scheduler.js and node-worker.js have to carry it");

  if (NO_WATCH) return;

  /* Watch the resident processes do the work. Nothing below signs anything. */
  log("watching (Ctrl-C to stop) …");
  let last = "";
  for (let i = 0; i < 90; i++) {
    const j = await C.readJob(mkt, jobId);
    const line = C.jobState(j.state);
    if (line !== last) {
      console.log("  " + stamp() + "  job #" + jobId + " -> " + line +
        (j.provider !== ethers.ZeroAddress ? "  provider " + j.provider : ""));
      last = line;
    }
    if (["SETTLED", "REFUNDED", "CANCELLED"].includes(line)) {
      const stats = await mkt.protocolStats();
      console.log("  " + stamp() + "  final: " + line);
      log("paid        = " + ethers.formatEther(j.paid));
      log("feePaid     = " + ethers.formatEther(j.feePaid));
      log("settled     = " + stats[1] + "  failed = " + stats[2] +
          "  escrowedNow = " + ethers.formatEther(stats[3]));
      const meta = store.readResultMeta(jobId);
      if (meta) {
        const v = store.verifyResult(jobId);
        log("result meta = " + JSON.stringify(meta));
        log("verifyResult = " + (v.ok ? "OK — the bytes on disk hash to the on-chain digest"
                                     : "REJECTED — " + v.error));
      }
      return;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  log("gave up watching after 90 polls");
}

main().catch((e) => {
  console.error("FAILED:", e.shortMessage || e.message);
  process.exit(1);
});
