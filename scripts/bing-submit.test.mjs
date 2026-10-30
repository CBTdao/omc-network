import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { test } from "node:test";

import { pickProperty, parseBingDate, sitemapUrls } from "./bing-submit.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const script = readFileSync(join(root, "scripts", "bing-submit.mjs"), "utf8");

// Mirrors the account: a bare host property and a narrower /zh/ property, which
// is the arrangement that makes "longest prefix wins" matter.
const PROPS = [
  { url: "https://omc.network/", verified: true },
  { url: "https://omc.network/zh/", verified: true },
  { url: "https://top.omc.network/", verified: false },
];

test("a Chinese page is attributed to the /zh/ property, not the root one", () => {
  assert.equal(pickProperty("https://omc.network/zh/airdrop", PROPS), "https://omc.network/zh/");
  assert.equal(pickProperty("https://omc.network/zh", PROPS), "https://omc.network/zh/");
});

test("an English page is attributed to the root property", () => {
  assert.equal(pickProperty("https://omc.network/airdrop", PROPS), "https://omc.network/");
});

test("a sibling path is not swallowed by the /zh/ property", () => {
  // The classic prefix bug: /zh/ must not match /zhairdrop. The sitemap has no
  // such page today, but a future one would be submitted under the wrong
  // property and rejected without an error.
  assert.equal(pickProperty("https://omc.network/zhairdrop", PROPS), "https://omc.network/");
});

test("an unverified property is never used, and an uncovered host returns null", () => {
  assert.equal(pickProperty("https://top.omc.network/x", PROPS), null);
  // game.omc.network is deployed but not a Bing property -- the case that made
  // 34 sitemap URLs invisible, so it must keep failing loudly.
  assert.equal(pickProperty("https://game.omc.network/daily/2026-09-25", PROPS), null);
});

test("Bing's never-crawled sentinel is not read as a date", () => {
  assert.equal(parseBingDate("/Date(-62135596800000)/"), null);
  assert.equal(parseBingDate(undefined), null);
  assert.equal(parseBingDate("not a date"), null);
  const d = parseBingDate("/Date(1793286903000)/");
  assert.ok(d instanceof Date);
  assert.equal(d.toISOString().slice(0, 10), "2026-10-29");
});

test("the sitemaps parse into absolute https URLs", () => {
  const urls = sitemapUrls();
  assert.ok(urls.length >= 23, `expected at least 23 URLs, got ${urls.length}`);
  for (const u of urls) {
    assert.match(u, /^https:\/\//, `${u} must be absolute https`);
  }
  assert.ok(urls.some((u) => u.includes("/airdrop")), "the airdrop page must be in a sitemap");
  assert.ok(urls.some((u) => u.includes("game.omc.network")), "the game sitemap must be included");
});

test("the key is read from outside the repository, never inline", () => {
  assert.match(script, /BING_WEBMASTER_API_KEY/, "the env override must exist");
  assert.match(script, /\.bing-api-key/, "the file fallback must exist");
  // A 32-char hex literal in this file would be a leaked key.
  assert.doesNotMatch(script, /\b[0-9a-f]{32}\b/, "no hex key literal may appear in the script");
});

test("the live key is not present in any tracked file", () => {
  // Reads the key that is actually in use (if this machine has one) and asserts
  // it does not appear anywhere in the tree that gets committed. A secret that
  // reaches a commit is not removed by deleting the file afterwards -- it stays
  // in history -- so the only useful moment to catch it is before the commit.
  const keyFile = join(homedir(), ".bing-api-key");
  if (!existsSync(keyFile)) return;
  const key = readFileSync(keyFile, "utf8").trim();
  if (key.length < 16) return;

  const offenders = [];
  const skip = new Set([".git", "node_modules", ".vercel", "dist"]);
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (skip.has(name)) continue;
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (st.size < 2_000_000) {
        if (readFileSync(full, "utf8").includes(key)) offenders.push(full.slice(root.length + 1));
      }
    }
  };
  walk(join(root, "website"));
  walk(join(root, "scripts"));
  walk(join(root, "contracts"));
  assert.deepEqual(offenders, [], `the Bing API key is committed in: ${offenders.join(", ")}`);
});
