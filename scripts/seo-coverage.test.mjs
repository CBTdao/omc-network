#!/usr/bin/env node
/**
 * Coverage guard for the part of indexing that a page-level audit cannot see.
 *
 * seo-audit.mjs checks that every page has a correct title, canonical and
 * JSON-LD. All of those can be perfect while the sitemap still lists last
 * month's URLs with last month's dates — which is exactly what happened: the
 * audit reported 0 problems while Bing had not fetched a single new URL in six
 * days. Technical correctness is not the same as being discoverable.
 *
 * This test asserts the two things that actually decide discovery: the sitemap
 * describes the pages that exist, and its dates agree with the pages.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = fileURLToPath(new URL("../website/", import.meta.url));
const ORIGIN = "https://omc.network";
const SITEMAP = join(WEB, "sitemap.xml");
const ROBOTS = join(WEB, "robots.txt");

const read = (p) => readFileSync(p, "utf8");

function urlFor(rel) {
  const isZh = rel.startsWith("zh/");
  let r = isZh ? rel.slice(3) : rel;
  if (r === "index.html") return ORIGIN + (isZh ? "/zh" : "/");
  let path = "/" + r.replace(/\.html$/, "");
  if (path.endsWith("/index")) path = path.slice(0, -"/index".length);
  return ORIGIN + (isZh ? "/zh" : "") + path;
}

/** The same four groups inject_facts.py stamps and build_sitemap.py discovers. */
function indexablePages() {
  const groups = [
    ["", join(WEB)],
    ["news/", join(WEB, "news")],
    ["zh/", join(WEB, "zh")],
    ["zh/news/", join(WEB, "zh", "news")],
  ];
  const out = [];
  for (const [prefix, dir] of groups) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".html") || name === "404.html") continue;
      const file = join(dir, name);
      if (!statSync(file).isFile()) continue;
      const text = read(file);
      if (/<meta[^>]+name="robots"[^>]+content="[^"]*noindex/i.test(text)) continue;
      out.push({ rel: prefix + name, file, text, url: urlFor(prefix + name) });
    }
  }
  return out;
}

const sm = read(SITEMAP);
const entries = [...sm.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => {
  const body = m[1];
  const get = (tag) => (body.match(new RegExp(`<${tag}>([^<]+)</${tag}>`)) || [])[1] || null;
  return {
    body,
    url: get("loc"),
    lastmod: get("lastmod"),
    alternates: [...body.matchAll(/hreflang="([^"]+)"\s+href="([^"]+)"/g)]
      .map((a) => ({ lang: a[1], href: a[2] })),
  };
});

test("the sitemap lists exactly the indexable apex pages", () => {
  const expected = new Set(indexablePages().map((p) => p.url));
  const actual = new Set(entries.map((e) => e.url));
  assert.equal(actual.size, entries.length, "sitemap contains duplicate URLs");
  const missing = [...expected].filter((u) => !actual.has(u));
  const dead = [...actual].filter((u) => !expected.has(u));
  assert.deepEqual(missing, [], "indexable pages missing from sitemap — run build_sitemap.py");
  assert.deepEqual(dead, [], "sitemap lists pages that do not exist");
  assert.ok(entries.length >= 30, `only ${entries.length} URLs in the sitemap`);
});

test("every lastmod is a real date and agrees with the page's dateModified", () => {
  const byUrl = new Map(indexablePages().map((p) => [p.url, p.text]));
  // inject_facts.py uses date.today() (local), so compare against the local
  // calendar day — toISOString() would call a same-day stamp "in the future"
  // for every machine east of UTC.
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  for (const e of entries) {
    assert.match(e.lastmod || "", /^\d{4}-\d{2}-\d{2}$/, `${e.url}: bad lastmod ${e.lastmod}`);
    assert.ok(e.lastmod <= today, `${e.url}: lastmod is in the future`);
    const text = byUrl.get(e.url) || "";
    const stamped = (text.match(/"dateModified"\s*:\s*"(\d{4}-\d{2}-\d{2})/) || [])[1];
    if (stamped) {
      assert.equal(e.lastmod, stamped, `${e.url}: sitemap date disagrees with the page — rerun the build chain`);
    }
  }
});

test("every entry declares en, x-default and a live zh alternate", () => {
  const known = new Set(entries.map((e) => e.url));
  for (const e of entries) {
    const langs = e.alternates.map((a) => a.lang);
    assert.ok(langs.includes("en"), `${e.url}: no en hreflang`);
    assert.ok(langs.includes("x-default"), `${e.url}: no x-default`);
    if (langs.includes("zh")) {
      const zh = e.alternates.find((a) => a.lang === "zh").href;
      assert.ok(known.has(zh), `${e.url}: zh alternate ${zh} is not in the sitemap`);
    }
  }
});

test("sitemap URLs use the clean canonical form", () => {
  for (const e of entries) {
    assert.ok(!e.url.endsWith(".html"), `${e.url}: .html leaked into the sitemap`);
    // The apex root is the one URL where a trailing slash is the canonical form.
    if (e.url !== ORIGIN + "/") {
      assert.ok(!e.url.endsWith("/"), `${e.url}: trailing slash would 308`);
    }
    assert.ok(e.url.startsWith(ORIGIN), `${e.url}: wrong host`);
  }
});

test("the Chinese mirror covers every English news detail page", () => {
  const en = readdirSync(join(WEB, "news")).filter((f) => f.endsWith(".html")).sort();
  const zh = readdirSync(join(WEB, "zh", "news")).filter((f) => f.endsWith(".html")).sort();
  assert.deepEqual(zh, en, "each /news/ article needs a /zh/news/ counterpart");
});

const TOPIC_SLUGS = ["agent-economy", "verifiable-compute", "post-quantum"];

test("every topic pillar exists in both languages and is advertised", () => {
  for (const slug of TOPIC_SLUGS) {
    assert.ok(existsSync(join(WEB, `${slug}.html`)), `missing ${slug}.html`);
    assert.ok(existsSync(join(WEB, "zh", `${slug}.html`)), `missing zh/${slug}.html`);
    assert.ok(entries.some((e) => e.url === `${ORIGIN}/${slug}`), `${slug} missing from sitemap`);
    assert.ok(entries.some((e) => e.url === `${ORIGIN}/zh/${slug}`), `zh/${slug} missing from sitemap`);
  }
});

test("an established page links back to every pillar", () => {
  for (const [file, prefix] of [["compute.html", "/"], ["zh/compute.html", "/zh/"]]) {
    const text = read(join(WEB, file));
    assert.match(text, /TOPIC_DEEP_DIVES:BEGIN/, `${file}: backlink block was pruned`);
    for (const slug of TOPIC_SLUGS) {
      assert.ok(text.includes(`href="${prefix}${slug}"`), `${file}: no backlink to ${slug}`);
    }
  }
});

test("robots.txt lets retrieval crawlers in", () => {
  const robots = read(ROBOTS);
  for (const ua of ["OAI-SearchBot", "Claude-SearchBot", "PerplexityBot"]) {
    const block = new RegExp(`User-agent:\\s*${ua}\\s*\\nAllow:\\s*/`, "i");
    assert.match(robots, block, `${ua} is not explicitly allowed — it decides AI answer visibility`);
  }
  assert.ok(!/User-agent:\s*anthropic-ai\b/i.test(robots), "anthropic-ai is a retired UA");
  assert.match(robots, /Sitemap:\s*https:\/\/omc\.network\/sitemap\.xml/);
});
