/**
 * OMC AI Tools · P1 · shared chain access
 *
 * One place that knows the addresses, the ABI and the RPC list. Both the
 * scheduler and the node import this so they can never drift apart.
 *
 * The ABIs are loaded from the compiled artifacts rather than hand-typed.
 * Hand-typed ABIs are how you end up calling nodeAt() on a contract that only
 * exposes nodeAddresses() and silently getting a revert.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const { ethers } = require("ethers");

const ROOT = path.resolve(__dirname, "..", "..");             // workspace root
const REPO = path.join(ROOT, "omc-network-repo");
const ART = path.join(REPO, "contracts", "artifacts");
const DEPLOYMENTS = path.join(REPO, "contracts", "deployments", "bsc-testnet.json");

const RPCS = [
  "https://bsc-testnet-rpc.publicnode.com",
  "https://data-seed-prebsc-1-s1.bnbchain.org:8545",
  "https://bsc-testnet.public.blastapi.io",
];

const CHAIN_ID = 97;

/* JobState enum, mirrored from OMCComputeMarket.sol. Order matters. */
const JOB_STATE = [
  "NONE", "ESCROWED", "ASSIGNED", "DELIVERED",
  "SETTLED", "DISPUTED", "REFUNDED", "CANCELLED",
];

/* FailReason enum, mirrored from OMCComputeMarket.sol. */
const FAIL_REASON = { TIMEOUT: 0, OFFLINE: 1, BAD_OUTPUT: 2, FRAUD: 3 };

/* Verify policies and protection levels, mirrored from the contract. */
const VERIFY_POLICY = { SPOT_CHECK: 0, FULL: 1 };
const PROTECTION = { STANDARD: 0, STRICT: 1 };

function readJson(p) { return JSON.parse(fs.readFileSync(p, "utf8")); }

function deployments() { return readJson(DEPLOYMENTS); }

function artifact(name) { return readJson(path.join(ART, name + ".json")); }

/**
 * Read the deployer key from the shared secrets file. Never logged, never
 * written into the repo.
 */
function secrets() {
  const p = path.join(os.homedir(), ".workbuddy", "omc-secrets.env");
  const out = {};
  if (!fs.existsSync(p)) return out;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

/** First RPC that answers with the right chain id wins. */
async function provider() {
  for (const url of RPCS) {
    try {
      const p = new ethers.JsonRpcProvider(url, CHAIN_ID, { staticNetwork: true });
      const net = await p.getNetwork();
      if (net.chainId === BigInt(CHAIN_ID)) return p;
    } catch (e) { /* try next */ }
  }
  throw new Error("no working BSC testnet RPC in " + RPCS.join(", "));
}

/** Scheduler wallet (the deployer key). Holds the only key allowed to assign/settle. */
async function schedulerWallet() {
  const env = secrets();
  const pk = env.OMC_TESTNET_DEPLOYER_PRIVATE_KEY;
  if (!pk) throw new Error("OMC_TESTNET_DEPLOYER_PRIVATE_KEY missing from ~/.workbuddy/omc-secrets.env");
  const p = await provider();
  return new ethers.Wallet(pk, p);
}

async function market(signerOrProvider) {
  const d = deployments();
  return new ethers.Contract(d.market, artifact("OMCComputeMarket").abi, signerOrProvider);
}

async function staking(signerOrProvider) {
  const d = deployments();
  return new ethers.Contract(d.staking, artifact("OMCStaking").abi, signerOrProvider);
}

async function token(signerOrProvider) {
  const d = deployments();
  return new ethers.Contract(d.token, artifact("OMCTestToken").abi, signerOrProvider);
}

/** Human-readable one-liner for a job struct. */
function describeJob(job) {
  return "#" + job.id + " " + jobState(job.state) +
    " tier=" + job.hardwareTier +
    " paid=" + ethers.formatEther(job.paid) +
    " spec=" + job.specHash.slice(0, 10) + "…";
}

function jobState(s) { return JOB_STATE[Number(s)] || ("UNKNOWN(" + s + ")"); }

/** Normalise the 15-field tuple from job()/getJob() into a named object. */
function normalizeJob(id, j) {
  return {
    id: Number(id),
    requester: j.requester !== undefined ? j.requester : j[0],
    provider: j.provider !== undefined ? j.provider : j[1],
    hardwareTier: Number(j.hardwareTier !== undefined ? j.hardwareTier : j[2]),
    verifyPolicy: Number(j.verifyPolicy !== undefined ? j.verifyPolicy : j[3]),
    protection: Number(j.protection !== undefined ? j.protection : j[4]),
    state: Number(j.state !== undefined ? j.state : j[5]),
    maxPrice: j.maxPrice !== undefined ? j.maxPrice : j[6],
    paid: j.paid !== undefined ? j.paid : j[7],
    feePaid: j.feePaid !== undefined ? j.feePaid : j[8],
    createdAt: Number(j.createdAt !== undefined ? j.createdAt : j[9]),
    deadline: Number(j.deadline !== undefined ? j.deadline : j[10]),
    deliveredAt: Number(j.deliveredAt !== undefined ? j.deliveredAt : j[11]),
    paidInOMC: !!(j.paidInOMC !== undefined ? j.paidInOMC : j[12]),
    specHash: j.specHash !== undefined ? j.specHash : j[13],
    resultHash: j.resultHash !== undefined ? j.resultHash : j[14],
  };
}

/** Read one job as a named object. */
async function readJob(mkt, id) {
  const raw = await mkt.job(id);
  return normalizeJob(id, raw);
}

/** Read every job from 1..jobCount, newest last. */
async function readAllJobs(mkt) {
  const n = Number(await mkt.jobCount());
  const out = [];
  for (let id = 1; id <= n; id++) out.push(await readJob(mkt, id));
  return out;
}

module.exports = {
  ROOT, REPO, ART, DEPLOYMENTS, RPCS, CHAIN_ID,
  JOB_STATE, FAIL_REASON, VERIFY_POLICY, PROTECTION,
  deployments, artifact, secrets, provider,
  schedulerWallet, market, staking, token,
  jobState, describeJob, normalizeJob, readJob, readAllJobs,
};
