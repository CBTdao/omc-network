#!/usr/bin/env node
/**
 * OMC AI Tools · P1 · offline wiring check
 *
 * Everything in the P1 services that can be proven without a key, proven.
 *
 * The one thing a testnet run cannot tell you quickly is whether the two
 * halves agree on the bytes. So this harness stubs the chain with a tiny
 * in-memory market that applies the same rules the Solidity does (escrow,
 * only-scheduler, isEligible, settle math) and runs the whole lifecycle
 * through it — including a tampered result that must be rejected.
 *
 * It asserts, in order:
 *   1. specHash folding is stable and parameter-sensitive
 *   2. the store round-trips bytes and verifies hashes
 *   3. a tampered result FAILS verification (the whole point of the binding)
 *   4. the lifecycle ESCROWED -> ASSIGNED -> DELIVERED -> SETTLED applies
 *   5. the settlement split matches the contract's 3% / 30:70 with the 10% OMC discount
 *   6. scheduler-only calls are rejected when signed by anyone else
 *
 * Usage: node p1-service/offline-wiring-check.js
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { ethers } = require("ethers");

const store = require("./store.js");
const C = require("./chain.js");

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? "  -- " + extra : "")); }
}
function section(t) { console.log("\n" + t); }

/* -------- 1. spec hash folding ------------------------------------------ */

section("1. specHash folding");
{
  const imgHash = ethers.keccak256(ethers.toUtf8Bytes("pretend-image-bytes"));
  const a = store.specHashFor(imgHash, 1, 0, 0);
  const b = store.specHashFor(imgHash, 1, 0, 0);
  const c = store.specHashFor(imgHash, 2, 0, 0);
  const d = store.specHashFor(imgHash, 1, 1, 0);
  const e = store.specHashFor(imgHash, 1, 0, 1);

  ok(a === b, "same parameters produce the same specHash");
  ok(a !== c, "a different tier produces a different specHash");
  ok(a !== d, "a different verify policy produces a different specHash");
  ok(a !== e, "a different protection level produces a different specHash");
  ok(a.startsWith("0x") && a.length === 66, "specHash is a 32-byte hex string");

  // The preimage is domain-separated, so an image hash can never be replayed
  // as some other kind of digest.
  const pre = "omc-ai-tools/spec/v1|" + imgHash + "|1|0|0";
  ok(ethers.keccak256(ethers.toUtf8Bytes(pre)) === a, "preimage layout matches the page");
}

/* -------- 2 & 3. store round-trip and tamper detection ------------------ */

section("2/3. out-of-band store: round-trip and tamper detection");
{
  const tmpRoot = store.ROOT;
  const id = 990001;
  const bytes = Buffer.from("the requester's original image bytes");
  const meta = store.putSpec(id, bytes, { tier: 1, note: "test" });

  ok(fs.readFileSync(store.specPath(id)).equals(bytes), "input bytes round-trip unchanged");
  ok(meta.imageHash === ethers.keccak256(bytes), "imageHash is keccak256 of the bytes");

  // Simulate the node producing a result, then verifying it.
  const out = Buffer.from("the node's upscaled pixels");
  fs.writeFileSync(store.resultPath(id), out);
  store.writeResultMeta(id, { jobId: id, resultHash: ethers.keccak256(out) });
  const good = store.verifyResult(id);
  ok(good.ok, "an honest result verifies against its committed hash");

  // Now tamper: swap one byte, exactly what a lying transport would do.
  const tampered = Buffer.from(out);
  tampered[0] = tampered[0] ^ 0x01;
  fs.writeFileSync(store.resultPath(id), tampered);
  const bad = store.verifyResult(id);
  ok(!bad.ok, "a single flipped byte breaks verification");
  ok(bad.expected !== bad.actual, "mismatch is visible in the digests");

  fs.rmSync(store.jobDir(id), { recursive: true, force: true });
}

/* -------- in-memory market that mirrors the Solidity rules -------------- */

function makeFakeMarket() {
  const jobs = new Map();
  let nextId = 1;
  const SCHEDULER = "0xSCHEDULER";
  const st = {
    JOB_STATE: C.JOB_STATE,
    escrow: new Map(),
    jobs,
    createJob(req, specHash, tier, maxPrice, deadline, paidInOMC) {
      const id = nextId++;
      jobs.set(id, {
        id, requester: req, provider: ethers.ZeroAddress,
        hardwareTier: tier, verifyPolicy: 0, protection: 0,
        state: 1, maxPrice: BigInt(maxPrice), paid: 0n, feePaid: 0n,
        createdAt: 0, deadline: Number(deadline), deliveredAt: 0,
        paidInOMC: !!paidInOMC, specHash, resultHash: ethers.ZeroHash,
      });
      st.escrow.set(req, (st.escrow.get(req) || 0n) + BigInt(maxPrice));
      return id;
    },
    assign(who, id, provider, eligible) {
      if (who !== SCHEDULER) throw new Error("OMCM: not scheduler");
      const j = jobs.get(id);
      if (j.state !== 1) throw new Error("OMCM: not open");
      if (!eligible) throw new Error("OMCM: provider not eligible");
      j.provider = provider; j.state = 2;
    },
    confirmDelivery(who, id, resultHash) {
      if (who !== SCHEDULER) throw new Error("OMCM: not scheduler");
      const j = jobs.get(id);
      if (j.state !== 2) throw new Error("OMCM: not assigned");
      j.resultHash = resultHash; j.state = 3;
    },
    settle(who, id, amount, feeBps, discountBps, burnBps) {
      if (who !== SCHEDULER) throw new Error("OMCM: not scheduler");
      const j = jobs.get(id);
      if (!(j.state === 2 || j.state === 3 || j.state === 5)) throw new Error("OMCM: not settleable");
      if (BigInt(amount) > j.maxPrice) throw new Error("OMCM: above ceiling");
      let fee = (BigInt(amount) * BigInt(feeBps)) / 10000n;
      if (j.paidInOMC) fee -= (fee * BigInt(discountBps)) / 10000n;
      const toBurn = (fee * BigInt(burnBps)) / 10000n;
      j.state = 4; j.paid = BigInt(amount); j.feePaid = fee;
      st.escrow.set(j.requester, (st.escrow.get(j.requester) || 0n) - j.maxPrice);
      return { fee, toBurn, toRewards: fee - toBurn, toProvider: BigInt(amount) - fee,
               leftover: j.maxPrice - BigInt(amount) };
    },
    job(id) { return jobs.get(id); },
    get jobCount() { return nextId - 1; },
  };
  return st;
}

/* -------- 4 & 5. lifecycle + settlement math ---------------------------- */

section("4/5. lifecycle and settlement arithmetic");
{
  const m = makeFakeMarket();
  const REQ = "0xREQ", PROV = "0xPROV", BAD = "0xBAD";
  const specHash = store.specHashFor(ethers.keccak256(ethers.toUtf8Bytes("img")), 1, 0, 0);

  const id = m.createJob(REQ, specHash, 1, ethers.parseEther("5"), 2000000000, true);
  ok(m.job(id).state === 1, "createJob opens the job in ESCROWED");
  ok(m.escrow.get(REQ) === ethers.parseEther("5"), "escrow equals maxPrice");

  let threw = false;
  try { m.assign(BAD, id, PROV, true); } catch (e) { threw = /not scheduler/.test(e.message); }
  ok(threw, "assign from a non-scheduler key is rejected");

  threw = false;
  try { m.assign("0xSCHEDULER", id, PROV, false); } catch (e) { threw = /not eligible/.test(e.message); }
  ok(threw, "assign to an ineligible provider is rejected");

  m.assign("0xSCHEDULER", id, PROV, true);
  ok(m.job(id).state === 2, "assign moves the job to ASSIGNED");
  ok(m.job(id).provider === PROV, "the assigned provider is recorded");

  const resultHash = ethers.keccak256(ethers.toUtf8Bytes("result-bytes"));
  m.confirmDelivery("0xSCHEDULER", id, resultHash);
  ok(m.job(id).state === 3, "confirmDelivery moves the job to DELIVERED");
  ok(m.job(id).resultHash === resultHash, "the result hash is committed on chain");

  // Real protocol numbers, read from the contract artifact earlier.
  const split = m.settle("0xSCHEDULER", id, ethers.parseEther("5"), 300, 1000, 3000);
  ok(m.job(id).state === 4, "settle moves the job to SETTLED");

  // 5 OMC, 3% fee = 0.15, then 10% OMC discount -> 0.135
  const expectedFee = ethers.parseEther("0.135");
  ok(split.fee === expectedFee, "fee is 3% with the 10% OMC discount applied",
     "got " + ethers.formatEther(split.fee));
  ok(split.toBurn === ethers.parseEther("0.0405"), "30% of the fee is burned",
     "got " + ethers.formatEther(split.toBurn));
  ok(split.toRewards === ethers.parseEther("0.0945"), "70% of the fee goes to the reward pool",
     "got " + ethers.formatEther(split.toRewards));
  ok(split.toProvider === ethers.parseEther("4.865"), "the provider receives amount minus fee",
     "got " + ethers.formatEther(split.toProvider));
  ok(split.fee + split.toProvider === ethers.parseEther("5"), "the split sums back to the amount");
  ok(m.escrow.get(REQ) === 0n, "escrow is fully released on settle");
}

/* -------- 6. store/SDK agreement on the digest -------------------------- */

/**
 * Load the SHIPPING browser controller and pull its keccak256 out. Testing a
 * copy of the algorithm would prove nothing about the page; loading the real
 * file is the only way this assertion means anything. The file is an IIFE that
 * expects a few globals it may not find, so it is evaluated in a sandbox with
 * the handful of stubs it touches at load time.
 */
function loadShippingKeccak() {
  const src = fs.readFileSync(
    path.resolve(__dirname, "..", "..", "omc-website", "assets", "js", "ai-tools-job.js"),
    "utf8");
  const win = {};
  const doc = { getElementById: () => null, addEventListener: () => {}, createElement: () => ({}) };
  const fn = new Function("window", "document", "TextEncoder", "navigator", "console", src);
  fn(win, doc, TextEncoder, { userAgent: "node" }, console);
  if (!win.OMCAiJob || typeof win.OMCAiJob.keccak256 !== "function") {
    throw new Error("ai-tools-job.js did not expose OMCAiJob.keccak256");
  }
  return win.OMCAiJob.keccak256;
}

section("6. page and service agree on the digest");
{
  const keccak256 = loadShippingKeccak();
  const bytes = Buffer.from("shared-fixture");
  ok(keccak256(bytes) === store.hashBytes(bytes),
     "the service hash equals the shipping page's keccak");

  const fixtures = ["", "a", "abc", "x".repeat(135), "y".repeat(136), "z".repeat(1000),
                    "q".repeat(271), "r".repeat(272)];
  let allOk = true;
  for (const f of fixtures) {
    const ref = ethers.keccak256(ethers.toUtf8Bytes(f));
    const mine = keccak256(Buffer.from(f, "utf8"));
    if (ref !== mine) { allOk = false; console.log("     mismatch at len " + f.length); }
  }
  ok(allOk, "all fixtures agree with ethers, including the 135/271-byte rate boundaries");

  // And the specHash the page folds must equal the one the service folds.
  const imgHash = ethers.keccak256(Buffer.from("img"));
  const pre = "omc-ai-tools/spec/v1|" + imgHash + "|1|0|0";
  ok(keccak256(Buffer.from(pre, "utf8")) === store.specHashFor(imgHash, 1, 0, 0),
     "the page and the service fold specHash identically");
}

console.log("\n" + "=".repeat(60));
console.log("wiring check: " + pass + " passed, " + fail + " failed");
console.log("=".repeat(60));
process.exit(fail === 0 ? 0 : 1);
