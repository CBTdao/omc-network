#!/usr/bin/env node
/**
 * The numbers have to be on the page, not one click away.
 *
 * A retriever slices a page by heading and quotes one block. A page whose
 * opening paragraph is a mood statement answers nothing when that block is the
 * only thing that gets fetched — and /index, /stake and /compute were exactly
 * that: they described the network without ever saying how much, how many, or
 * when. The fix is one sentence in the hero of each, carrying all three.
 *
 * The figures are read from contracts/params.json rather than written into this
 * file, so raising the fee or moving the TGE date fails here instead of leaving
 * a stale promise in the most-quoted paragraph of the site.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const read = (p) => readFileSync(ROOT + p, "utf8");

const params = JSON.parse(read("contracts/params.json"));
const perEntry = params.airdrop.perEntry;
const feeBnb = params.airdrop.claimCost.feeBnb;
const opens = params.airdrop.claimOpens;
const chargeWhen = params.airdrop.claimCost.chargeWhen;
const refundable = params.airdrop.claimCost.refundable;

/** "2027-01-01" -> "1 January 2027", which is how the rest of the site writes it. */
function longDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const month = new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-GB", {
    month: "long",
    timeZone: "UTC",
  });
  return `${d} ${month} ${y}`;
}

const PAGES = {
  index: { en: "/website/index.html", zh: "/website/zh/index.html" },
  stake: { en: "/website/stake.html", zh: "/website/zh/stake.html" },
  compute: { en: "/website/compute.html", zh: "/website/zh/compute.html" },
  // The testnet page earns its place here: tOMC is free and worth nothing, and
  // a reader who lands on it first has no other way to learn what the real
  // token is worth per entry or when it exists.
  testnet: { en: "/website/testnet.html", zh: "/website/zh/testnet.html" },
};

/** Load a dictionary the way the browser does. */
function dict(lang) {
  const window = {};
  new Function("window", read(`/website/assets/js/lang/${lang}.js`))(window);
  return window.I18N[lang];
}

const en = dict("en");
const zh = dict("zh");

test("the hero figure sentence is in the dictionary, in both languages", () => {
  assert.ok("facts.airdrop" in en, "en dictionary has no facts.airdrop");
  assert.ok("facts.airdrop" in zh, "zh dictionary has no facts.airdrop");
  assert.match(en["facts.airdrop"], new RegExp(`${perEntry} OMC`), "per-entry amount");
  assert.match(en["facts.airdrop"], new RegExp(`${feeBnb} BNB`), "claim charge");
  assert.ok(en["facts.airdrop"].includes(longDate(opens)), `TGE date ${longDate(opens)}`);
  assert.ok(zh["facts.airdrop"].includes(`${perEntry} OMC`), "zh per-entry amount");
  assert.ok(zh["facts.airdrop"].includes(`${feeBnb} BNB`), "zh claim charge");
});

test("the charge is named a processing charge, never a price of entry", () => {
  // params says chargeWhen: claim and refundable: false. Copy that calls it a
  // price, a purchase or an entrance fee describes a different product.
  assert.equal(chargeWhen, "claim", "the fee is charged at claim");
  assert.equal(refundable, false, "the fee is not refundable");
  assert.match(en["facts.airdrop"], /processing charge/, "en must name it a processing charge");
  assert.match(zh["facts.airdrop"], /领取手续费/, "zh must name it 领取手续费");
  for (const [lang, d] of [["en", en], ["zh", zh]]) {
    for (const word of ["entrance fee", "price of entry", "paid airdrop", "presale", "入场费"]) {
      assert.ok(!d["facts.airdrop"].toLowerCase().includes(word.toLowerCase()), `${lang} says ${word}`);
    }
  }
});

test("index, stake and compute carry the sentence, in the hero", () => {
  for (const [name, files] of Object.entries(PAGES)) {
    for (const [lang, path] of Object.entries(files)) {
      const html = read(path);
      const m = html.match(/<p class="sub facts-line" data-i18n="facts\.airdrop">([^<]+)<\/p>/);
      assert.ok(m, `${name} (${lang}): no facts line in the hero`);
      // The inline text is the pre-JS fallback, so it has to equal the
      // dictionary value — otherwise a no-JS crawler reads a different sentence
      // from the one a browser renders.
      assert.equal(m[1], (lang === "zh" ? zh : en)["facts.airdrop"], `${name} (${lang}): fallback text drifted`);
    }
  }
});

test("the sentence comes before the first heading below the hero", () => {
  // "In the first 100 words" is the rule; this is the cheap mechanical proxy:
  // the facts line must appear before the second <h2> on the page.
  for (const [name, files] of Object.entries(PAGES)) {
    for (const path of Object.values(files)) {
      const html = read(path);
      const factsAt = html.indexOf('class="sub facts-line"');
      const h2 = html.indexOf("<h2", html.indexOf("</header>"));
      assert.ok(factsAt > 0, `${name}: no facts line`);
      assert.ok(h2 === -1 || factsAt < h2, `${name}: facts line is below the first section heading`);
    }
  }
});
