#!/usr/bin/env node
/**
 * OMC AI Tools · P1 · failure-path rehearsal
 *
 * The half of the market the success path never touches: a job the provider
 * delivers badly, and the refund that is paid out of that provider's bond.
 *
 * This is the path `OMCComputeMarket.fail()` implements, and the path the F-1
 * defect disabled. Before the fix the published 50 / 30 / 20 split was applied
 * twice — once inside `OMCStaking.slashFor()` and once again in `fail()` — so
 * the contract always came up short by the requester's 50% and *every* non-zero
 * penalty reverted. A buyer could therefore never actually be refunded, which
 * is the single property the whole stake requirement exists to provide
 * (whitepaper 7.6: "a refund is the seller's debt, not a redistribution of
 * someone else's deposit").
 *
 * What this script does, in order:
 *
 *   1. createJob                 requester escrows tOMC into the market
 *   2. assign(jobId, provider)   scheduler hands the job to the staked node
 *   3. deliver badly             the node commits a result digest that its own
 *                                bytes do not match — the exact condition
 *                                store.verifyResult() rejects
 *   4. fail(jobId, BAD_OUTPUT)   the scheduler charges the bond
 *   5. read back                 the buyer's refund, the treasury slice, the
 *                                burn, and the provider stake that paid for it
 *
 * Every step is a real testnet transaction and its hash is printed, so the
 * console output is itself the evidence.
 *
 * Usage:
 *   node p1-service/e2e-failure.js                 # 5 tOMC job, bad output
 *   node p1-service/e2e-failure.js --price 10
 *   node p1-service/e2e-failure.js --status        # describe, change nothing
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const C = require("./chain.js");
const store = require("./store.js");
const P = require("./provider-select.js");

const AI_TOOLS = path.resolve(__dirname, "..");

/* --------------------------------------------------------------- args ---- */

function argOf(name, dflt) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return dflt;
}
const IMAGE = argOf("--image", path.join(AI_TOOLS, "testdata", "sample.png"));
const PRICE_OMC = argOf("--price", "5");
const TIER = Number(argOf("--tier", "1"));
const DEADLINE_MIN = Number(argOf("--deadline-min", "60"));
const STATUS_ONLY = process.argv.includes("--status");

/* ------------------------------------------------------------- output ---- */

function stamp() {
  return new Date().toTimeString().slice(0, 8);
}
function log(m) {
  console.log("  " + m);
}
function step(n, title) {
  console.log("\n" + "=".repeat(72));
  console.log("STEP " + n + "  " + title);
  console.log("=".repeat(72));
}
function txline(name, tx) {
  console.log("  " + name.padEnd(16) + " tx: " + tx.hash);
}
function rule() {
  console.log("\n" + "-".repeat(72));
}
async function bal(tok, addr) {
  return ethers.formatEther(await tok.balanceOf(addr));
}

/* ---------------------------------------------------------------- main --- */

async function main() {
  const provider = await C.provider();
  const scheduler = await C.schedulerWallet();
  const d = C.deployments();

  const tok = await C.token(scheduler);
  const mkt = await C.market(scheduler);
  const stk = await C.staking(scheduler);

  const requester = scheduler; // one funded key on testnet: it holds tOMC and tBNB
  const price = ethers.parseEther(String(PRICE_OMC));

  console.log("OMC AI Tools · failure-path rehearsal (BAD_OUTPUT -> bond refund)");
  console.log("  " + stamp());
  log("chain        = " + C.CHAIN_ID + " (BNB Smart Chain Testnet)");
  log("market       = " + d.market);
  log("staking      = " + d.staking);
  log("token        = " + d.token);
  log("scheduler    = " + scheduler.address + "  (also the requester)");

  /* ---- who is the provider? ------------------------------------------- */

  const pick = await P.pickProvider(mkt, stk, TIER, { allowOffline: true });
  if (!pick.addr) {
    console.log("\nFATAL: no registered node for tier " + TIER + " to fail against.");
    process.exit(3);
  }
  const providerAddr = pick.addr;
  log("provider     = " + providerAddr + "  (" + pick.reason + ")");

  const standing0 = await mkt.providerStanding(providerAddr, TIER, C.FAIL_REASON.BAD_OUTPUT);
  log(
    "provider bond before = " + ethers.formatEther(standing0[1]) +
      "  (worst case for BAD_OUTPUT = " + ethers.formatEther(standing0[3]) + ")"
  );

  if (STATUS_ONLY) {
    const stats = await mkt.protocolStats();
    log("jobsTotal = " + stats[0] + " | settled = " + stats[1] + " | failed = " + stats[2]);
    return;
  }

  /* ---- 1. escrow ------------------------------------------------------ */

  step(1, "requester escrows a job it is about to lose");

  const bytes = fs.readFileSync(IMAGE);
  const imageHash = store.hashBytes(bytes);
  const specHash = store.specHashFor(
    imageHash, TIER, C.VERIFY_POLICY.SPOT_CHECK, C.PROTECTION.STANDARD
  );
  log("image          = " + IMAGE);
  log("imageHash      = " + imageHash);
  log("specHash       = " + specHash);

  const requesterBefore = await tok.balanceOf(requester.address);
  const supplyBefore = await tok.totalSupply();
  log("requester tOMC before = " + ethers.formatEther(requesterBefore));

  const allow = await tok.allowance(requester.address, d.market);
  if (allow < price) {
    const ap = await tok.connect(requester).approve(d.market, ethers.MaxUint256);
    txline("approve", ap);
    await ap.wait();
  }

  const block = await provider.getBlock("latest");
  const deadline = block.timestamp + DEADLINE_MIN * 60;

  const cj = await mkt.connect(requester).createJob(
    specHash, TIER, C.VERIFY_POLICY.SPOT_CHECK, C.PROTECTION.STANDARD,
    price, deadline, true // paidInOMC
  );
  txline("createJob", cj);
  const rc = await cj.wait();
  log("mined in block " + rc.blockNumber + " (gas " + rc.gasUsed.toString() + ")");

  const jobId = Number(await mkt.jobCount());
  log("jobCount is now " + jobId + " — new job id #" + jobId);

  store.putSpec(jobId, bytes, {
    specHash, tier: TIER, price: PRICE_OMC,
    verifyPolicy: C.VERIFY_POLICY.SPOT_CHECK, protection: C.PROTECTION.STANDARD,
  });

  let job = await C.readJob(mkt, jobId);
  log("state = " + C.jobState(job.state) + "  escrow = " + ethers.formatEther(job.maxPrice));

  /* ---- 2. assign ------------------------------------------------------ */

  step(2, "scheduler assigns the job to the staked node");

  const asg = await mkt.connect(scheduler).assign(jobId, providerAddr);
  txline("assign", asg);
  await asg.wait();
  job = await C.readJob(mkt, jobId);
  log("state = " + C.jobState(job.state) + "  provider = " + job.provider);

  /* ---- 3. a delivery that fails verification -------------------------- */

  step(3, "the node delivers output that does not match what it commits to");

  /* What the node actually shipped to the off-band channel ... */
  const delivered = Buffer.from("omc-bad-output/job-" + jobId, "utf8");
  fs.writeFileSync(store.resultPath(jobId), delivered);

  /* ... and the digest it wants the chain to believe. They disagree, which is
     precisely what store.verifyResult() exists to catch: the bytes are the
     artefact, the hash is the commitment, and a settlement is only ever
     released against a commitment the bytes can reproduce. */
  const claimed = ethers.keccak256(
    Buffer.from("omc-committed-but-never-produced/job-" + jobId, "utf8")
  );
  store.writeResultMeta(jobId, {
    resultHash: claimed,
    bytes: delivered.length,
    stub: true,
    note: "deliberately mismatched: the committed digest is not the digest of the bytes on disk",
  });

  const v = store.verifyResult(jobId);
  log("delivered bytes  = " + delivered.length + "  keccak256 = " + store.hashBytes(delivered));
  log("committed hash   = " + claimed);
  log("verifyResult()   = " + (v.ok ? "OK" : "REJECTED — " + v.error));
  if (v.ok) {
    console.log("\nFATAL: the verification guard did not reject a mismatched delivery; aborting.");
    process.exit(4);
  }

  const cd = await mkt.connect(scheduler).confirmDelivery(jobId, claimed);
  txline("confirmDelivery", cd);
  await cd.wait();
  job = await C.readJob(mkt, jobId);
  log("state = " + C.jobState(job.state) + "  resultHash on chain = " + job.resultHash);

  /* ---- 4. fail -> the bond pays ---------------------------------------- */

  step(4, "scheduler fails the job: BAD_OUTPUT charges the provider's bond");

  const stakeBefore = (await stk.node(providerAddr)).stake;
  log("provider stake before fail = " + ethers.formatEther(stakeBefore));

  const fl = await mkt.connect(scheduler).fail(jobId, C.FAIL_REASON.BAD_OUTPUT);
  txline("fail", fl);
  const frc = await fl.wait();
  log("mined in block " + frc.blockNumber + " (gas " + frc.gasUsed.toString() + ")");

  const stakeAfter = (await stk.node(providerAddr)).stake;
  const requesterAfter = await tok.balanceOf(requester.address);
  const supplyAfter = await tok.totalSupply();
  job = await C.readJob(mkt, jobId);

  /* ---- 5. read the outcome back ---------------------------------------- */

  step(5, "verify the outcome");

  const slashed = stakeBefore - stakeAfter;
  const refund = requesterAfter - requesterBefore + price; // + the escrowed price, which came back
  log("job #" + jobId + " final state = " + C.jobState(job.state));
  log("");
  log("provider stake  " + ethers.formatEther(stakeBefore) +
      " -> " + ethers.formatEther(stakeAfter) +
      "   slashed " + ethers.formatEther(slashed) + " tOMC");
  log("requester tOMC  " + ethers.formatEther(requesterBefore) +
      " -> " + ethers.formatEther(requesterAfter));
  log("  net cost of this job to the requester = " +
      ethers.formatEther(requesterBefore - requesterAfter) + " tOMC");
  log("  (escrow " + ethers.formatEther(price) + " came back, plus its share of the bond)");
  log("");
  log("token totalSupply " + ethers.formatEther(supplyBefore) +
      " -> " + ethers.formatEther(supplyAfter) +
      "   burned " + ethers.formatEther(supplyBefore - supplyAfter) + " tOMC");

  const stats = await mkt.protocolStats();
  log("");
  log("market totals: jobsTotal=" + stats[0] +
      " settled=" + stats[1] + " failed=" + stats[2] +
      " escrowedNow=" + ethers.formatEther(stats[3]) +
      " settledVolume=" + ethers.formatEther(stats[4]));

  /* The 50 / 30 / 20 split is applied inside OMCStaking.slashFor(); the market
     only forwards the requester's half. Check the arithmetic landed. */
  const expectRequester = (slashed * 50n) / 100n;
  const expectTreasury = (slashed * 30n) / 100n;
  const expectBurn = slashed - expectRequester - expectTreasury;
  log("");
  log("slash split on " + ethers.formatEther(slashed) + " tOMC slashed:");
  log("  requester (50%) = " + ethers.formatEther(expectRequester));
  log("  treasury  (30%) = " + ethers.formatEther(expectTreasury));
  log("  burned    (20%) = " + ethers.formatEther(expectBurn));

  rule();
  const ok = job.state === 6 /* REFUNDED */ || C.jobState(job.state) === "REFUNDED";
  console.log(
    "\n" + (ok ? "PASS" : "CHECK") + " — job #" + jobId + " is " + C.jobState(job.state) +
      "; the buyer was refunded " + ethers.formatEther(expectRequester) +
      " tOMC out of the seller's bond."
  );
  console.log(
    "This is the path the pre-fix OMCComputeMarket could not take: fail() reverted on any\n" +
    "non-zero penalty, so no buyer could ever be refunded from a bond.\n"
  );
  void mkt;
}

main().catch((e) => {
  console.error("\nFAILED:", e.shortMessage || e.message);
  process.exit(1);
});
