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
};

const enUrl = (slug) => `https://omc.network/${slug}`;
const zhUrl = (slug) => (slug ? `https://omc.network/zh/${slug}` : "https://omc.network/zh");

test("every batch-1 zh page exists and declares itself correctly", () => {
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

test("every en batch-1 page links back to its zh mirror", () => {
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
      .replace(/<style[\s\S]*?<\/style>/g, "");
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

test("i18n.js resolves the /zh/ path default; i18n-meta.js fills meta content", () => {
  const src = readFileSync(`${WEB}/assets/js/i18n.js`, "utf8");
  assert.match(src, /pathLang/, "i18n.js must know about the /zh/ path");
  const meta = readFileSync(`${WEB}/assets/js/i18n-meta.js`, "utf8");
  assert.match(meta, /data-i18n-content/, "i18n-meta.js must fill data-i18n-content");
});
