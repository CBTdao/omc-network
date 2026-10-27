/**
 * Shared test harness: a real Postgres (PGlite, Postgres compiled to WASM)
 * with every migration applied in filename order.
 *
 * Reading only 001 by name was fine while there was one migration; the second
 * one would have been silently skipped and the tests would have gone green
 * against a schema that production does not have.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = path.join(here, "..", "migrations");

export async function migrationFiles() {
  const files = (await fs.readdir(MIGRATIONS)).filter((f) => f.endsWith(".sql"));
  return files.sort();
}

export async function applyMigrations(db) {
  const files = await migrationFiles();
  for (const f of files) {
    await db.exec(await fs.readFile(path.join(MIGRATIONS, f), "utf8"));
  }
  return files;
}

export async function createDb() {
  const db = new PGlite();
  db.appliedMigrations = await applyMigrations(db);
  return db;
}
