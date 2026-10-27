#!/usr/bin/env node
/**
 * Apply db/migrations/*.sql to the database in DATABASE_URL, in order, once.
 *
 *   DATABASE_URL="postgres://..." node db/scripts/migrate.mjs           # apply
 *   DATABASE_URL="postgres://..." node db/scripts/migrate.mjs --plan    # list only
 *
 * Each file runs inside its own transaction together with the row that
 * records it, so a failed migration leaves the schema at the previous
 * version rather than half-applied. Re-running is safe.
 *
 * There is no down-migration on purpose: a schema that can be rolled back is
 * a schema whose rollback has never been tested. Take a dump before a change
 * instead.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = path.join(here, "..", "migrations");
const require = createRequire(import.meta.url);

const plan = process.argv.includes("--plan");
const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!url) {
  console.error(
    "DATABASE_URL is not set.\n\n" +
    "  Vercel Postgres / Neon / Supabase all give you a connection string that\n" +
    "  starts with postgres://. Export it and run this again:\n\n" +
    "    DATABASE_URL='postgres://...' node db/scripts/migrate.mjs\n"
  );
  process.exit(2);
}

const files = (await fs.readdir(MIGRATIONS)).filter((f) => f.endsWith(".sql")).sort();
if (!files.length) {
  console.error("No .sql files in db/migrations — nothing to do.");
  process.exit(1);
}

if (plan) {
  console.log("Would apply, in this order:");
  for (const f of files) console.log("  " + f);
  process.exit(0);
}

let pg;
try {
  pg = require("pg");
} catch (_) {
  console.error("The pg driver is missing. From the db/ directory: npm install");
  process.exit(2);
}

const local = /localhost|127\.0\.0\.1/.test(url);
const client = new pg.Client({
  connectionString: url,
  ssl: local || process.env.PGSSL === "disable" ? false : { rejectUnauthorized: false },
});

await client.connect();

try {
  await client.query(`
    create table if not exists schema_migrations (
      filename    text primary key,
      applied_at  timestamptz not null default now()
    )
  `);

  const { rows } = await client.query("select filename from schema_migrations");
  const done = new Set(rows.map((r) => r.filename));

  let applied = 0;
  for (const f of files) {
    if (done.has(f)) {
      console.log("  = " + f + " (already applied)");
      continue;
    }
    const sql = await fs.readFile(path.join(MIGRATIONS, f), "utf8");
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("insert into schema_migrations (filename) values ($1)", [f]);
      await client.query("commit");
      applied++;
      console.log("  + " + f);
    } catch (err) {
      await client.query("rollback").catch(() => {});
      console.error("  ! " + f + " failed: " + err.message);
      throw err;
    }
  }

  const tables = await client.query(
    `select table_name from information_schema.tables
      where table_schema = 'public' and table_name like 'airdrop%'
      order by table_name`
  );
  console.log("\nApplied " + applied + " migration(s). Airdrop objects now in place:");
  for (const t of tables.rows) console.log("  - " + t.table_name);
} finally {
  await client.end();
}
