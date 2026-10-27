/**
 * The credit ledger (002): airdrop_allocations.
 *
 * Entries are events; allocations are money owed. These tests check the three
 * things that make the table worth having instead of a view: the split is
 * correct, the split is enforced by the database, and a frozen row cannot move.
 *
 *   cd db && npm test
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { Wallet } from "ethers";
import { createDb } from "./helpers.mjs";

const require = createRequire(import.meta.url);
const msg = require("../../website/api/_lib/entry-message.js");
const store = require("../../website/api/_lib/store.js");
/* Everything below derives from the published parameters, so changing
   perEntry in contracts/params.json fails this suite until the SQL, the
   API and the tests agree — the class of bug that made these numbers rot
   the first time. */
const PARAMS = require("../../contracts/params.json");
const PER_ENTRY = PARAMS.airdrop.perEntry;

const DAY1 = new Date("2026-10-27T04:00:00Z");
const DAY2 = new Date("2026-10-28T04:00:00Z");
const DAY3 = new Date("2026-10-29T04:00:00Z");

async function signed(wallet, { day, referrer = null }) {
  const message = msg.buildMessage({ address: wallet.address, day, referrer, nonce: "0123456789abcdef" });
  return { message, signature: await wallet.signMessage(message) };
}

async function register(db, wallet, when, { referrer = null } = {}) {
  const day = msg.dayKeyUTC8(when);
  const s = await signed(wallet, { day, referrer });
  return store.registerEntry(db, {
    address: wallet.address,
    referrer,
    message: s.message,
    signature: s.signature,
    now: when,
  });
}

async function allocation(db, address) {
  const { rows } = await db.query("select * from airdrop_allocations where address = $1", [address.toLowerCase()]);
  return rows[0] || null;
}

test("002 applies on top of 001 and creates its objects", async () => {
  const db = await createDb();
  /* Whole list rather than a subset: a new migration that fails to run has to
     break a test, not slip through. */
  assert.deepEqual(db.appliedMigrations, [
    "001_airdrop_entries.sql",
    "002_airdrop_allocations.sql",
    "003_airdrop_per_entry_40.sql",
  ]);
  const t = await db.query("select to_regclass('public.airdrop_allocations') as t, to_regclass('public.airdrop_totals') as v");
  assert.equal(t.rows[0].t, "airdrop_allocations");
  assert.equal(t.rows[0].v, "airdrop_totals");
  await db.close();
});

test("a registration writes a credit row with the split already resolved", async () => {
  const db = await createDb();
  const w = Wallet.createRandom();

  const r = await register(db, w, DAY1);
  assert.equal(r.code, "OK");
  assert.equal(r.allocation.total, PER_ENTRY);
  assert.equal(r.allocation.baseEntries, 1);

  await register(db, w, DAY2);
  const row = await allocation(db, w.address);
  assert.equal(Number(row.base_entries), 2);
  assert.equal(Number(row.referral_entries), 0);
  assert.equal(Number(row.base_amount), 2 * PER_ENTRY);
  assert.equal(Number(row.bonus_amount), 0);
  assert.equal(Number(row.total_amount), 2 * PER_ENTRY);
  assert.equal(Number(row.per_entry), PER_ENTRY);
  assert.equal(row.status, "accruing");
  assert.equal(row.frozen_at, null);
  await db.close();
});

test("the inviter's credit row picks up the bonus, the invitee's does not", async () => {
  const db = await createDb();
  const alice = Wallet.createRandom();
  const bob = Wallet.createRandom();

  await register(db, alice, DAY1);
  const rb = await register(db, bob, DAY1, { referrer: alice.address });
  assert.equal(rb.credited, true);

  const a = await allocation(db, alice.address);
  assert.equal(Number(a.base_entries), 1, "alice's own entry");
  assert.equal(Number(a.referral_entries), 1, "plus the invite");
  assert.equal(Number(a.total_amount), 2 * PER_ENTRY);

  const b = await allocation(db, bob.address);
  assert.equal(Number(b.base_entries), 1);
  assert.equal(Number(b.referral_entries), 0, "being invited pays nothing by itself");
  assert.equal(Number(b.total_amount), PER_ENTRY);
  await db.close();
});

test("refreshing twice changes nothing", async () => {
  const db = await createDb();
  const w = Wallet.createRandom();
  await register(db, w, DAY1);

  const first = await allocation(db, w.address);
  await db.query("select refresh_airdrop_allocation($1)", [w.address.toLowerCase()]);
  await db.query("select refresh_airdrop_allocation($1)", [w.address.toLowerCase()]);
  const again = await allocation(db, w.address);

  assert.equal(Number(again.total_amount), Number(first.total_amount));
  assert.equal(Number(again.total_entries), Number(first.total_entries));
  await db.close();
});

test("the database will not store a total that does not add up", async () => {
  const db = await createDb();
  await assert.rejects(
    () => db.query(
      `insert into airdrop_allocations
         (address, base_entries, referral_entries, total_entries, per_entry, base_amount, bonus_amount, total_amount)
       values ('0x9999999999999999999999999999999999999999', 2, 1, 3, 20, 40, 20, 61)`
    ),
    /airdrop_allocations_total_amount_check|violates check constraint/i
  );
  await assert.rejects(
    () => db.query(
      `insert into airdrop_allocations
         (address, base_entries, referral_entries, total_entries, per_entry, base_amount, bonus_amount, total_amount)
       values ('0x9999999999999999999999999999999999999999', 2, 1, 4, 20, 40, 20, 60)`
    ),
    /total_entries|violates check constraint/i
  );
  await db.close();
});

test("freezing closes the books, and later entries do not move the number", async () => {
  const db = await createDb();
  const w = Wallet.createRandom();
  const other = Wallet.createRandom();

  await register(db, w, DAY1);
  await register(db, other, DAY1);

  const frozen = await db.query("select freeze_airdrop_allocations() as n");
  assert.equal(Number(frozen.rows[0].n), 2);

  const before = await allocation(db, w.address);

  // A second day's entry still lands in the event log, but the credit is fixed.
  const r = await register(db, w, DAY2);
  assert.equal(r.code, "OK");
  assert.equal(r.allocation.status, "frozen");
  assert.equal(r.allocation.total, PER_ENTRY, "the frozen amount is what the claim will pay");

  const after = await allocation(db, w.address);
  assert.equal(Number(after.total_amount), Number(before.total_amount));
  assert.notEqual(after.frozen_at, null);

  // Freezing again is a no-op, not an error.
  const again = await db.query("select freeze_airdrop_allocations() as n");
  assert.equal(Number(again.rows[0].n), 0);
  await db.close();
});

test("the public totals view reports wallets, entries and OMC owed", async () => {
  const db = await createDb();
  const alice = Wallet.createRandom();
  const bob = Wallet.createRandom();

  await register(db, alice, DAY1);
  await register(db, alice, DAY2);
  await register(db, bob, DAY1, { referrer: alice.address });

  const { rows } = await db.query("select * from airdrop_totals");
  const t = rows[0];
  assert.equal(Number(t.wallets), 2);
  // Alice: two own entries + one referral credit. Bob: one own entry. The
  // referral credit is money owed, so it counts here — 4 rows, not the three
  // signed entries that produced them.
  assert.equal(Number(t.entries), 4);
  assert.equal(Number(t.amount), 4 * PER_ENTRY);
  assert.equal(t.is_frozen, false);
  await db.close();
});

test("refresh rejects an address that is not lower-case hex", async () => {
  const db = await createDb();
  await assert.rejects(
    () => db.query("select refresh_airdrop_allocation($1)", ["0xABCDEF"]),
    /lower-case/
  );
  await db.close();
});

test("status carries the allocation, so the page can show what is owed", async () => {
  const db = await createDb();
  const w = Wallet.createRandom();
  await register(db, w, DAY1);
  await register(db, w, DAY2);
  await register(db, w, DAY3);

  const s = await store.getStatus(db, w.address, DAY3);
  assert.ok(s.allocation, "allocation should be present once 002 is applied");
  assert.equal(s.allocation.totalEntries, 3);
  assert.equal(s.allocation.total, 3 * PER_ENTRY);
  await db.close();
});
