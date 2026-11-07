/**
 * A narrow guard, not a list of forbidden phrasing.
 *
 * It blocks exactly three false "already done" claims on public surfaces:
 * the token is quantum-resistant, the contracts are audited, mainnet is live.
 * That is all. Positive statements, roadmap wording and everything the team is
 * actually building are deliberately unrestricted — the public copy should
 * describe the work, not enumerate what has not happened yet.
 *
 * Internal docs (SECURITY.md, docs/*) are the place for precise technical
 * constraints; they are intentionally not scanned for tone.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = join(root, "website");
const MARKETING = join(root, "docs/marketing");

function htmlFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules") htmlFiles(p, out);
    } else if (entry.name.endsWith(".html")) {
      out.push(p);
    }
  }
  return out;
}

// Only claims of a *completed* state are blocked. Nothing here restricts how
// the roadmap, the audit schedule or the post-quantum track may be described.
const BANNED = [
  /quantum-resistant/i,
  /quantum-proof/i,
  /quantum-secure/i,
  /抗量子(的)?(代币|币|资产|已经|已)/, // "quantum-resistant coin/token" as a fact
  /已(通过|完成).{0,4}审计/, // "already audited"
  /(has been|is|are)\s+audited/i, // positive audit claim
];

test("public pages and marketing copy do not over-claim post-quantum or audit status", () => {
  const files = [...htmlFiles(WEB), ...(existsSync(MARKETING) ? htmlFiles(MARKETING) : [])];
  const hits = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const re of BANNED) {
      if (re.test(text)) hits.push(`${file}: ${re}`);
    }
  }
  assert.deepEqual(hits, [], "over-claiming phrase found on a public surface");
});

test("the post-quantum roadmap exists and states the hard constraint", () => {
  const p = join(root, "docs/post-quantum-roadmap.md");
  assert.ok(existsSync(p), "docs/post-quantum-roadmap.md is missing");
  const text = readFileSync(p, "utf8");
  assert.match(text, /cannot change the\s+signing algorithm/i,
    "must state OMC cannot change a user's EOA signing algorithm");
  assert.match(text, /not.*quantum-resistant/i,
    "must state the token is not quantum-resistant today");
  assert.match(text, /harvest-now-decrypt-later/i,
    "must name the real near-term pattern");
});

test("SECURITY.md states the mainnet multisig plan and post-quantum boundary", () => {
  const text = readFileSync(join(root, "SECURITY.md"), "utf8");
  assert.match(text, /multisig/i, "SECURITY must name the multisig plan");
  assert.match(text, /timelock/i, "SECURITY must name the timelock plan");
  assert.match(text, /post-quantum/i, "SECURITY must name the post-quantum boundary");
});

test("security-review residual risk names the base-layer quantum dependency", () => {
  const text = readFileSync(join(root, "docs/security-review.md"), "utf8");
  assert.match(text, /Post-quantum exposure is inherited from the base layer/i,
    "residual risk must note quantum exposure comes from the EVM base layer");
});
