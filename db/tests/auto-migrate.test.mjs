/**
 * The deployment path, tested as a user experiences it: a database exists and
 * nothing has been applied to it. One request must be enough.
 *
 * This is the test that stops "works on my machine" from coming back — the
 * previous flow needed someone to run psql against a connection string before
 * the API would work, which is a step that rots silently.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { PGlite } from "@electric-sql/pglite";

const require = createRequire(import.meta.url);
const migrateLib = require("../../website/api/_lib/migrate.js");

/* The list comes from the bundle that ships, so adding a migration cannot leave
   a stale expectation behind — the failure mode this file exists to catch. */
const BUNDLED = require("../../website/api/_lib/schema.generated").map((m) => m.filename);
const ALL = BUNDLED;

const EMPTY = new PGlite();

test("a virgin database is migrated by the first ensureSchema call", async () => {
  migrateLib.resetSchemaCache();

  const before = await EMPTY.query(
    `select table_name from information_schema.tables
      where table_schema = 'public' and table_name like 'airdrop%'`
  );
  assert.equal(before.rows.length, 0, "the database must start empty");

  const out = await migrateLib.ensureSchema(EMPTY);
  assert.deepEqual(out.applied, ALL);
  assert.equal(out.cached, false);

  const after = await EMPTY.query(
    `select table_name from information_schema.tables
      where table_schema = 'public' and table_name like 'airdrop%'
      order by table_name`
  );
  const names = after.rows.map((r) => r.table_name);
  for (const t of ["airdrop_allocations", "airdrop_entries", "airdrop_totals", "airdrop_wallet_status"]) {
    assert.ok(names.includes(t), "missing " + t + " — got " + names.join(", "));
  }
});

test("a second call is free and applies nothing", async () => {
  const out = await migrateLib.ensureSchema(EMPTY);
  assert.deepEqual(out.applied, []);
  assert.equal(out.cached, true);
  assert.equal(migrateLib.isEnsured(), true);
});

test("the migration ledger records what ran, and a fresh process re-checks it", async () => {
  const { rows } = await EMPTY.query("select filename from schema_migrations order by filename");
  assert.deepEqual(
    rows.map((r) => r.filename),
    ALL
  );

  /* Simulate a cold start: new process, same database. Nothing is re-applied. */
  migrateLib.resetSchemaCache();
  const out = await migrateLib.ensureSchema(EMPTY);
  assert.deepEqual(out.applied, []);
  assert.equal(out.cached, false);
});

test("the ledger is the contract: a database that already has tables but no ledger still converges", async () => {
  /* Someone ran the .sql by hand, or an older deployment predates the ledger. */
  const db = new PGlite();
  migrateLib.resetSchemaCache();
  await migrateLib.ensureSchema(db);

  await db.query("drop table schema_migrations");
  migrateLib.resetSchemaCache();
  const out = await migrateLib.ensureSchema(db);
  assert.deepEqual(out.applied, ALL);

  const { rows } = await db.query("select count(*)::int as n from airdrop_entries");
  assert.equal(rows[0].n, 0, "re-applying idempotent DDL must not destroy rows");
  await db.close();
});
