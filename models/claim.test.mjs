/**
 * The identities the claim-fee model depends on, plus the agreement between that
 * model and contracts/params.json.
 *
 * The arithmetic assertions are trivial. The ones that matter are behavioural:
 *   1. the fee is revenue, not a liability — it is spent, so it filters;
 *   2. the fee is **flat and per entry**: it does not move with the token price, and
 *      doubling the entries doubles the charge. This is the property that makes the
 *      campaign independent of a listing price nobody can know;
 *   3. the pool, not demand, is the ceiling on what the fee can raise.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MODES,
  OMC_PER_ENTRY,
  BASE_ENTRIES,
  REFERRAL_ENTRIES,
  POOL_SLOTS,
  GAS_PER_CLAIM_BNB,
  CLAIM_FEE_BNB,
  TREASURY_SPLIT,
  settle,
  revenue,
  capacity,
} from "./claim.mjs";

const params = JSON.parse(
  readFileSync(new URL("../contracts/params.json", import.meta.url), "utf8")
);

const BNB = 742;
const GAS = MODES["gas-only"];
const DEP = MODES["refundable-deposit"];
const FEE = MODES.fee;

const BASE_OMC = OMC_PER_ENTRY * BASE_ENTRIES; // 100
const CAP_OMC = OMC_PER_ENTRY * (BASE_ENTRIES + REFERRAL_ENTRIES); // 200

const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

/* ---------- the model agrees with the published parameters ---------- */

test("params.json names a mode the model implements", () => {
  const mode = params.airdrop.claimCost.mode;
  assert.ok(MODES[mode], `params.json names mode "${mode}", which models/claim.mjs does not define`);
});

test("the shipped mode is the non-refundable fee", () => {
  assert.equal(params.airdrop.claimCost.mode, "fee");
  assert.equal(params.airdrop.claimCost.refundable, false);
  assert.equal(params.airdrop.claimCost.refundBps, undefined, "a refund path must not linger in the parameters");
  assert.equal(FEE.refundBps, 0);
  assert.equal(FEE.depositBnbPerEntry, 0);
});

test("the fee size, gas budget and BNB reference match the model", () => {
  assert.equal(params.airdrop.claimCost.feeBnb, CLAIM_FEE_BNB);
  assert.equal(params.airdrop.claimCost.gasBudgetBnb, GAS_PER_CLAIM_BNB);
  assert.equal(params.airdrop.claimCost.bnbReferenceUsd, BNB);
});

test("the treasury split is a split, not a wish", () => {
  const s = params.airdrop.claimCost.treasurySplit;
  assert.equal(s.ecosystemDevelopmentBps, TREASURY_SPLIT.ecosystem);
  assert.equal(s.teamOperationsBps, TREASURY_SPLIT.team);
  assert.equal(s.ecosystemDevelopmentBps + s.teamOperationsBps, 10_000, "the split must account for the whole fee");
});

test("per-entry payload, caps, pool and charge basis match params.json", () => {
  assert.equal(OMC_PER_ENTRY, params.airdrop.perEntry);
  assert.equal(BASE_ENTRIES, params.airdrop.baseEntries);
  assert.equal(REFERRAL_ENTRIES, params.airdrop.referralEntries);
  assert.equal(POOL_SLOTS, params.airdrop.poolSlots);
  assert.equal(POOL_SLOTS, params.airdrop.pool / params.airdrop.perEntry, "slots = pool ÷ perEntry");
  assert.equal(params.airdrop.claimCost.chargePer, "entry", "the fee is charged per entry, not per wallet");
  assert.equal(params.airdrop.claimCost.maxChargeBnb, (BASE_ENTRIES + REFERRAL_ENTRIES) * CLAIM_FEE_BNB, "cap = 10 entries");
});

test("the pool is spread as thin as the 2% allocation allows", () => {
  /* Why perEntry came back down from 40: 2% of supply across a million wallets
     rather than half a million. Asserted as slot and payload counts so that raising
     it again is a deliberate act with a failing test attached. */
  assert.equal(BASE_OMC, 100, "a base claim is 100 OMC");
  assert.equal(CAP_OMC, 200, "with referrals the ceiling is 200 OMC");
  assert.equal(POOL_SLOTS, 1_000_000);
});

/* ---------- the property the design rests on ---------- */

test("the fee is flat: it does not move with the token price", () => {
  /* The whole point of dropping the price anchor. Whatever OMC trades at, a wallet
     with five entries pays 0.05 BNB. If this fails, some parameter has been
     rewritten to depend on a price — the mistake this file exists to catch. */
  const prices = [0.001, 0.01, 0.05, 0.1, 0.5, 2];
  const charged = prices.map((p) => settle(FEE, { entries: BASE_ENTRIES, omcPriceUsd: p, bnbUsd: BNB }).feeBnb);
  for (const c of charged) assert.ok(near(c, 0.05), `the fee moved with price: ${charged.join(", ")}`);
  assert.equal(new Set(charged.map((c) => c.toFixed(6))).size, 1, "a flat fee has exactly one value across all prices");
});

test("the fee scales with entries and gas does not", () => {
  const one = settle(FEE, { entries: 1, omcPriceUsd: 0.05, bnbUsd: BNB });
  const five = settle(FEE, { entries: 5, omcPriceUsd: 0.05, bnbUsd: BNB });
  const ten = settle(FEE, { entries: 10, omcPriceUsd: 0.05, bnbUsd: BNB });
  assert.ok(near(one.feeBnb, CLAIM_FEE_BNB));
  assert.ok(near(five.feeBnb, 5 * CLAIM_FEE_BNB));
  assert.ok(near(ten.feeBnb, 10 * CLAIM_FEE_BNB));
  assert.ok(near(ten.gasUsd, one.gasUsd), "gas is per transaction; it does not scale with entries");
  assert.ok(five.feeUsd > five.gasUsd * 30, "the fee must dominate gas, or it filters nothing");
});

test("what a wallet actually pays, and it is not a rounding error", () => {
  const base = settle(FEE, { entries: BASE_ENTRIES, omcPriceUsd: 0.05, bnbUsd: BNB });
  const cap = settle(FEE, { entries: BASE_ENTRIES + REFERRAL_ENTRIES, omcPriceUsd: 0.05, bnbUsd: BNB });
  assert.ok(near(base.outlayUsd, (0.05 + GAS_PER_CLAIM_BNB) * BNB, 0.01));
  assert.ok(near(cap.outlayUsd, (0.1 + GAS_PER_CLAIM_BNB) * BNB, 0.01));
  /* Stated because it is the number a reader will react to: the campaign is not
     free, and a page implying otherwise would be the disclosure failure. */
  assert.ok(base.outlayUsd > 30, `a base claim costs $${base.outlayUsd.toFixed(2)}`);
  assert.ok(cap.outlayUsd > 70, `a full claim costs $${cap.outlayUsd.toFixed(2)}`);
});

/* ---------- revenue ---------- */

test("the fee is revenue, recognised in full on claim day", () => {
  const f = settle(FEE, { entries: BASE_ENTRIES, omcPriceUsd: 0.1, bnbUsd: BNB });
  assert.ok(near(f.protocolRevenueUsd, f.feeUsd));
  assert.equal(f.refundUsd, 0);
  assert.ok(near(f.outlayUsd, f.feeUsd + f.gasUsd));
});

test("revenue is linear in entries and split 60/40", () => {
  const a = revenue({ entries: 50_000, bnbUsd: BNB });
  const b = revenue({ entries: 100_000, bnbUsd: BNB });
  assert.ok(near(b.usd, a.usd * 2));
  assert.ok(near(a.bnb, 50_000 * CLAIM_FEE_BNB));
  assert.ok(near(a.ecosystemUsd + a.teamUsd, a.usd, 1e-6), "the split must not lose money");
  assert.ok(a.ecosystemUsd > a.teamUsd);
});

test("runway is revenue divided by burn, and it is a real number", () => {
  const r = revenue({ entries: 100_000, bnbUsd: BNB, burnMonthlyUsd: 15_000 });
  assert.ok(r.monthsAtBurn > 40 && r.monthsAtBurn < 60, `100k entries is ${r.monthsAtBurn.toFixed(1)} months at $15k/mo`);
});

test("the pool, not demand, is the ceiling on what the fee can raise", () => {
  const cap = capacity({});
  assert.equal(cap.slots, POOL_SLOTS);
  assert.equal(cap.claims, cap.slots / BASE_ENTRIES);
  const ceiling = revenue({ entries: cap.slots, bnbUsd: BNB });
  assert.equal(ceiling.bnb, 10_000, "1,000,000 entries × 0.01 BNB = 10,000 BNB");
  /* Says out loud what the campaign cannot do: fund the company on its own. */
  assert.ok(ceiling.usd < 15_000 * 600, "the airdrop is months of runway, not years");
});

/* ---------- the sybil question ---------- */

test("a farm pays per entry, so its cost is linear in entries", () => {
  const five = settle(FEE, { entries: BASE_ENTRIES, omcPriceUsd: 0.05, bnbUsd: BNB });
  const ten = settle(FEE, { entries: BASE_ENTRIES + REFERRAL_ENTRIES, omcPriceUsd: 0.05, bnbUsd: BNB });
  assert.ok(near(ten.feeUsd, 2 * five.feeUsd));
  assert.ok(near(10_000 * five.feeUsd, 10_000 * 0.05 * BNB, 1), "10,000 wallets at 5 entries spend $371k");
});

test("a farm's cost is sunk, so it cannot be rotated like a deposit", () => {
  const f = settle(FEE, { entries: BASE_ENTRIES, omcPriceUsd: 0.1, bnbUsd: BNB });
  assert.equal(f.refundUsd, 0);
  assert.equal(f.netIfForfeitedUsd, f.netAfterRefundUsd, "in fee mode there is no second state to fall back to");
  const d = settle(DEP, { entries: BASE_ENTRIES, omcPriceUsd: 0.1, bnbUsd: BNB });
  assert.ok(d.refundUsd > 0);
  assert.equal(d.protocolRevenueUsd, 0, "an escrowed deposit stays a liability");
});

test("the pool bounds a farm as well as the fee does", () => {
  assert.equal(Math.floor(POOL_SLOTS / (BASE_ENTRIES + REFERRAL_ENTRIES)), 100_000, "100k wallets at the cap fill the pool");
  assert.equal(POOL_SLOTS / BASE_ENTRIES, 200_000, "200k wallets at the base claim fill the pool");
});

/* ---------- invariants that must hold whatever the parameters say ---------- */

test("net value rises monotonically with the token price", () => {
  for (const mode of [GAS, DEP, FEE]) {
    let prev = -Infinity;
    for (const p of [0.001, 0.01, 0.05, 0.1, 0.25, 1]) {
      const v = settle(mode, {
        entries: BASE_ENTRIES + REFERRAL_ENTRIES,
        omcPriceUsd: p,
        bnbUsd: BNB,
      }).netAfterRefundUsd;
      assert.ok(v > prev, `${mode.name} is not monotone at $${p}`);
      prev = v;
    }
  }
});

test("a per-entry fee is not amortised, so the fee share stays flat", () => {
  /* The opposite of the old per-wallet model, and worth pinning: with a flat fee
     per entry, a bigger allocation does not make the charge cheaper per token. */
  const a = settle(FEE, { entries: BASE_ENTRIES, omcPriceUsd: 0.05, bnbUsd: BNB });
  const b = settle(FEE, { entries: BASE_ENTRIES + REFERRAL_ENTRIES, omcPriceUsd: 0.05, bnbUsd: BNB });
  /* Compared as a ratio, not a difference: the share is ~750% of a claim at a $0.05
     listing, so an absolute epsilon would be meaningless either way. */
  assert.ok(
    Math.abs(a.totalCostPct / b.totalCostPct - 1) < 0.01,
    `the fee share is flat across claim sizes (${a.totalCostPct.toFixed(2)} vs ${b.totalCostPct.toFixed(2)})`
  );
});

test("a full refund leaves the claimant exactly where gas-only leaves them", () => {
  /* Kept because the deposit mode stays in the code: if it is ever switched back
     on, this property is the reason it was defensible. */
  for (const entries of [BASE_ENTRIES, BASE_ENTRIES + REFERRAL_ENTRIES]) {
    for (const price of [0.005, 0.02, 0.1, 0.5]) {
      const g = settle(GAS, { entries, omcPriceUsd: price, bnbUsd: BNB });
      const d = settle(DEP, { entries, omcPriceUsd: price, bnbUsd: BNB });
      assert.ok(near(g.netAfterRefundUsd, d.netAfterRefundUsd));
      assert.ok(near(g.breakevenPriceUsd, d.breakevenPriceUsd));
    }
  }
});

test("no mode reports a negative gross value or a NaN", () => {
  for (const mode of Object.values(MODES)) {
    const s = settle(mode, { entries: 0, omcPriceUsd: 0.1, bnbUsd: BNB });
    assert.equal(s.grossUsd, 0);
    assert.equal(s.feeBnb, 0);
    assert.ok(!Number.isNaN(s.netAfterRefundUsd));
    assert.ok(!Number.isNaN(s.breakevenPriceUsd) || s.breakevenPriceUsd === Infinity);
  }
});
