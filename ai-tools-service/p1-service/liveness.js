/**
 * OMC AI Tools · P1 · worker liveness registry
 *
 * The chain can tell you a node is *eligible*. It cannot tell you that anything
 * is actually running behind that address. isEligible() folds in stake, tier
 * and overdue — every one of which stays true for a node whose operator has
 * walked away with the process stopped. Eligible and alive are different
 * questions, and only the second one decides whether a job will come back.
 *
 * This file answers the second question, out of band. A running worker
 * announces itself, with a timestamp, on every sweep; the scheduler counts an
 * address as live only while the announcement is younger than TTL. Nothing
 * here is authoritative — it is a hint, and it is treated as one:
 *
 *   live candidate exists -> assign to the least-loaded live one
 *   no live candidate     -> do not assign at all (see provider-select.js)
 *
 * Transport is a single JSON file under .p1-jobs/, the same out-of-band
 * directory the image bytes use. Each write goes to a temp file and is then
 * renamed, so a reader never sees a half-written registry.
 *
 * Cross-host deployments cannot share a file. For those, list the addresses in
 * OMC_LIVE_NODES (comma separated); they are treated as live without one.
 *
 * OMC_LIVENESS_FILE relocates the registry itself, which is how the test
 * harness exercises this module without touching the deployment's real file.
 *
 * Nothing in here needs a key or a chain connection, so it is testable in
 * isolation — which is exactly what offline-wiring-check.js does.
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const store = require("./store.js");

/** An announcement older than this stops counting as live. */
const TTL_MS = Number(process.env.OMC_WORKER_TTL_MS || 90 * 1000);

function registryPath() {
  return process.env.OMC_LIVENESS_FILE || path.join(store.ROOT, "workers.json");
}

function nowMs() { return Date.now(); }

/** Read the registry. A missing or unparseable file means "nobody is live". */
function readAll() {
  const p = registryPath();
  if (!fs.existsSync(p)) return {};
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    const w = j && typeof j === "object" ? j.workers : null;
    return w && typeof w === "object" ? w : {};
  } catch (e) {
    return {};
  }
}

function writeAll(workers) {
  const p = registryPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + "." + process.pid + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify({ at: new Date().toISOString(), workers }, null, 2));
  fs.renameSync(tmp, p);          // atomic swap: readers see old or new, never torn
}

/** Addresses declared live by environment (for workers on other hosts). */
function allowlist() {
  return String(process.env.OMC_LIVE_NODES || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * Record that a worker for `addr` is running. `extra` is free-form context
 * (tier, mode, note) that shows up in the scheduler's report; it never affects
 * the decision.
 */
function announce(addr, extra, ttlMs) {
  const ttl = ttlMs === undefined ? TTL_MS : ttlMs;
  const w = readAll();
  const key = String(addr).toLowerCase();
  w[key] = Object.assign({}, w[key], {
    address: String(addr),
    at: new Date().toISOString(),
    atMs: nowMs(),
    pid: process.pid,
    host: os.hostname(),
  }, extra || {});
  // Keep the file from growing without bound if a host vanishes.
  for (const k of Object.keys(w)) {
    if (nowMs() - Number((w[k] || {}).atMs || 0) > ttl * 4) delete w[k];
  }
  writeAll(w);
  return w[key];
}

/** Withdraw this worker's announcement (a one-shot run is not a live worker). */
function forget(addr) {
  const p = registryPath();
  if (!fs.existsSync(p)) return;             // nothing to withdraw, do not create
  const w = readAll();
  delete w[String(addr).toLowerCase()];
  writeAll(w);
}

/** Every address currently considered live: fresh announcements + allowlist. */
function liveAddresses(ttlMs) {
  const ttl = ttlMs === undefined ? TTL_MS : ttlMs;
  const w = readAll();
  const out = [];
  for (const k of Object.keys(w)) {
    const v = w[k] || {};
    if (nowMs() - Number(v.atMs || 0) <= ttl) out.push(v.address || k);
  }
  for (const a of allowlist()) {
    if (!out.some((x) => x.toLowerCase() === a.toLowerCase())) out.push(a);
  }
  return out;
}

function isLive(addr, ttlMs) {
  const want = String(addr).toLowerCase();
  return liveAddresses(ttlMs).some((a) => a.toLowerCase() === want);
}

/** Full picture for the scheduler's periodic report. */
function snapshot(ttlMs) {
  const ttl = ttlMs === undefined ? TTL_MS : ttlMs;
  const w = readAll();
  const live = [], stale = [];
  for (const k of Object.keys(w)) {
    const v = w[k] || {};
    const ageS = Math.round((nowMs() - Number(v.atMs || 0)) / 1000);
    const row = { address: v.address || k, ageS, pid: v.pid, host: v.host, mode: v.mode };
    (ageS * 1000 <= ttl ? live : stale).push(row);
  }
  return { ttlMs: ttl, live, stale, allowlist: allowlist(), path: registryPath() };
}

module.exports = {
  TTL_MS, registryPath, allowlist,
  announce, forget, liveAddresses, isLive, snapshot,
};
