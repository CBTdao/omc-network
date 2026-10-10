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
 *   7. liveness: announce / ttl / forget / allowlist / pruning behave as the
 *      scheduler assumes
 *   8. the provider picker refuses to hand a job to an eligible-but-dead node,
 *      and prefers a live one — the failure that would otherwise look green
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
const liveness = require("./liveness.js");
const P = require("./provider-select.js");

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

/* -------- 7. worker liveness registry ----------------------------------- */

/**
 * The registry is exercised against a relocated file (OMC_LIVENESS_FILE) so
 * the assertions never disturb a real deployment's workers.json.
 */
function freshRegistryPath(tag) {
  return path.join(os.tmpdir(), "omc-liveness-" + tag + "-" + process.pid + ".json");
}

section("7. worker liveness registry");
{
  const tmp = freshRegistryPath("a");
  process.env.OMC_LIVENESS_FILE = tmp;
  delete process.env.OMC_LIVE_NODES;

  const LIVE = "0xAAAA000000000000000000000000000000000001";
  const DEAD = "0xBBBB000000000000000000000000000000000002";

  ok(!liveness.isLive(LIVE), "an address nobody has announced is not live");
  ok(liveness.liveAddresses().length === 0, "an absent registry reads as empty");

  liveness.announce(LIVE, { tier: 1, mode: "test" });
  ok(fs.existsSync(tmp), "announcing creates the registry file");
  ok(liveness.isLive(LIVE), "an announced address is live");
  ok(liveness.isLive(LIVE.toLowerCase()), "liveness is address-case-insensitive");
  ok(!liveness.isLive(DEAD), "...and only that address");

  liveness.announce(LIVE, { tier: 1, mode: "infer" });
  const reg = JSON.parse(fs.readFileSync(tmp, "utf8"));
  ok(Object.keys(reg.workers).length === 1, "re-announcing refreshes rather than duplicates");
  ok(reg.workers[LIVE.toLowerCase()].mode === "infer", "the refresh carries the new context");

  // Age the record past the default TTL by rewriting atMs directly.
  fs.writeFileSync(tmp, JSON.stringify({
    workers: { [LIVE.toLowerCase()]: { address: LIVE, atMs: Date.now() - 120 * 1000 } },
  }));
  ok(!liveness.isLive(LIVE), "an announcement older than the ttl stops counting as live");
  ok(liveness.isLive(LIVE, 300 * 1000), "a longer ttl brings it back — the ttl is the only knob");
  ok(liveness.snapshot().stale.length === 1, "snapshot separates stale from live");

  liveness.forget(LIVE);
  ok(!liveness.isLive(LIVE), "forget withdraws the announcement");

  process.env.OMC_LIVE_NODES = DEAD + ", 0xCCCC000000000000000000000000000000000003";
  ok(liveness.isLive(DEAD), "OMC_LIVE_NODES is honoured with no file entry (cross-host workers)");
  ok(liveness.liveAddresses().length === 2, "the allowlist adds on top of the file, not instead of it");
  ok(liveness.snapshot().allowlist.length === 2, "snapshot reports the allowlist it applied");
  delete process.env.OMC_LIVE_NODES;

  // Pruning: announce() drops entries older than 4x the ttl so a vanished host
  // cannot leave the file growing forever.
  fs.writeFileSync(tmp, JSON.stringify({
    workers: { [DEAD.toLowerCase()]: { address: DEAD, atMs: Date.now() - 10 * 60 * 1000 } },
  }));
  liveness.announce(LIVE, { tier: 1 }, 1000);
  ok(!(DEAD.toLowerCase() in JSON.parse(fs.readFileSync(tmp, "utf8")).workers),
     "announce prunes entries older than 4x the ttl");
  ok(liveness.isLive(LIVE, 1000), "the fresh entry survives the prune");

  fs.rmSync(tmp, { force: true });
  delete process.env.OMC_LIVENESS_FILE;
}

/* -------- 8. provider selection ------------------------------------------ */

/* Section 8 awaits the picker, and the rest of this file is plain CommonJS, so
   the async half is confined to its own IIFE rather than making the module ESM
   just to get a top-level await. */

(async () => {
  section("8. provider selection never feeds a dead node a job");
  {
    const tmp = freshRegistryPath("b");
    const NODE_A = "0xAAAA000000000000000000000000000000000001";   // light load, NOT running
    const NODE_B = "0xBBBB000000000000000000000000000000000002";   // heavy load, running

    const stubSk = {
      nodeCount: async () => 2,
      nodeAddresses: async (i) => [NODE_A, NODE_B][i],
      nodeSummary: async (a) => ({
        tier: 1n, stake: ethers.parseEther("20"), overdue: false,
        workUnits: a === NODE_A ? 0n : 5n,
      }),
    };
    const stubMkt = { isEligible: async () => true };

    // Nobody is running anything, and nothing in the registry says otherwise.
    process.env.OMC_LIVENESS_FILE = path.join(os.tmpdir(), "omc-liveness-absent-" + process.pid + ".json");
    delete process.env.OMC_LIVE_NODES;
    ok(!fs.existsSync(process.env.OMC_LIVENESS_FILE), "the absent-registry fixture really is absent");

    let pick = await P.pickProvider(stubMkt, stubSk, 1);
    ok(pick.addr === null, "with no live worker the picker refuses to assign at all");
    ok(/no live worker/.test(pick.reason), "and the reason names the real cause");
    ok(pick.rows.length === 2 && pick.rows.every((r) => r.eligible && !r.live),
       "the decision is backed by a per-node breakdown the operator can read");

    pick = await P.pickProvider(stubMkt, stubSk, 1, { allowOffline: true });
    ok(pick.addr === NODE_A, "allowOffline falls back to the least-loaded eligible node");
    ok(pick.warned === true, "the fallback is flagged so it is never a silent choice");

    // Now start a worker on the heavy node: it must win despite the worse load.
    process.env.OMC_LIVENESS_FILE = tmp;
    liveness.announce(NODE_B, { tier: 1, mode: "test" });
    pick = await P.pickProvider(stubMkt, stubSk, 1);
    ok(pick.addr === NODE_B, "a live worker beats a lighter but unattended node");
    ok(pick.picked.live === true, "the pick is recorded as live");

    liveness.announce(NODE_A, { tier: 1, mode: "test" });
    pick = await P.pickProvider(stubMkt, stubSk, 1);
    ok(pick.addr === NODE_A, "among live workers the least-loaded one wins (load spreads)");

    // An empty registry is a different failure and must say so.
    const emptySk = Object.assign({}, stubSk, { nodeCount: async () => 0 });
    pick = await P.pickProvider(stubMkt, emptySk, 1);
    ok(pick.addr === null && /no node is eligible/.test(pick.reason),
       "zero registered nodes is reported as an eligibility problem, not a liveness one");

    // A tier nobody can serve must not fall back to a lower-tier node.
    const stubMktStrict = { isEligible: async (a, t) => t === 1 };
    pick = await P.pickProvider(stubMktStrict, stubSk, 3);
    ok(pick.addr === null && /no node is eligible for tier 3/.test(pick.reason),
       "a tier with no eligible node reports the tier it could not fill");

    fs.rmSync(tmp, { force: true });
    delete process.env.OMC_LIVENESS_FILE;
  }

  console.log("\n" + "=".repeat(60));
  console.log("wiring check: " + pass + " passed, " + fail + " failed");
  console.log("=".repeat(60));
  process.exit(fail === 0 ? 0 : 1);
})();
