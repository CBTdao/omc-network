#!/usr/bin/env node
/**
 * OMC AI Tools · P1 · evidence capture
 *
 * Turns the console output of the two rehearsals into a machine-checkable
 * record: every transaction hash they printed is re-fetched from the chain and
 * its receipt status confirmed, so the file it writes is evidence rather than a
 * log.
 *
 * The point is reproducibility. Anyone with the deployer key can rerun the
 * three commands below and get an artefact that names two jobs, two outcomes
 * and every transaction that produced them:
 *
 *   success path  createJob -> assign -> confirmDelivery -> settle
 *   failure path  createJob -> assign -> confirmDelivery -> fail  (bond refund)
 *
 * This script deliberately does NOT spawn the rehearsals itself. The sandbox
 * this runs under blocks a node process from spawning another one
 * (`spawnSync node.exe EBUSY`), so the runs are driven by the shell and this
 * script only parses and verifies what they wrote.
 *
 * Usage
 * -----
 *   # 1. drive the runs, with section markers the parser can split on
 *   cd omc-ai-tools
 *   NODE=... ; OUT=p1-service/evidence/run-$(date +%Y%m%d-%H%M%S).log
 *   printf '########## node-worker.js --once (heal heartbeat) ##########\n' >  "$OUT"
 *   $NODE p1-service/node-worker.js --once --no-infer                    >> "$OUT" 2>&1
 *   printf '\n########## e2e-rehearsal.js (success path) ##########\n'     >> "$OUT"
 *   $NODE p1-service/e2e-rehearsal.js --no-infer --price 5               >> "$OUT" 2>&1
 *   printf '\n########## e2e-failure.js (failure path) ##########\n'      >> "$OUT"
 *   $NODE p1-service/e2e-failure.js --price 5                            >> "$OUT" 2>&1
 *
 *   # 2. verify it against the chain and write the record
 *   $NODE p1-service/capture-evidence.js --parse "$OUT"
 *
 * Exit codes: 0 all transactions confirmed · 2 something did not confirm
 *             3 the log is unusable · 1 anything else
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const C = require("./chain.js");

const OUTDIR = path.join(__dirname, "evidence");
const EXPLORER = "https://testnet.bscscan.com/tx/";

const MARK = "##########";
const SECTIONS = [
  { key: "heal", match: /^\s*node-worker\.js/i },
  { key: "success", match: /^\s*e2e-rehearsal\.js/i },
  { key: "failure", match: /^\s*e2e-failure\.js/i },
];

function argOf(name, dflt) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return dflt;
}

/** `  stepName   tx: 0x…` -> { step, hash } */
function txsIn(text) {
  const out = [];
  const re = /^\s+([A-Za-z][A-Za-z0-9_]*)\s+tx:\s+(0x[0-9a-fA-F]{64})\s*$/gm;
  let m;
  while ((m = re.exec(text)) !== null) out.push({ step: m[1], hash: m[2] });
  return out;
}

function marker(t) {
  const v = t.match(/^\s+verifyResult\(\)\s*=\s*(\w+)/m);
  return v ? v[1] : null;
}

function outcomeOf(text) {
  const job = text.match(/new job id #(\d+)/);
  const state = text.match(/job #\d+ final state = (\w+)/);
  const paid = text.match(/^\s+paid\s+=\s+([\d.]+)/m);
  const provGot = text.match(/provider got\s+=\s+([\d.]+)/);
  const warn = /no live worker/i.test(text);
  return {
    jobId: job ? Number(job[1]) : null,
    finalState: state ? state[1] : null,
    paid: paid ? paid[1] : null,
    providerReceived: provGot ? provGot[1] : null,
    verificationGuard: marker(text),
    assignedWithOfflineOverride: warn,
    txs: txsIn(text),
  };
}

/** Split the run log on the `########## … ##########` banners. */
function split(text) {
  const parts = {};
  let cur = null;
  const buf = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.trim().startsWith(MARK)) {
      const label = line.replace(/^[\s#]+/, "").replace(/[\s#]+$/, "");
      const hit = SECTIONS.find((s) => s.match.test(label));
      if (cur) parts[cur] = buf.splice(0).join("\n");
      cur = hit ? hit.key : "other";
      buf.length = 0;
      continue;
    }
    if (cur) buf.push(line);
  }
  if (cur) parts[cur] = buf.join("\n");
  return parts;
}

async function verify(p, entry) {
  const rc = await p.getTransactionReceipt(entry.hash);
  if (!rc) return { ...entry, found: false };
  const tx = await p.getTransaction(entry.hash);
  return {
    ...entry,
    found: true,
    status: rc.status === 1 ? "success" : "reverted",
    block: rc.blockNumber,
    gasUsed: rc.gasUsed.toString(),
    from: rc.from,
    to: rc.to,
    method: tx && tx.data ? tx.data.slice(0, 10) : null,
    explorer: EXPLORER + entry.hash,
  };
}

async function main() {
  const logPath = argOf("--parse", null);
  if (!logPath) {
    console.error(
      "usage: node p1-service/capture-evidence.js --parse <run-log>\n\n" +
        "This script does not spawn the rehearsals: the sandbox blocks a node\n" +
        "process from starting another node process. Drive the three runs from\n" +
        "the shell (see the header of this file), then point --parse at the log."
    );
    process.exit(3);
  }
  if (!fs.existsSync(logPath)) {
    console.error("no such log: " + logPath);
    process.exit(3);
  }

  const text = fs.readFileSync(logPath, "utf8");
  const parts = split(text);
  const keys = Object.keys(parts).filter((k) => k !== "other");
  if (!parts.success || !parts.failure) {
    console.error(
      "log has no " + (!parts.success ? "success" : "failure") + " section.\n" +
        "sections found: " + (keys.join(", ") || "(none)") + "\n" +
        "the runs must be separated by `########## <script> ##########` banners"
    );
    process.exit(3);
  }

  const p = await C.provider();
  const d = C.deployments();

  const runs = [];
  for (const [label, key] of [["success path", "success"], ["failure path", "failure"]]) {
    const r = outcomeOf(parts[key]);
    r.label = label;
    const printed = r.txs;          // outcomeOf already collected the hashes
    r.txs = [];
    for (const t of printed) r.txs.push(await verify(p, t));
    runs.push(r);
  }

  const record = {
    capturedAt: new Date().toISOString(),
    chainId: C.CHAIN_ID,
    chain: "BNB Smart Chain Testnet",
    token: { address: d.token, faucet: "20 tOMC / day, 5 claims lifetime" },
    staking: d.staking,
    market: d.market,
    scheduler: (await C.schedulerWallet()).address,
    providerNode: parts.heal && /address (0x[0-9a-fA-F]{40})/.test(parts.heal)
      ? parts.heal.match(/address (0x[0-9a-fA-F]{40})/)[1]
      : null,
    whitepaperRefs: [
      "7.1 protocol fee 3% (2.7% when paid in OMC), split 30% burn / 70% reward pool",
      "7.5 slashing split 50% requester / 30% treasury / 20% burn",
      "7.6 a refund is the seller's debt, not a redistribution of someone else's deposit",
    ],
    notes: [
      "Both jobs were driven against the same live contracts by the same scheduler key.",
      "The provider is a real staked node (tier 1, 20 tOMC bond) registered on chain.",
      "Image bytes never touch the chain; only keccak256 digests do.",
      "No worker process was alive during either run. The node was heartbeated once " +
        "(node-worker.js --once) so it stays eligible, then left with nothing behind it. " +
        "That is deliberate: the failure path needs a provider that never delivers, and " +
        "a live worker would race the harness for the same job. The picker's allowOffline " +
        "override is therefore in force and says so in both logs.",
      "The provider side of both jobs is the harness's own stub, not a second process. " +
        "The separate claim that a node process can live behind this address is evidenced " +
        "by its heartbeat transactions, which are real on-chain writes.",
      "Inference ran with --no-infer: the delivered artefact is a deterministic stub. " +
        "The digest binding, the escrow, the fee and the slash are unaffected.",
    ],
    runs,
    totalTxs: runs.reduce((n, r) => n + r.txs.length, 0),
  };

  const st = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  fs.mkdirSync(OUTDIR, { recursive: true });
  const jsonPath = path.join(OUTDIR, "e2e-" + st + ".json");
  fs.writeFileSync(jsonPath, JSON.stringify(record, null, 2));
  fs.writeFileSync(path.join(OUTDIR, "e2e-latest.json"), JSON.stringify(record, null, 2));

  console.log("\n" + "=".repeat(78));
  console.log("VERIFIED ON CHAIN");
  console.log("=".repeat(78));
  let bad = 0;
  for (const r of record.runs) {
    console.log("\n" + r.label + "  (job #" + r.jobId + " -> " + r.finalState + ")");
    for (const t of r.txs) {
      if (!t.found || t.status !== "success") bad++;
      console.log(
        "  " + t.step.padEnd(18) +
          (t.found ? t.status.padEnd(9) : "MISSING  ") +
          " block " + String(t.block).padEnd(11) +
          t.hash
      );
    }
  }
  console.log("\n" + "-".repeat(78));
  console.log(
    record.totalTxs + " transactions, " + (record.totalTxs - bad) + " confirmed, " + bad + " bad"
  );
  console.log("record   " + jsonPath);
  console.log("stable   " + path.join(OUTDIR, "e2e-latest.json"));
  if (bad) process.exit(2);
}

main().catch((e) => {
  console.error("\nCAPTURE FAILED:", e.shortMessage || e.message);
  process.exit(1);
});
