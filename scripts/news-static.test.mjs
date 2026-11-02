#!/usr/bin/env node
/**
 * Guards for the news list and the RSS feeds.
 *
 * The list used to exist only after JavaScript ran, so a crawler saw one pinned
 * card and the other sixteen posts might as well not have existed. It is now
 * rendered at build time by website/tools/build_news.py from
 * website/assets/data/news.js — which means there are two renderers (that script
 * and assets/js/news.js) producing the same markup, and two ways to be wrong:
 * the static copy drifting from the data file, and the two languages drifting
 * from each other.
 *
 * Both are asserted here, in the one place where posting an item and forgetting
 * to rebuild is cheapest to catch.
 */

import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const WEB = ROOT + "website";

const EN = WEB + "/news.html";
const ZH = WEB + "/zh/news.html";
const EN_FEED = WEB + "/news/feed.xml";
const ZH_FEED = WEB + "/zh/news/feed.xml";

const read = (p) => readFileSync(p, "utf8");

// The data file assigns window.OMC_NEWS and the dictionaries assign
// window.I18N.<lang>, so they are loaded the way the browser loads them rather
// than re-parsed with a regex here. Each one gets its own window so the three
// module evaluations cannot see each other's globals.
async function withWindow(path) {
  const w = {};
  globalThis.window = w;
  // pathToFileURL, not the bare path: on Windows the loader rejects "c://..." as
  // an unsupported scheme.
  await import(pathToFileURL(path).href);
  return w;
}

const enDict = (await withWindow(`${WEB}/assets/js/lang/en.js`)).I18N.en;
const zhDict = (await withWindow(`${WEB}/assets/js/lang/zh.js`)).I18N.zh;
const POSTS = (await withWindow(`${WEB}/assets/data/news.js`)).OMC_NEWS;

const LIST_BEGIN = "<!-- NEWS_LIST:BEGIN -->";
const LIST_END = "<!-- NEWS_LIST:END -->";

function listOf(html) {
  const i = html.indexOf(LIST_BEGIN);
  const j = html.indexOf(LIST_END);
  assert.ok(i !== -1 && j > i, "news list markers missing");
  return html.slice(i, j);
}

/** Same ordering rule as news.js and build_news.py: pinned first, then newest. */
function expectedOrder() {
  return POSTS.slice().sort((a, b) => {
    if (!!b.pin !== !!a.pin) return b.pin ? 1 : -1;
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

const cards = (block) => block.match(/<article class="news-item[\s\S]*?<\/article>/g) || [];
const ids = (block) => [...block.matchAll(/<article class="news-item[^"]*" data-kind="[^"]*" id="post-([^"]+)"/g)].map((m) => m[1]);

test("every post is in the static list, in the same order the page renders", () => {
  const block = listOf(read(EN));
  assert.equal(cards(block).length, POSTS.length);
  assert.deepEqual(ids(block), expectedOrder().map((p) => p.id));
});

test("the Chinese list has the same posts, not a translated subset", () => {
  const zh = ids(listOf(read(ZH)));
  assert.deepEqual(zh, ids(listOf(read(EN))));
});

test("each card carries a machine-readable date, not only a formatted one", () => {
  const block = listOf(read(EN));
  const times = [...block.matchAll(/<time class="ni-time" datetime="([^"]+)">([^<]+)<\/time>/g)];
  assert.equal(times.length, POSTS.length);
  for (const [, iso, label] of times) {
    assert.match(iso, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(!Number.isNaN(Date.parse(iso + "T00:00:00Z")), iso);
    assert.match(label, /^[A-Z][a-z]{2} \d{1,2}, \d{4}$/, label);
  }
});

test("the Chinese dates are Chinese", () => {
  // Intl only runs in the browser, so the zh dates are text written by the
  // generator. If build_zh.py ran after it, this is the assertion that notices.
  const times = [...listOf(read(ZH)).matchAll(/<time class="ni-time" datetime="[^"]+">([^<]+)<\/time>/g)];
  assert.equal(times.length, POSTS.length);
  for (const [, label] of times) assert.match(label, /^\d{4}年\d{1,2}月\d{1,2}日$/, label);
});

test("titles and excerpts come from the dictionary, so the language switch still works", () => {
  for (const block of [listOf(read(EN)), listOf(read(ZH))]) {
    for (const m of block.matchAll(/<h3 data-i18n="([^"]+)"|<p data-i18n="([^"]+)"/g)) {
      const key = m[1] || m[2];
      assert.ok(enDict[key], `missing en key ${key}`);
      assert.ok(zhDict[key], `missing zh key ${key}`);
    }
  }
});

test("the post count is readable without JavaScript", () => {
  for (const [file, dict] of [[EN, enDict], [ZH, zhDict]]) {
    const m = read(file).match(/<div class="news-count" id="newsCount">([^<]*)<\/div>/);
    assert.ok(m, `no static count in ${file}`);
    assert.ok(m[1].trim().length > 0, `empty count in ${file}`);
    assert.ok(m[1].includes(String(POSTS.length)), `${file} says "${m[1]}"`);
  }
});

test("the sidebar Latest card is filled at build time too", () => {
  const html = read(EN);
  const i = html.indexOf("<!-- NEWS_LATEST:BEGIN -->");
  const j = html.indexOf("<!-- NEWS_LATEST:END -->");
  const block = html.slice(i, j);
  assert.match(block, /<a href="[^"]+"/);
  assert.ok(block.includes(expectedOrder()[0].t), "latest card does not name the top post");
});

// ---------------------------------------------------------------------------
// feeds
// ---------------------------------------------------------------------------

const ENTITY = /&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/;

function feedItems(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
}

const field = (item, name) => (item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`)) || [])[1];

test("both feeds are well-formed enough to parse, and escape what they must", () => {
  for (const path of [EN_FEED, ZH_FEED]) {
    const xml = read(path);
    assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), path);
    assert.ok(xml.trimEnd().endsWith("</rss>"), path);
    assert.equal((xml.match(/<item>/g) || []).length, (xml.match(/<\/item>/g) || []).length);
    assert.equal(feedItems(xml).length, POSTS.length);
    // A raw & inside a URL is the classic way this file becomes unparseable, and
    // every forum link here carries utm_source/utm_medium pairs.
    for (const line of xml.split("\n")) {
      if (line.includes("<![CDATA[")) continue;
      assert.ok(!ENTITY.test(line), `${path}: unescaped & in ${line.trim().slice(0, 80)}`);
    }
  }
});

test("feed items are newest first and carry absolute https links", () => {
  for (const path of [EN_FEED, ZH_FEED]) {
    const items = feedItems(read(path));
    const dates = items.map((it) => Date.parse(field(it, "pubDate")));
    assert.ok(dates.every((d) => !Number.isNaN(d)), path);
    assert.deepEqual(dates, dates.slice().sort((a, b) => b - a), `${path} is not newest-first`);
    for (const it of items) {
      const link = field(it, "link");
      assert.match(link, /^https:\/\//, `${path}: ${link}`);
    }
  }
});

test("lastBuildDate follows the newest post instead of the build clock", () => {
  // Otherwise every run of the generator looks like an update: a meaningless
  // diff each time, and a feed reader that learns to ignore the file.
  const xml = read(EN_FEED);
  const newest = POSTS.map((p) => p.date).sort().pop();
  assert.equal(
    Date.parse(field(xml, "lastBuildDate")),
    Date.parse(newest + "T00:00:00Z"),
  );
});

test("the Chinese feed does not link to Chinese pages that do not exist", () => {
  // resolve_href prefixes /zh only where a mirror exists, and whitepaper does
  // not have one. Guessing the prefix would send Chinese readers to a 404 on
  // exactly the links this exercise is meant to make work.
  let prefixed = 0;
  for (const it of feedItems(read(ZH_FEED))) {
    const link = field(it, "link").replace(/&amp;/g, "&");
    if (!link.startsWith("https://omc.network/")) continue;
    const path = new URL(link).pathname.replace(/\/$/, "");
    const file = path === "" ? "/index.html" : `${path}.html`;
    assert.ok(existsSync(WEB + file), `zh feed links to missing file: ${path}`);
    if (path.startsWith("/zh/")) prefixed++;
  }
  assert.ok(prefixed > 0, "no Chinese link was prefixed at all");
});

test("feeds are discoverable: rel=alternate in the page head, and listed for machines", () => {
  for (const [file, href] of [[EN, "https://omc.network/news/feed.xml"], [ZH, "https://omc.network/zh/news/feed.xml"]]) {
    const head = read(file).split("</head>")[0];
    assert.ok(head.includes('type="application/rss+xml"'), `${file} has no feed link`);
    assert.ok(head.includes(href), `${file} does not link ${href}`);
  }
  const robots = read(WEB + "/robots.txt");
  const llms = read(WEB + "/llms.txt");
  assert.ok(robots.includes("https://omc.network/news/feed.xml"));
  assert.ok(llms.includes("https://omc.network/news/feed.xml"));
});

test("news.js and build_news.py agree on the card shape", () => {
  // Two renderers, one markup contract. The static list is what a crawler sees;
  // this is what replaces it on load. A difference shows up as a reflow.
  const js = read(WEB + "/assets/js/news.js");
  assert.match(js, /id="post-/, "news.js lost the per-post id");
  assert.match(js, /<time class="ni-time" datetime="/, "news.js lost the <time> element");
});
