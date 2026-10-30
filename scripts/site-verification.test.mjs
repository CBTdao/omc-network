/**
 * Search-engine site verification files are the kind of file a later cleanup
 * pass deletes as junk. Deleting them does not break the site — it silently
 * drops every page out of the index that the ownership proof covers, and the
 * failure is invisible until traffic stops. So the files are asserted here.
 *
 * Bing is not a nice-to-have for this project: ChatGPT search and Copilot both
 * answer from the Bing index, which is the whole point of the airdrop feed and
 * the announcement page. Google has its own file; Bing has an XML file plus a
 * meta tag, and both are kept deliberately — one bad merge should not be able
 * to take the property offline.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const site = (p) => join(root, "website", p);

const BING_FILE = site("BingSiteAuth.xml");
const BING_TOKEN = "5335DB876B2315C0358C088A62BF3596";

test("BingSiteAuth.xml exists at the deploy root", () => {
  assert.ok(existsSync(BING_FILE), "website/BingSiteAuth.xml is missing — Bing ownership proof is gone");
});

test("BingSiteAuth.xml is well-formed and carries the token", () => {
  const xml = readFileSync(BING_FILE, "utf8");
  assert.match(xml, /^<\?xml version="1\.0"\?>/, "must open with an XML declaration");
  assert.match(xml, /<users>[\s\S]*<\/users>/, "must have a <users> element");

  const tokens = [...xml.matchAll(/<user>\s*([^<]*?)\s*<\/user>/g)].map((m) => m[1]);
  assert.equal(tokens.length, 1, `expected exactly one <user>, found ${tokens.length}`);
  assert.equal(tokens[0], BING_TOKEN);
  assert.match(tokens[0], /^[0-9A-F]{32}$/, "Bing tokens are 32 uppercase hex characters");
});

test("the homepage carries the same token as a meta tag", () => {
  const html = readFileSync(site("index.html"), "utf8");
  const metas = [...html.matchAll(/<meta\s+name="msvalidate\.01"\s+content="([^"]*)"/g)];
  assert.equal(metas.length, 1, `expected one msvalidate.01 meta, found ${metas.length}`);
  assert.equal(metas[0][1], BING_TOKEN, "meta token must equal the XML token — one token, two proofs");
});

test("the Chinese mirror carries it too", () => {
  // /zh is a generated tree. If build_zh.py ever starts pruning head elements,
  // the English page keeps its meta and the mirror silently loses it. The
  // property is verified on the domain, so this is about the mirror not being
  // a second-class page rather than about verification passing.
  const zh = readFileSync(site("zh/index.html"), "utf8");
  assert.match(zh, new RegExp(`<meta name="msvalidate\\.01" content="${BING_TOKEN}"`),
    "zh/index.html lost the verification meta — rerun website/tools/build_zh.py");
});

test("the Google verification file is still in place", () => {
  // Same failure mode, different engine. The name is opaque on purpose: it is
  // the token. It looked like a stray file before this test existed.
  const google = site("af9cdf6dcec04a06bd3b112de8a4e69c.txt");
  assert.ok(existsSync(google), "Google Search Console verification file was deleted");
  assert.match(readFileSync(google, "utf8").trim(), /^[a-f0-9]{32}$/);
});

test("no placeholder survived into the deployed files", () => {
  const all = [readFileSync(BING_FILE, "utf8"), readFileSync(site("index.html"), "utf8")].join("\n");
  assert.doesNotMatch(all, /YOUR_TOKEN|XXXX+|TODO|placeholder/i,
    "a verification placeholder would verify nothing while looking configured");
});
