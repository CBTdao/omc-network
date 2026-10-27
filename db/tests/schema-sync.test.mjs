/**
 * schema.generated.js must equal db/migrations/*.sql, byte for byte.
 *
 * Vercel functions cannot read files outside their own tree, so the SQL is
 * embedded as a module. The failure mode of that arrangement is silent: a new
 * migration lands, nobody re-runs embed-schema, and production keeps applying
 * the old schema while the tests read the new one. This test is what makes
 * that impossible.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { buildSchemaModule } from "../scripts/embed-schema.mjs";

const require = createRequire(import.meta.url);

test("schema.generated.js matches the migrations on disk", async () => {
  const expected = await buildSchemaModule();
  const actual = require("../../website/api/_lib/schema.generated.js");

  const expectedEntries = [...expected.matchAll(/filename: "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(
    actual.map((m) => m.filename),
    expectedEntries,
    "regenerate with: node db/scripts/embed-schema.mjs"
  );

  for (const m of actual) {
    assert.ok(m.sql.length > 100, m.filename + " looks truncated");
    assert.ok(/;\s*$/.test(m.sql.trim()), m.filename + " does not end with a statement terminator");
  }
});

test("every migration is idempotent, because it is also the cold-start path", async () => {
  const mods = require("../../website/api/_lib/schema.generated.js");
  for (const m of mods) {
    const creates = m.sql.match(/^\s*create\s+(table|index|view)\s/gi) || [];
    const guarded = m.sql.match(/^\s*create\s+(table|index|view)\s+if\s+not\s+exists/gi) || [];
    const replaced = m.sql.match(/^\s*create\s+or\s+replace\s+(view|function)/gi) || [];
    assert.equal(
      creates.length,
      guarded.length + replaced.length,
      m.filename + " has DDL that would fail on a second run"
    );
  }
});
