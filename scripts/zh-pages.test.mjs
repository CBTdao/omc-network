#!/usr/bin/env node
/**
 * Guards for the static /zh/ mirror (website/zh/, built by
 * website/tools/build_zh.py). These tests read the committed files, so a
 * stale build fails here rather than shipping half-translated pages.
 */

import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { test } from "node:test";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const WEB = ROOT + "website";

/* Load the zh dictionary the same way the browser does. */
const zhSource = readFileSync(WEB + "/assets/js/lang/zh.js", "utf8");
const window = {};
new Function("window", zhSource)(window);
const zh = window.I18N.zh;

const BATCH = {
  index: "",
  airdrop: "airdrop",
  tokenomics: "tokenomics",
  stake: "stake",
  compute: "compute",
  testnet: "testnet",
  "ai-tools": "ai-tools",
  news: "news",
  // batch 2 — translated from the block tables in website/tools/zh-batch2/
  whitepaper: "whitepaper",
  about: "about",
  calculator: "calculator",
  privacy: "privacy",
  aup: "aup",
};

const enUrl = (slug) => `https://omc.network/${slug}`;
const zhUrl = (slug) => (slug ? `https://omc.network/zh/${slug}` : "https://omc.network/zh");

test("every zh page exists and declares itself correctly", () => {
  for (const [name, slug] of Object.entries(BATCH)) {
    const file = `${WEB}/zh/${name}.html`;
    assert.ok(existsSync(file), `missing ${file}`);
    const html = readFileSync(file, "utf8");

    assert.match(html, /<html lang="zh-CN"/, `${name}: html lang`);
    assert.ok(
      html.includes(`<link rel="canonical" href="${zhUrl(slug)}">`),
      `${name}: canonical must point at ${zhUrl(slug)}`
    );
    assert.ok(html.includes(`property="og:url" content="${zhUrl(slug)}"`), `${name}: og:url`);
    assert.ok(html.includes('hreflang="zh"'), `${name}: zh hreflang`);
    assert.ok(html.includes(`hreflang="en" href="${enUrl(slug)}"`), `${name}: en hreflang back-link`);
  }
});

test("every en page links back to its zh mirror", () => {
  for (const [name, slug] of Object.entries(BATCH)) {
    const html = readFileSync(`${WEB}/${name}.html`, "utf8");
    assert.ok(
      html.includes(`<link rel="alternate" hreflang="zh" href="${zhUrl(slug)}" />`),
      `${name}.html: missing zh hreflang`
    );
  }
});

test("zh pages contain no data-i18n key that the dictionary cannot fill", () => {
  for (const name of Object.keys(BATCH)) {
    const html = readFileSync(`${WEB}/zh/${name}.html`, "utf8");
    const keys = [...html.matchAll(/data-i18n="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(keys.length > 0, `${name}: no data-i18n keys at all`);
    for (const k of keys) assert.ok(k in zh, `${name}: key ${k} missing from zh dict`);
  }
});

test("zh pages are actually Chinese, not re-labelled English", () => {
  for (const name of Object.keys(BATCH)) {
    const html = readFileSync(`${WEB}/zh/${name}.html`, "utf8")
      .replace(/<script[\s\S]*?<\/script>/g, "")
      .replace(/<style[\s\S]*?<\/style>/g, "")
      // Elements explicitly marked as another language are quoted, not
      // untranslated: the whitepaper cites English source titles and keeps
      // them in English on purpose.
      .replace(/<(\w+)[^>]*\blang="en"[^>]*>[\s\S]*?<\/\1>/g, " ");
    const text = html.replace(/<[^>]+>/g, " ");
    const zhChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    assert.ok(zhChars > 200, `${name}: only ${zhChars} Chinese characters in body`);
    // No untranslated English sentence of real length may survive in visible text.
    const leftovers = text.match(/[A-Za-z][A-Za-z' ]{24,}/g) || [];
    assert.deepEqual(leftovers, [], `${name}: untranslated English remains: ${leftovers.slice(0, 3)}`);
  }
});

test("zh pages stay inside /zh/ for pages that have a mirror", () => {
  const slugs = new Set(Object.values(BATCH));
  for (const name of Object.keys(BATCH)) {
    const html = readFileSync(`${WEB}/zh/${name}.html`, "utf8");
    for (const m of html.matchAll(/href="(\/[a-z-]*)"/g)) {
      const target = m[1] === "/" ? "" : m[1].slice(1);
      if (slugs.has(target) && target !== "") {
        assert.ok(
          html.includes(`href="/zh/${target}"`),
          `${name}: links to /${target} instead of /zh/${target}`
        );
        break;
      }
    }
  }
});

test("sitemap lists every zh url with alternates", () => {
  const map = readFileSync(`${WEB}/sitemap.xml`, "utf8");
  for (const slug of Object.values(BATCH)) {
    const zh = zhUrl(slug);
    assert.ok(map.includes(`<loc>${zh}</loc>`), `sitemap missing ${zh}`);
  }
  assert.ok(map.includes('xmlns:xhtml="http://www.w3.org/1999/xhtml"'), "sitemap lacks xhtml ns");
});

test("the batch-2 translation tables are compiled and complete", () => {
  // Positional tables break quietly: a .txt edited without re-compiling, or a
  // page translated by hand and never compiled, both look fine in the browser
  // until a paragraph is edited and everything below it shifts.
  const json = JSON.parse(readFileSync(`${WEB}/tools/zh-batch2.json`, "utf8"));
  for (const [page, entry] of Object.entries(json)) {
    if (page.startsWith("_")) continue;
    const txt = readFileSync(`${WEB}/tools/zh-batch2/${page}.txt`, "utf8");
    // Trim each line: the JSON stores stripped text, and core.autocrlf=true
    // hands Windows checkouts CRLF, so a raw split("\n") would compare
    // "…\r" against "…" and call the table stale on every Windows machine.
    const lines = txt
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
    assert.equal(lines.length, entry.blocks.length, `${page}: .txt has ${lines.length} lines, json has ${entry.blocks.length}`);
    assert.equal(entry.fp.length, entry.blocks.length, `${page}: fingerprint count`);
    assert.ok(entry.blocks.length > 0, `${page}: empty table`);
    assert.deepEqual(lines, entry.blocks, `${page}: json is stale (run: python website/tools/zh_extract.py --compile)`);
    // And every table must have a generated page, or the translation is dead weight.
    assert.ok(existsSync(`${WEB}/zh/${page}.html`), `${page}: table exists but /zh/${page} was not built`);
  }
});

test("i18n.js resolves the /zh/ path default; i18n-meta.js fills meta content", () => {
  const src = readFileSync(`${WEB}/assets/js/i18n.js`, "utf8");
  assert.match(src, /pathLang/, "i18n.js must know about the /zh/ path");
  const meta = readFileSync(`${WEB}/assets/js/i18n-meta.js`, "utf8");
  assert.match(meta, /data-i18n-content/, "i18n-meta.js must fill data-i18n-content");
});
