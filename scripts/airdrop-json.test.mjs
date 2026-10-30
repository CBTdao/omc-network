#!/usr/bin/env node
/**
 * Guards for the machine-readable airdrop feed and the AI-crawler surface.
 *
 * website/airdrop.json is what airdrop aggregators and AI answer engines read
 * when nobody visits the site. It duplicates figures that live in
 * contracts/params.json, so it can drift; these tests make drift fail here
 * instead of on someone else's listing page.
 *
 * Also asserts the crawl surface stays open: robots.txt must not disallow the
 * answer-engine bots, llms.txt must point at the feed, and the HowTo markup on
 * /airdrop must still describe the real five steps.
 */

import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { test } from "node:test";
import { MAX_SUPPLY, FLOAT_TGE } from "../models/economics.mjs";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const WEB = ROOT + "website";
const params = JSON.parse(readFileSync(ROOT + "contracts/params.json", "utf8"));
const feed = JSON.parse(readFileSync(WEB + "/airdrop.json", "utf8"));
const a = params.airdrop;
const f = feed.airdrop;

test("airdrop.json exists and parses", () => {
  assert.ok(existsSync(WEB + "/airdrop.json"));
  assert.equal(feed.project.symbol, "OMC");
  assert.match(feed._readme.generatedFrom, /params\.json v\d+/);
});

test("airdrop.json pool figures match contracts/params.json", () => {
  assert.equal(f.totalPool, a.pool);
  assert.equal(f.perEntry, a.perEntry);
  assert.equal(f.totalSlots, a.poolSlots);
  assert.equal(f.maxSupply, MAX_SUPPLY);
  assert.equal(f.totalPool / MAX_SUPPLY, 0.02, "the pool is 2% of supply, which is what the copy says");
  assert.equal(f.totalSlots * f.perEntry, f.totalPool, "slots x perEntry must equal the pool");
  assert.ok(FLOAT_TGE > 0);
});

test("airdrop.json entry caps match contracts/params.json", () => {
  assert.equal(f.entryCaps.baseEntriesPerWallet, a.baseEntries);
  assert.equal(f.entryCaps.referralEntriesPerWallet, a.referralEntries);
  assert.equal(f.entryCaps.maxEntriesPerWallet, a.baseEntries + a.referralEntries);
  assert.equal(f.entryCaps.maxPerWallet, (a.baseEntries + a.referralEntries) * a.perEntry);
});

test("airdrop.json dates match contracts/params.json", () => {
  assert.equal(f.claimOpens, a.claimOpens);
  assert.equal(f.claimCloses, a.claimCloses);
});

test("airdrop.json fee matches claimCost, and isFree follows the fee", () => {
  assert.equal(f.cost.claimFeePerEntry, a.claimCost.feeBnb);
  assert.equal(f.cost.claimFeeRefundable, a.claimCost.refundable);
  assert.equal(f.cost.maxClaimFee, a.claimCost.maxChargeBnb);
  assert.equal(f.cost.maxClaimFee, f.entryCaps.maxEntriesPerWallet * f.cost.claimFeePerEntry);
  // A positive fee means the feed must not call itself free. If the fee ever
  // drops to zero this assertion flips, which is the point: it is a reminder,
  // not a preference.
  assert.equal(f.cost.isFree, a.claimCost.feeBnb === 0);
  assert.equal(f.cost.registrationCost, 0, "registering is a signature, not a transaction");
});

test("airdrop.json vesting is 100% at claim, matching params", () => {
  assert.equal(f.vesting, a.vesting);
  assert.equal(f.vesting, "100% at claim");
  // Guard the shape, not the prose: the note explains that there is no cliff,
  // so a naive keyword scan over the whole object would fire on the denial.
  assert.equal(f.vestingDays, undefined);
  assert.equal(f.cliffMonths, undefined);
  assert.equal(f.releasePct, undefined);
  assert.equal(f.vestingSchedule, undefined);
});

test("airdrop.json lists the three real tasks", () => {
  assert.equal(f.tasks.length, 3);
  assert.deepEqual(f.tasks.map(t => t.network), ["x", "x", "telegram"]);
  for (const t of f.tasks) {
    assert.equal(t.cost, "free");
    assert.match(t.url, /^https:\/\//);
  }
});

test("airdrop.json carries no mainnet token address before TGE", () => {
  assert.equal(f.tokenAddress, null);
  assert.ok(f.tokenAddressNote && f.tokenAddressNote.length > 40,
    "a null address needs an explanation, not silence");
});

test("robots.txt allows the answer-engine bots and points at the feed", () => {
  const robots = readFileSync(WEB + "/robots.txt", "utf8");
  for (const bot of ["GPTBot", "OAI-SearchBot", "PerplexityBot", "ClaudeBot", "Google-Extended", "Bingbot"]) {
    assert.ok(robots.includes(bot), `robots.txt must name ${bot}`);
  }
  assert.doesNotMatch(robots, /^\s*Disallow:\s*\/\s*$/m, "robots.txt must not block the whole site");
  assert.match(robots, /airdrop\.json/);
  assert.match(robots, /Sitemap: https:\/\/omc\.network\/sitemap\.xml/);
});

test("llms.txt describes both language versions and points at the feed", () => {
  const llms = readFileSync(WEB + "/llms.txt", "utf8");
  assert.match(llms, /airdrop\.json/);
  assert.match(llms, /\/zh/);
  // The old line claimed Chinese was client-side only. It is a static mirror
  // now; leaving the stale sentence in would tell crawlers to skip /zh.
  assert.doesNotMatch(llms, /language toggle \(client-side\)/);
  for (const fact of ["20,000,000", "1,000,000", "0.01 BNB", "100% at claim", "2027-01-01"]) {
    assert.ok(llms.includes(fact), `llms.txt must state ${fact}`);
  }
});

test("the airdrop page carries HowTo markup with five steps", () => {
  const html = readFileSync(WEB + "/airdrop.html", "utf8");
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map(m => JSON.parse(m[1]));
  const howto = blocks.find(b => b["@type"] === "HowTo");
  assert.ok(howto, "/airdrop must publish a HowTo block");
  assert.equal(howto.step.length, 5);
  assert.deepEqual(howto.step.map(s => s.position), [1, 2, 3, 4, 5]);
  assert.ok(blocks.some(b => b["@type"] === "FAQPage"), "FAQPage must stay alongside HowTo");
});

test("the static zh mirror carries the same structured data", () => {
  const html = readFileSync(WEB + "/zh/airdrop.html", "utf8");
  assert.match(html, /"@type":\s*"HowTo"/);
  assert.match(html, /"@type":\s*"FAQPage"/);
  assert.match(html, /"@type":\s*"BreadcrumbList"/);
});
