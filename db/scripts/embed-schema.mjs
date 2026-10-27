#!/usr/bin/env node
/**
 * Inline db/migrations/*.sql into website/api/_lib/schema.generated.js.
 *
 * Why this exists: Vercel serverless functions do not ship files from outside
 * their own directory tree, so a function cannot read db/migrations at runtime.
 * Embedding the SQL as a module keeps the API self-migrating without a build
 * step — the user creates a database and that is the whole of their job.
 *
 * db/tests/schema-sync.test.mjs fails if the generated file drifts from the
 * migrations, so this must be re-run whenever a migration is added:
 *
 *   node db/scripts/embed-schema.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = path.join(here, "..", "migrations");
const OUT = path.join(here, "..", "..", "website", "api", "_lib", "schema.generated.js");

export async function buildSchemaModule() {
  const files = (await fs.readdir(MIGRATIONS)).filter((f) => f.endsWith(".sql")).sort();
  if (!files.length) throw new Error("No .sql files in db/migrations");

  const entries = [];
  for (const f of files) {
    const sql = await fs.readFile(path.join(MIGRATIONS, f), "utf8");
    entries.push({ filename: f, sql });
  }

  const body = entries
    .map(
      (e) =>
        "  {\n" +
        "    filename: " + JSON.stringify(e.filename) + ",\n" +
        "    sql: " + JSON.stringify(e.sql) + ",\n" +
        "  },"
    )
    .join("\n");

  return (
    "/**\n" +
    " * GENERATED FILE — do not edit.\n" +
    " *\n" +
    " * Source: db/migrations/*.sql\n" +
    " * Regenerate: node db/scripts/embed-schema.mjs\n" +
    " * Verified by: db/tests/schema-sync.test.mjs\n" +
    " */\n\n" +
    "module.exports = [\n" + body + "\n];\n"
  );
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const out = await buildSchemaModule();
  await fs.writeFile(OUT, out, "utf8");
  const count = (out.match(/filename:/g) || []).length;
  console.log("Wrote " + count + " migration(s) to " + path.relative(process.cwd(), OUT));
}
