/**
 * Apply pending migrations from schema.generated.js on first use.
 *
 * The intended deployment path is: create a Postgres database, set
 * DATABASE_URL, redeploy — and nothing else. Requiring someone to run psql
 * against a connection string before the site works is a step that a project
 * with one maintainer will eventually forget, and the failure mode (an API
 * that answers 200 with a confusing SQL error) is worse than a few hundred
 * milliseconds of DDL on the first cold start.
 *
 * Safety:
 *   - a session advisory lock serialises concurrent cold starts, so two
 *     functions booting at once cannot both run the same migration;
 *   - each migration runs in its own transaction with the row that records it;
 *   - the process memoises the result, so this costs one query per instance,
 *     and nothing at all after the first.
 *
 * db/scripts/migrate.mjs remains the canonical CLI for local and manual runs;
 * both read the same schema_migrations table, so they never disagree.
 */

const MIGRATIONS = require("./schema.generated");
const { withClient } = require("./store");

/* Fixed key so every instance of the API queues on the same lock. */
const MIGRATION_LOCK = 0x0c0ffee1;

let ensured = null;

/**
 * A migration file is several statements at once. node-postgres sends that
 * through the simple query protocol, which allows it; PGlite's query() uses
 * the extended protocol, which allows exactly one statement, so it needs
 * exec(). Capability check rather than a shape check, so a real Postgres in
 * production is not routed through a test-only path.
 */
async function runScript(client, sql) {
  if (typeof client.exec === "function") return client.exec(sql);
  return client.query(sql);
}

/** True once this process has confirmed the schema is current. */
function isEnsured() {
  return ensured === true;
}

async function ensureSchema(pool) {
  if (ensured === true) return { applied: [], cached: true };
  if (ensured && typeof ensured.then === "function") return ensured; /* in flight */

  ensured = (async () => {
    const result = await withClient(pool, async (client) => {
      /* Session-scoped lock held across the DDL; released in the finally. */
      await client.query("select pg_advisory_lock($1)", [MIGRATION_LOCK]);
      try {
        await client.query(
          `create table if not exists schema_migrations (
             filename    text primary key,
             applied_at  timestamptz not null default now()
           )`
        );

        const { rows } = await client.query("select filename from schema_migrations");
        const done = new Set(rows.map((r) => r.filename));
        const applied = [];

        for (const m of MIGRATIONS) {
          if (done.has(m.filename)) continue;
          await client.query("begin");
          try {
            await runScript(client, m.sql);
            await client.query("insert into schema_migrations (filename) values ($1)", [
              m.filename,
            ]);
            await client.query("commit");
            applied.push(m.filename);
          } catch (err) {
            await client.query("rollback").catch(() => {});
            throw new Error("migration " + m.filename + " failed: " + err.message);
          }
        }
        return { applied };
      } finally {
        await client.query("select pg_advisory_unlock($1)", [MIGRATION_LOCK]).catch(() => {});
      }
    });

    return { applied: result.applied, cached: false };
  })();

  try {
    const out = await ensured;
    ensured = true;
    return out;
  } catch (err) {
    ensured = null; /* let the next request retry rather than pinning the failure */
    throw err;
  }
}

/** Test seam. */
function resetSchemaCache() {
  ensured = null;
}

module.exports = { ensureSchema, isEnsured, resetSchemaCache };
