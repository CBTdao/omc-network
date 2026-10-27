/**
 * The identities the claim-fee model depends on, plus the agreement between
 * that model and contracts/params.json.
 *
 * The arithmetic assertions are trivial. The three that matter are behavioural:
 *   1. the fee is revenue, not a liability — it is spent, so it filters;
 *   2. the fee is a *distribution price*, so the allocation has to be big enough
 *      that the price it implies is one a buyer would accept;
 *   3. the fee is a toll rather than a wall above a computable price, and the
 *      model must keep reporting that price even if someone edits the parameter.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MODES,
  OMC_PER_ENTRY,
  BASE_ENTRIES,
  REFERRAL_ENTRIES,
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

const BASE_OMC = OMC_PER_ENTRY * BASE_ENTRIES; // 200
const CAP_OMC = OMC_PER_ENTRY * (BASE_ENTRIES + REFERRAL_ENTRIES); // 400

const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

/* ---------- the model agrees with the published parameters ---------- */

test("params.json names a mode the model implements", () => {
  const mode = params.airdrop.claimCost.mode;
  assert.ok(MODES[mode], `params.json names mode "${mode}", which models/claim.mjs does not define`);
});

test("the shipped mode is the non-refundable fee", () => {
  /* The whole point of the change: money leaves the wallet and does not come
     back, so it can fund development and cannot be rotated by a farm. */
  assert.equal(params.airdrop.claimCost.mode, "fee");
  assert.equal(params.airdrop.claimCost.refundable, false);
  assert.equal(params.airdrop.claimCost.refundBps, undefined, "a refund path must not linger in the parameters");
  assert.equal(FEE.refundBps, 0);
  assert.equal(FEE.depositBnb, 0);
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

test("per-entry payload and caps match params.json", () => {
  assert.equal(OMC_PER_ENTRY, params.airdrop.perEntry);
  assert.equal(BASE_ENTRIES, params.airdrop.baseEntries);
  assert.equal(REFERRAL_ENTRIES, params.airdrop.referralEntries);
});

test("the published price anchor is the one the model computes", () => {
  const anchor = params.airdrop.claimCost.priceAnchor;
  assert.equal(anchor.baseClaimOmc, BASE_OMC);
  assert.equal(anchor.capClaimOmc, CAP_OMC);
  assert.ok(near(anchor.impliedPriceUsdBase, (CLAIM_FEE_BNB * BNB) / BASE_OMC, 1e-4));
  assert.ok(near(anchor.impliedPriceUsdCap, (CLAIM_FEE_BNB * BNB) / CAP_OMC, 1e-4));
});

/* ---------- the ratio that decides whether anyone claims ---------- */

test("the fee is a distribution price: breakeven = fee ÷ OMC received", () => {
  const f = settle(FEE, { entries: BASE_ENTRIES, omcPriceUsd: 0.1, bnbUsd: BNB });
  const expected = ((FEE.feeBnb + FEE.gasBnb) * BNB) / BASE_OMC;
  assert.ok(near(f.breakevenPriceUsd, expected));
  assert.ok(
    f.breakevenPriceUsd < 0.05,
    `the base claim must break even below a $0.05 listing, not at $${f.breakevenPriceUsd.toFixed(4)}`
  );
});

test("the allocation is large enough that the fee is a minority of the claim", () => {
  /* This is the assertion that would have caught 20 OMC per entry: at a $0.05
     listing a 100 OMC claim was worth $5.00 against a $7.72 charge, so the fee
     took 154% of the claim and nobody claimed. The cap is a judgement call, not
     a law — but the parameter must not silently undo it. */
  const feeUsd = (CLAIM_FEE_BNB + GAS_PER_CLAIM_BNB) * BNB;
  const claimUsd = BASE_OMC * 0.05;
  const share = feeUsd / claimUsd;
  assert.ok(share < 0.8, `the fee takes ${(share * 100).toFixed(0)}% of a base claim at $0.05`);
});

test("a bigger allocation lowers the price a claimant must believe in", () => {
  const base = settle(FEE, { entries: BASE_ENTRIES, omcPriceUsd: 0.1, bnbUsd: BNB });
  const cap = settle(FEE, { entries: BASE_ENTRIES + REFERRAL_ENTRIES, omcPriceUsd: 0.1, bnbUsd: BNB });
  assert.ok(cap.breakevenPriceUsd < base.breakevenPriceUsd);
  assert.ok(near(cap.breakevenPriceUsd * 2, base.breakevenPriceUsd), "double the allocation halves the fee per token");
});

/* ---------- revenue ---------- */

test("the fee is revenue, and it is recognised in full on claim day", () => {
  const f = settle(FEE, { entries: BASE_ENTRIES, omcPriceUsd: 0.1, bnbUsd: BNB });
  assert.ok(near(f.protocolRevenueUsd, CLAIM_FEE_BNB * BNB));
  assert.ok(near(f.outlayUsd, (CLAIM_FEE_BNB + GAS_PER_CLAIM_BNB) * BNB));
});

test("revenue is linear in claimers and split 60/40", () => {
  const a = revenue({ claimers: 10_000, bnbUsd: BNB });
  const b = revenue({ claimers: 20_000, bnbUsd: BNB });
  assert.ok(near(b.usd, a.usd * 2));
  assert.ok(near(a.bnb, 10_000 * CLAIM_FEE_BNB));
  assert.ok(near(a.ecosystemUsd + a.teamUsd, a.usd, 1e-6), "the split must not lose money");
  assert.ok(a.ecosystemUsd > a.teamUsd);
});

test("runway is revenue divided by burn, and it is a real number", () => {
  const r = revenue({ claimers: 25_000, bnbUsd: BNB, burnMonthlyUsd: 15_000 });
  assert.ok(
    r.monthsAtBurn > 10 && r.monthsAtBurn < 15,
    `25k claimers is ${r.monthsAtBurn.toFixed(1)} months at $15k/mo`
  );
});

test("the pool, not demand, is the ceiling on what the fee can raise", () => {
  const cap = capacity({});
  assert.equal(cap.slots, params.airdrop.pool / OMC_PER_ENTRY);
  assert.equal(cap.claims, cap.slots / BASE_ENTRIES);
  const ceiling = cap.claims * CLAIM_FEE_BNB;
  assert.equal(ceiling, 1_000, "500,000 entries ÷ 5 per claim = 100,000 claims = 1,000 BNB");
  assert.ok(ceiling * BNB < 1_000_000, "the airdrop alone cannot fund a company; the compute margin has to");
});

/* ---------- the sybil question ---------- */

test("the fee is a wall below the farm breakeven and a toll above it", () => {
  const s = settle(FEE, { entries: BASE_ENTRIES + REFERRAL_ENTRIES, omcPriceUsd: 0.05, bnbUsd: BNB });
  const expected = ((CLAIM_FEE_BNB + GAS_PER_CLAIM_BNB) * BNB) / CAP_OMC;
  assert.ok(near(s.farmBreakevenPriceUsd, expected));
  const base = settle(FEE, { entries: BASE_ENTRIES, omcPriceUsd: 0.05, bnbUsd: BNB });
  assert.ok(s.farmBreakevenPriceUsd < base.breakevenPriceUsd, "the cap allocation is the cheapest way to farm");
  assert.ok(near(params.airdrop.claimCost.sybilBreakeven.priceUsd, s.farmBreakevenPriceUsd, 1e-3));
});

test("a farm's cost is sunk, so it cannot be rotated like a deposit", () => {
  const f = settle(FEE, { entries: BASE_ENTRIES, omcPriceUsd: 0.1, bnbUsd: BNB });
  assert.equal(f.refundUsd, 0);
  assert.equal(f.netIfForfeitedUsd, f.netAfterRefundUsd, "in fee mode there is no second state to fall back to");
  const d = settle(DEP, { entries: BASE_ENTRIES, omcPriceUsd: 0.1, bnbUsd: BNB });
  assert.ok(d.refundUsd > 0);
  assert.equal(d.protocolRevenueUsd, 0, "an escrowed deposit stays a liability");
});

test("cash outlay is the number a farm has to fund per wallet", () => {
  const f = settle(FEE, { entries: BASE_ENTRIES, omcPriceUsd: 0.1, bnbUsd: BNB });
  assert.ok(near(f.outlayUsd, (CLAIM_FEE_BNB + GAS_PER_CLAIM_BNB) * BNB));
  const g = settle(GAS, { entries: BASE_ENTRIES, omcPriceUsd: 0.1, bnbUsd: BNB });
  assert.ok(f.outlayUsd > g.outlayUsd * 20, "the fee must dominate gas, or it filters nothing");
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

test("the fixed cost is amortised over more entries", () => {
  for (const mode of [GAS, DEP, FEE]) {
    const a = settle(mode, { entries: BASE_ENTRIES, omcPriceUsd: 0.1, bnbUsd: BNB });
    const b = settle(mode, { entries: BASE_ENTRIES + REFERRAL_ENTRIES, omcPriceUsd: 0.1, bnbUsd: BNB });
    assert.ok(b.totalCostPct < a.totalCostPct, `${mode.name} cost share must fall with more entries`);
  }
});

test("a full refund leaves the claimant exactly where gas-only leaves them", () => {
  /* Kept because the deposit mode stays in the code: if it is ever switched
     back on, this property is the reason it was defensible. */
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
    assert.ok(!Number.isNaN(s.netAfterRefundUsd));
    assert.ok(!Number.isNaN(s.breakevenPriceUsd) || s.breakevenPriceUsd === Infinity);
  }
});
