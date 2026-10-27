/**
 * End-to-end tests for the airdrop HTTP handlers.
 *
 * The store is already covered; this file covers what only the handler does:
 * rebuilding the signed message, recovering the signer, and rejecting a
 * signature that belongs to a different day or a different address.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { Wallet } from "ethers";
import { createDb } from "./helpers.mjs";

const require = createRequire(import.meta.url);

const msgLib = require("../../website/api/_lib/entry-message.js");
const dbLib = require("../../website/api/_lib/db.js");
const migrateLib = require("../../website/api/_lib/migrate.js");
const entryHandler = require("../../website/api/airdrop/entry.js");
const summaryHandler = require("../../website/api/airdrop/summary.js");

async function withDb() {
  const db = await createDb();
  dbLib.setPool(db);
  /* ensureSchema memoises per process; each test gets a fresh database. */
  migrateLib.resetSchemaCache();
  return db;
}

function call(handler, req) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      headers: {},
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      end(body) { resolve({ status: this.statusCode, body: JSON.parse(body || "{}") }); },
    };
    handler({ headers: {}, socket: {}, ...req }, res);
  });
}

async function signedBody(wallet, { day, referrer = null, address } = {}) {
  const message = msgLib.buildMessage({
    address: address || wallet.address,
    day,
    referrer,
    nonce: "0123456789abcdef",
  });
  const signature = await wallet.signMessage(message);
  return { address: address || wallet.address, message, signature };
}

test("a valid entry is accepted and shows up in the summary", async () => {
  const db = await withDb();
  const w = Wallet.createRandom();
  const body = await signedBody(w, { day: msgLib.dayKeyUTC8(new Date()) });

  const r = await call(entryHandler, { method: "POST", body });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.entries.total, 1);
  assert.equal(r.body.entries.amount, 20);

  const s = await call(summaryHandler, {
    method: "GET",
    query: { address: w.address },
  });
  assert.equal(s.status, 200);
  assert.equal(s.body.entries.total, 1);
  assert.equal(s.body.canParticipate, false);
  await db.close();
});

test("a second entry on the same day is refused with 409", async () => {
  const db = await withDb();
  const w = Wallet.createRandom();
  const day = msgLib.dayKeyUTC8(new Date());

  const first = await call(entryHandler, { method: "POST", body: await signedBody(w, { day }) });
  assert.equal(first.status, 200);

  const second = await call(entryHandler, { method: "POST", body: await signedBody(w, { day }) });
  assert.equal(second.status, 409);
  assert.equal(second.body.code, "LIMIT_DAILY");
  await db.close();
});

test("a signature that does not belong to the claimed address is rejected", async () => {
  const db = await withDb();
  const signer = Wallet.createRandom();
  const victim = Wallet.createRandom();
  const day = msgLib.dayKeyUTC8(new Date());

  // Signed by the attacker but claiming someone else's address.
  const body = await signedBody(signer, { day });
  body.address = victim.address;

  const r = await call(entryHandler, { method: "POST", body });
  assert.equal(r.status, 400);
  assert.equal(r.body.code, "BAD_MESSAGE"); // message names the signer, not the claim

  // Signed by the attacker for their own address, but the day was edited after
  // signing — the recovered signer no longer matches.
  const own = await signedBody(signer, { day });
  const forged = own.message.replace(/Day: .*\(UTC\+8\)/, "Day: " + day + " (UTC+8) ");
  const r2 = await call(entryHandler, {
    method: "POST",
    body: { ...own, message: forged },
  });
  assert.equal(r2.status, 400);
  await db.close();
});

test("yesterday's signature cannot register today's entry", async () => {
  const db = await withDb();
  const w = Wallet.createRandom();
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);
  const body = await signedBody(w, { day: msgLib.dayKeyUTC8(yesterday) });

  const r = await call(entryHandler, { method: "POST", body });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, "STALE_MESSAGE");
  await db.close();
});

test("the service reports its caps when called without an address", async () => {
  const db = await withDb();
  const r = await call(summaryHandler, { method: "GET", query: {} });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.caps.base, 5);
  assert.equal(r.body.caps.referral, 5);
  assert.equal(r.body.caps.perEntry, 20);
  await db.close();
});

test("with no database configured the API refuses instead of pretending", async () => {
  dbLib.setPool(null);
  const saved = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;
  const r = await call(summaryHandler, { method: "GET", query: {} });
  assert.equal(r.status, 503);
  assert.equal(r.body.code, "UNAVAILABLE");
  if (saved) process.env.DATABASE_URL = saved;
});
