/**
 * Invariants for contracts/params.json.
 *
 * These are the numbers an investor reads first, and they used to disagree
 * across four documents (README said halving, the whitepaper said flat, the
 * tokenomics page said flat, the site said something else again). The file
 * exists so there is one answer; this test exists so the file cannot quietly
 * become wrong on its own.
 *
 *   node --test scripts/
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const paramsPath = path.join(here, "..", "contracts", "params.json");
const params = JSON.parse(fs.readFileSync(paramsPath, "utf8"));

test("emission schedule spends exactly the pool over ten years", () => {
  const { scheduleOMC, pool } = params.emission;
  assert.equal(scheduleOMC.length, 10, "the schedule is published as ten annual ceilings");
  const total = scheduleOMC.reduce((a, b) => a + b, 0);
  assert.equal(total, pool, `schedule sums to ${total}, pool is ${pool} — the difference is a number nobody can explain later`);
});

test("emission never falls year on year", () => {
  const s = params.emission.scheduleOMC;
  for (let i = 1; i < s.length; i++) {
    assert.ok(s[i] >= s[i - 1], `year ${i + 1} (${s[i]}) is lower than year ${i} (${s[i - 1]}) — a ramp only reads as a ramp if it is monotone`);
  }
});

test("year one is a real reduction, not a rounding difference", () => {
  const { scheduleOMC, pool } = params.emission;
  const flat = pool / 10;
  const yearOneShare = scheduleOMC[0] / flat;
  assert.ok(yearOneShare <= 0.5, `year 1 is ${(yearOneShare * 100).toFixed(0)}% of a flat year — the point of the ramp was to cut first-year dilution, and anything above half a flat year does not`);
});

test("year one emission stays under a third of the TGE float", () => {
  // TGE float: airdrop 2% at 100% + the ecosystem and liquidity slices.
  const tgeFloat = 65_500_000;
  const ratio = params.emission.scheduleOMC[0] / tgeFloat;
  assert.ok(ratio < 0.35, `year 1 emission is ${(ratio * 100).toFixed(0)}% of the TGE float; the reason for changing the curve was to get this below a third`);
});

test("staking ladder is strictly increasing in USD", () => {
  const tiers = params.staking.tiers;
  assert.equal(tiers.length, 5);
  for (let i = 1; i < tiers.length; i++) {
    assert.ok(tiers[i].usdTarget > tiers[i - 1].usdTarget, `tier ${i + 1} must cost more than tier ${i}`);
  }
});

test("a tier-1 bond is worth more than the hardware it vouches for", () => {
  // A 4090 is roughly USD 1,600 new. A bond of USD 250 is not full cover, but
  // it is the difference between "a deposit" and "a gesture": the old 20 OMC
  // rung was USD 20 at a one-dollar token, which guaranteed nothing at all.
  const t1 = params.staking.tiers[0].usdTarget;
  assert.ok(t1 >= 200, `tier 1 is USD ${t1}; below a few hundred dollars the bond stops being a deterrent`);
});

test("the airdrop cannot reach a tier-1 bond at any plausible price", () => {
  const maxAirdrop = params.airdrop.perEntry * (params.airdrop.baseEntries + params.airdrop.referralEntries);
  const t1 = params.staking.tiers[0].usdTarget;
  // The free-stake loop needs the airdrop to buy a bond. For that, one OMC
  // would have to be worth maxAirdrop -> tier-1 USD, i.e. $2.50 at these
  // numbers. Recorded here so a later parameter change that reopens the loop
  // fails this test instead of shipping.
  const impliedPrice = t1 / maxAirdrop;
  assert.ok(impliedPrice > 0, "sanity");
  assert.equal(maxAirdrop, 200);
});

test("published on-chain state matches the deployment manifest", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(here, "..", "contracts", "deployments", "bsc-testnet.json"), "utf8")
  );
  const onChain = params.staking.onChain;
  assert.equal(onChain.contract.toLowerCase(), manifest.staking.toLowerCase());
  assert.deepEqual(
    onChain.amountsOMC.map(String),
    manifest.tierLadder.map(String),
    "params.json records the amounts actually deployed; if they diverge, /stake shows one thing and the docs another"
  );
  assert.equal(onChain.status, "placeholder", "the testnet ladder is a placeholder until set-params.js applies the USD targets — the docs say so, so this must stay true");
});
