/**
 * Airdrop ledger tests.
 *
 * These run against PGlite — a real Postgres compiled to WASM — so the SQL in
 * db/migrations is executed for real (CHECK constraints, partial unique
 * indexes, advisory locks), not simulated.
 *
 *   cd db && npm install && npm test
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { Wallet, verifyMessage } from "ethers";
import { createDb } from "./helpers.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const msg = require("../../website/api/_lib/entry-message.js");
const store = require("../../website/api/_lib/store.js");

const DAY1 = new Date("2026-10-27T04:00:00Z"); // 12:00 UTC+8 on 2026-10-27
const DAY2 = new Date("2026-10-28T04:00:00Z");
const DAYS = [DAY1, DAY2, new Date("2026-10-29T04:00:00Z"), new Date("2026-10-30T04:00:00Z"),
  new Date("2026-10-31T04:00:00Z"), new Date("2026-11-01T04:00:00Z")];

async function freshDb() {
  return createDb();
}

async function signed(wallet, { day, referrer = null, nonce = "0123456789abcdef" }) {
  const message = msg.buildMessage({ address: wallet.address, day, referrer, nonce });
  const signature = await wallet.signMessage(message);
  return { message, signature };
}

test("migration creates the table, indexes and view", async () => {
  const db = await freshDb();
  const t = await db.query("select to_regclass('public.airdrop_entries') as t");
  assert.equal(t.rows[0].t, "airdrop_entries");
  const v = await db.query("select to_regclass('public.airdrop_wallet_status') as v");
  assert.equal(v.rows[0].v, "airdrop_wallet_status");
  const idx = await db.query(
    "select indexname from pg_indexes where tablename = 'airdrop_entries' order by indexname"
  );
  const names = idx.rows.map((r) => r.indexname);
  assert.ok(names.includes("airdrop_one_entry_per_day"));
  assert.ok(names.includes("airdrop_referral_pair_once"));
  await db.close();
});

test("canonical message parses, and structural rewrites are rejected", async () => {
  const address = "0x1111111111111111111111111111111111111111";
  const m = msg.buildMessage({ address, day: "2026-10-27", referrer: null, nonce: "0123456789abcdef" });
  const parsed = msg.parseMessage(m);
  assert.equal(parsed.address, address);
  assert.equal(parsed.day, "2026-10-27");
  assert.equal(parsed.referrer, null);

  // Anything appended, reworded or with a different purpose line is not the
  // canonical message and must not parse.
  assert.equal(msg.parseMessage(m + "\nextra line"), null);
  assert.equal(msg.parseMessage(m.replace("airdrop entry", "withdrawal")), null);
  assert.equal(msg.parseMessage(m.replace("Nonce: 0123456789abcdef", "Nonce: zzz")), null);

  // Field substitution keeps the message self-consistent, so parsing alone
  // cannot catch it — the signature is what binds the fields. Prove both
  // halves: parsing accepts the edit, verification rejects it.
  const wallet = Wallet.createRandom();
  const signedMsg = msg.buildMessage({ address: wallet.address, day: "2026-10-27", referrer: null, nonce: "0123456789abcdef" });
  const signature = await wallet.signMessage(signedMsg);
  const moved = signedMsg.replace("Day: 2026-10-27", "Day: 2026-10-28");
  assert.notEqual(msg.parseMessage(moved), null);
  assert.notEqual(verifyMessage(moved, signature).toLowerCase(), wallet.address.toLowerCase());
});

test("day key rolls over at 00:00 UTC+8", () => {
  assert.equal(msg.dayKeyUTC8(new Date("2026-10-27T15:59:00Z")), "2026-10-27"); // 23:59 UTC+8
  assert.equal(msg.dayKeyUTC8(new Date("2026-10-27T16:00:00Z")), "2026-10-28"); // 00:00 UTC+8
});

test("signature recovers to the signer, and not to anyone else", async () => {
  const alice = Wallet.createRandom();
  const mallory = Wallet.createRandom();
  const { message, signature } = await signed(alice, { day: "2026-10-27" });
  assert.equal(verifyMessage(message, signature).toLowerCase(), alice.address.toLowerCase());
  assert.notEqual(verifyMessage(message, signature).toLowerCase(), mallory.address.toLowerCase());
});

test("first entry is recorded, a second one on the same day is refused", async () => {
  const db = await freshDb();
  const alice = Wallet.createRandom();
  const day = msg.dayKeyUTC8(DAY1);
  const { message, signature } = await signed(alice, { day });

  const first = await store.registerEntry(db, {
    address: alice.address, message, signature, now: DAY1,
  });
  assert.equal(first.code, "OK");
  assert.equal(first.base, 1);
  assert.equal(first.today, 1);
  assert.equal(first.total, 1);
  assert.equal(first.amount, 20);

  const again = await store.registerEntry(db, {
    address: alice.address, message, signature, now: DAY1,
  });
  assert.equal(again.code, "LIMIT_DAILY");

  const rows = await db.query("select count(*)::int as n from airdrop_entries");
  assert.equal(rows.rows[0].n, 1);
  await db.close();
});

test("one entry per day across days, capped at five total", async () => {
  const db = await freshDb();
  const alice = Wallet.createRandom();

  for (let i = 0; i < 5; i++) {
    const day = msg.dayKeyUTC8(DAYS[i]);
    const { message, signature } = await signed(alice, { day });
    const r = await store.registerEntry(db, {
      address: alice.address, message, signature, now: DAYS[i],
    });
    assert.equal(r.code, "OK", `entry ${i + 1} should be accepted`);
    assert.equal(r.base, i + 1);
  }

  const day = msg.dayKeyUTC8(DAYS[5]);
  const { message, signature } = await signed(alice, { day });
  const sixth = await store.registerEntry(db, {
    address: alice.address, message, signature, now: DAYS[5],
  });
  assert.equal(sixth.code, "LIMIT_TOTAL");
  assert.equal(sixth.base, 5);
  assert.equal(sixth.amount, 100); // 5 × 20 — the tier-2 staking minimum
  await db.close();
});

test("an invite credits the inviter once, and only for a first entry", async () => {
  const db = await freshDb();
  const alice = Wallet.createRandom();
  const bob = Wallet.createRandom();
  const day = msg.dayKeyUTC8(DAY1);

  // Alice joins first.
  const a = await signed(alice, { day });
  await store.registerEntry(db, { address: alice.address, message: a.message, signature: a.signature, now: DAY1 });

  // Bob joins through Alice's link.
  const b = await signed(bob, { day, referrer: alice.address });
  const rb = await store.registerEntry(db, {
    address: bob.address, referrer: alice.address, message: b.message, signature: b.signature, now: DAY1,
  });
  assert.equal(rb.code, "OK");
  assert.equal(rb.credited, true);

  const aStatus = await store.getStatus(db, alice.address, DAY1);
  assert.equal(aStatus.base, 1);
  assert.equal(aStatus.referral, 1);
  assert.equal(aStatus.total, 2);
  assert.equal(aStatus.amount, 40);

  // Bob joining again later must not re-credit the same invite.
  const day2 = msg.dayKeyUTC8(DAY2);
  const b2 = await signed(bob, { day: day2, referrer: alice.address });
  const rb2 = await store.registerEntry(db, {
    address: bob.address, referrer: alice.address, message: b2.message, signature: b2.signature, now: DAY2,
  });
  assert.equal(rb2.code, "OK");
  assert.equal(rb2.credited, false);

  const after = await store.getStatus(db, alice.address, DAY2);
  assert.equal(after.referral, 1);
  await db.close();
});

test("the database rejects malformed addresses even if the API is bypassed", async () => {
  const db = await freshDb();
  await assert.rejects(
    () => db.query(
      `insert into airdrop_entries (address, day_key, message, signature)
       values ('0xNOTHEX', '2026-10-27', 'm', 's')`
    ),
    /airdrop_entries_address_check|check constraint/i
  );
  await db.close();
});

test("status for an unknown wallet is empty, not an error", async () => {
  const db = await freshDb();
  const s = await store.getStatus(db, "0x" + "9".repeat(40), DAY1);
  assert.equal(s.total, 0);
  assert.equal(s.amount, 0);
  assert.equal(s.canParticipate, true);
  assert.equal(s.cap, 5);
  await db.close();
});
