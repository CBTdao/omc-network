/**
 * The "what 20 OMC is actually for" section is the first place the campaign
 * answers the only question a claimant is really asking: what am I getting.
 *
 * Every figure in it is arithmetic on contracts/params.json, so it is computed
 * here and compared to the page rather than eyeballed. The failure this guards
 * against is not a typo, it is a parameter change that leaves a stale promise
 * on a page people are deciding from — for example raising the tier-1 bond
 * while the copy still says the airdrop covers 30% of it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { FLOAT_TGE, MAX_SUPPLY } from "../models/economics.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...p) => readFileSync(join(root, ...p), "utf8");

const params = JSON.parse(read("contracts/params.json"));
const feed = JSON.parse(read("website/airdrop.json")).airdrop;

const EN = read("website/airdrop.html");
const ZH = read("website/zh/airdrop.html");

const supply = MAX_SUPPLY;
const per = params.airdrop.perEntry;
const maxEntries = feed.entryCaps.maxEntriesPerWallet;
const maxPerWallet = feed.entryCaps.maxPerWallet;
const price = feed.disclosures.impliedPricePerOmcUsd;
const bondUsd = params.staking.tiers[0].usdTarget;
const ceiling = params.staking.aprCeilingPct;
const yearOne = params.emission.scheduleOMC[0];

/** 0.000002 — keep the significant digits, do not round the share to 0%. */
const pct = (part) => {
  const v = (part / supply) * 100;
  if (v >= 0.01) return `${Number(v.toFixed(2))}%`;
  const digits = Math.max(0, Math.ceil(-Math.log10(v)) + 1);
  return `${Number(v.toFixed(digits))}%`;
};

const bondOmc = Math.round(bondUsd / price);
const coverage = Math.round(((maxPerWallet * price) / bondUsd) * 100);

test("supply-share figures match the supply the contract has", () => {
  assert.ok(EN.includes(pct(per)), `page must state ${pct(per)} for a single entry`);
  assert.ok(EN.includes(pct(maxPerWallet)), `page must state ${pct(maxPerWallet)} for a full claim`);
  assert.ok(ZH.includes(pct(per)), "the Chinese mirror drifted from the English figures");
});

test("the node-bond comparison matches the published tier ladder", () => {
  assert.ok(EN.includes(`$${bondUsd}`), `page must quote the tier-1 bond of $${bondUsd}`);
  assert.ok(EN.includes(String(bondOmc)), `page must state the bond in OMC: ${bondOmc}`);
  assert.ok(EN.includes(`${coverage}%`), `page must state the coverage figure: ${coverage}%`);
  assert.ok(ZH.includes(`${coverage}%`), "zh mirror disagrees on the coverage figure");
});

test("the rate table is the schedule divided by stake, capped", () => {
  const rows = [10_000_000, 20_000_000, 50_000_000, 100_000_000];
  for (const stake of rows) {
    const apr = Math.min(ceiling, Math.round((yearOne / stake) * 100));
    const label = stake.toLocaleString("en-US");
    assert.match(
      EN,
      new RegExp(`<td[^>]*>${label} OMC</td>\\s*<td[^>]*><b>${apr}%</b>`),
      `table row for ${label} OMC must show ${apr}%`,
    );
  }

  // The TGE-float row is the one a reader closest to the launch will care about.
  const float20 = Math.round(FLOAT_TGE * 0.2);
  const aprFloat = Math.min(ceiling, Math.round((yearOne / float20) * 100));
  assert.match(
    EN,
    new RegExp(`<td[^>]*>[^<]*${float20.toLocaleString("en-US")}[^<]*</td>\\s*<td[^>]*><b>${aprFloat}%</b>`),
    `the 20%-of-float row must show ${aprFloat}%`,
  );
});

test("the ceiling is declared as a parameter, not implied by copy", () => {
  assert.equal(params.staking.aprCeilingPct, 100, "aprCeilingPct must be a stated parameter");
  assert.match(params.staking.aprFormula, /min\(/, "the formula must express the cap");
  assert.ok(params.staking.aprCeilingRationale.length > 200,
    "a ceiling without a rationale reads as a promised yield");
  assert.ok(EN.includes("ceiling 100%"), "the table header must name the ceiling");
});

test("the section refuses to publish a headline rate", () => {
  // The revenue gate means year-one emission can be zero. A section that shows a
  // rate without that caveat is the kind of claim that gets screenshotted and
  // then used against the project when January arrives and nothing is paid.
  assert.match(EN, /ceiling is not a promise/i);
  assert.match(EN, /gated on fee revenue/i);
  assert.match(ZH, /上限不是承诺/);
  assert.match(ZH, /手续费/);
  for (const page of [EN, ZH]) {
    assert.doesNotMatch(page, /guaranteed (return|apy|apr)/i);
    assert.doesNotMatch(page, /稳定年化|保本年化|固定收益/);
  }
});

test("both language versions carry the section", () => {
  assert.match(EN, /What 20 OMC is actually for/);
  assert.match(ZH, /20 OMC 到底是什么/);
  assert.equal((EN.match(/id="value"/g) || []).length, 1, "one section, not a duplicated block");
});
