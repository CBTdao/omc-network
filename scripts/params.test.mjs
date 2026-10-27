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

test("emission schedule plus the DAO reserve spends exactly the pool", () => {
  const { scheduleOMC, pool, daoReserveOMC } = params.emission;
  assert.equal(scheduleOMC.length, 10, "the schedule is published as ten annual ceilings");
  const total = scheduleOMC.reduce((a, b) => a + b, 0);
  assert.equal(
    total + daoReserveOMC,
    pool,
    `schedule ${total} + reserve ${daoReserveOMC} != pool ${pool} — the difference is a number nobody can explain later`
  );
  assert.ok(daoReserveOMC > 0, "the pool is not fully scheduled on purpose; scheduling it all forces late-year ceilings up purely to balance the arithmetic");
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

/* ---------- the economic model ---------- */

test("the fee is split in full", () => {
  const s = params.fees.split;
  assert.equal(s.burnBps + s.stakersBps + s.treasuryBps, 10_000);
});

test("the fee split covers the entire fee, not more", () => {
  assert.ok(params.fees.protocolFeeBps > 0 && params.fees.protocolFeeBps <= 2_000, "a protocol take above 20% stops being competitive with Web2 cloud");
  assert.equal(params.fees.omcPaymentDiscountBps, 1_000);
});

test("the burn is large enough to matter against the schedule", () => {
  /* Burn, as a fraction of GMV: feeBps x burnBps / 1e8. */
  const burnOfGmv = (params.fees.protocolFeeBps * params.fees.split.burnBps) / 1e8;
  assert.ok(
    burnOfGmv >= 0.03,
    `burn is only ${(burnOfGmv * 100).toFixed(2)}% of GMV; below ~3% the sink cannot catch a 50M/year emission at any GMV a new network reaches`
  );
});

test("stakers earn a share of fees, not only emissions", () => {
  /* This is the difference between a yield farm and an income claim. */
  assert.ok(params.fees.split.stakersBps > 0, "with a zero staker slice, the only reason to stake is dilution");
});

test("the revenue gate tightens every year and reaches equilibrium", () => {
  const k = params.emission.revenueGate.k;
  assert.equal(k.length, 10);
  for (let i = 1; i < k.length; i++) {
    assert.ok(k[i] <= k[i - 1], `k rose in year ${i + 1} — dilution must not increase over time`);
  }
  /* At k = burnShare the gate regime is exactly net-zero: emission = burn. */
  const equilibrium = params.fees.split.burnBps / 10_000;
  assert.equal(k[k.length - 1], equilibrium, `the gate must converge to burnShare (${equilibrium}), otherwise the token never stops inflating`);
});

test("emission gate converges inside the published decade", () => {
  const k = params.emission.revenueGate.k;
  const equilibrium = params.fees.split.burnBps / 10_000;
  const year = k.findIndex((v) => v <= equilibrium) + 1;
  assert.ok(year > 0 && year <= 6, `equilibrium is only reached in year ${year}; an investor will ask when dilution stops, and "year 9" is a no`);
});

test("a node cannot stake and exit in the same block", () => {
  assert.ok(
    params.staking.unstakeCooldownDays >= 7,
    "with no cooldown, staking is a free option: farm emissions for a week, unstake, sell"
  );
});

test("the airdrop is not a day-one sell wall", () => {
  assert.ok(/25% at claim/.test(params.airdrop.vesting), "the claim must not release the whole allocation at once");
  assert.ok(/180 days/.test(params.airdrop.vesting));
});

test("a token round cannot be run without the disclosures an investor needs", () => {
  const c = params.capital;
  assert.equal(c.status, "no round closed", "if a round closes, this file must say so — an undisclosed raise is worse than no raise");
  const req = c.disclosureRequiredBeforeAnyRound.join(" ").toLowerCase();
  for (const item of ["fdv", "vesting", "treasury", "legal entity"]) {
    assert.ok(req.includes(item), `the disclosure list is missing "${item}"`);
  }
});

test("year one emission stays under a third of the TGE float", () => {
  // TGE float: airdrop 2% at 25% claimed + ecosystem, private, institutional and
  // half the treasury. Must match FLOAT_TGE in models/economics.mjs.
  const tgeFloat = 50_500_000;
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
  const a = params.airdrop;
  const maxAirdrop = a.perEntry * (a.baseEntries + a.referralEntries);
  const t1 = params.staking.tiers[0].usdTarget;
  /* The free-stake loop needs the airdrop to buy a bond. For that, one OMC would
     have to be worth tier-1 USD ÷ maxAirdrop. Asserting the number rather than a
     literal keeps the check meaningful when the allocation changes: the loop
     reopens if this falls to the price the claim fee already implies. */
  const impliedPrice = t1 / maxAirdrop;
  const claimPrice = (a.claimCost.feeBnb * a.claimCost.bnbReferenceUsd) / (a.perEntry * a.baseEntries);
  assert.ok(
    impliedPrice > claimPrice * 10,
    `a max airdrop buys a tier-1 bond at $${impliedPrice.toFixed(2)}/OMC, only ${(impliedPrice / claimPrice).toFixed(1)}x the ` +
      `$${claimPrice.toFixed(4)} the claim fee implies — the free-stake loop is closing`
  );
  assert.equal(a.perEntry * a.baseEntries, 200, "a base claim is 200 OMC; the fee is sized against it");
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
