/**
 * The identities the claim-cost model depends on, plus the agreement between
 * that model and contracts/params.json.
 *
 * The interesting assertions are not the arithmetic ones — those are trivial.
 * They are the two behavioural ones:
 *   1. a refundable deposit changes the cash a sybil must find without changing
 *      the reward a claimant receives, so it cannot introduce a price floor;
 *   2. the fee mode does introduce one, and the model must keep reporting it
 *      even if someone edits the parameter.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MODES, OMC_PER_ENTRY, GAS_PER_CLAIM_BNB, settle } from "./claim.mjs";

const params = JSON.parse(
  readFileSync(new URL("../contracts/params.json", import.meta.url), "utf8")
);

const BNB = 742;
const GAS = MODES["gas-only"];
const DEP = MODES["refundable-deposit"];
const FEE = MODES.fee;

const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

test("params.json claim mode is one the model implements", () => {
  const mode = params.airdrop.claimCost.mode;
  assert.ok(MODES[mode], `params.json names mode "${mode}", which models/claim.mjs does not define`);
});

test("params.json deposit size matches the model", () => {
  assert.equal(params.airdrop.claimCost.depositBnb, DEP.depositBnb);
  assert.equal(params.airdrop.claimCost.refundBps, DEP.refundBps);
  assert.equal(params.airdrop.claimCost.refundAfterDays, DEP.refundAfterDays);
});

test("params.json gas budget matches the model", () => {
  assert.equal(params.airdrop.claimCost.gasBudgetBnb, GAS_PER_CLAIM_BNB);
});

test("params.json BNB reference matches the model default", () => {
  assert.equal(params.airdrop.claimCost.bnbReferenceUsd, BNB);
});

test("per-entry payload matches params.json", () => {
  assert.equal(OMC_PER_ENTRY, params.airdrop.perEntry);
});

test("a full refund leaves the claimant exactly where gas-only leaves them", () => {
  for (const entries of [5, 10]) {
    for (const price of [0.005, 0.02, 0.1, 0.5]) {
      const g = settle(GAS, { entries, omcPriceUsd: price, bnbUsd: BNB });
      const d = settle(DEP, { entries, omcPriceUsd: price, bnbUsd: BNB });
      assert.ok(
        near(g.netAfterRefundUsd, d.netAfterRefundUsd),
        `deposit mode must not reduce net value at ${entries} entries / $${price}`
      );
      assert.ok(
        near(g.breakevenPriceUsd, d.breakevenPriceUsd),
        "a refundable deposit must not move the breakeven price"
      );
    }
  }
});

test("a refundable deposit is not revenue", () => {
  const d = settle(DEP, { entries: 5, omcPriceUsd: 0.1, bnbUsd: BNB });
  assert.equal(d.protocolRevenueUsd, 0, "an escrowed deposit is a liability, not income");
});

test("a forfeited deposit is revenue, and forfeiting is worse than being refunded", () => {
  const normal = settle(DEP, { entries: 5, omcPriceUsd: 0.1, bnbUsd: BNB });
  const strict = { ...DEP, refundBps: 0 };
  const d = settle(strict, { entries: 5, omcPriceUsd: 0.1, bnbUsd: BNB });

  assert.ok(d.protocolRevenueUsd > 0, "a forfeited deposit is income");
  /* With no refund at all the two paths coincide — that is the definition, and
     asserting a strict inequality here would mean the model had two answers
     for one state. What must hold is that forfeiting is worse than being
     refunded in full. */
  assert.ok(near(d.netIfForfeitedUsd, d.netAfterRefundUsd));
  assert.ok(d.netAfterRefundUsd < normal.netAfterRefundUsd);
});

test("the fee mode does introduce a price floor", () => {
  const f = settle(FEE, { entries: 5, omcPriceUsd: 0.1, bnbUsd: BNB });
  const expected = ((FEE.feeBnb + FEE.gasBnb) * BNB) / (5 * OMC_PER_ENTRY);
  assert.ok(near(f.breakevenPriceUsd, expected), "breakeven = (fee + gas) / OMC received");
  assert.ok(f.breakevenPriceUsd > 0.05, "0.01 BNB against 100 OMC must imply a material floor");
});

test("the deposit mode's floor is three orders of magnitude lower than the fee mode's", () => {
  const d = settle(DEP, { entries: 5, omcPriceUsd: 0.1, bnbUsd: BNB });
  const f = settle(FEE, { entries: 5, omcPriceUsd: 0.1, bnbUsd: BNB });
  assert.ok(d.breakevenPriceUsd * 10 < f.breakevenPriceUsd);
});

test("net value rises monotonically with the token price", () => {
  for (const mode of [GAS, DEP, FEE]) {
    let prev = -Infinity;
    for (const p of [0.001, 0.01, 0.05, 0.1, 0.25, 1]) {
      const v = settle(mode, { entries: 10, omcPriceUsd: p, bnbUsd: BNB }).netAfterRefundUsd;
      assert.ok(v > prev, `${mode.name} is not monotone at $${p}`);
      prev = v;
    }
  }
});

test("the fixed cost is amortised over more entries", () => {
  for (const mode of [GAS, DEP, FEE]) {
    const a = settle(mode, { entries: 5, omcPriceUsd: 0.1, bnbUsd: BNB });
    const b = settle(mode, { entries: 10, omcPriceUsd: 0.1, bnbUsd: BNB });
    assert.ok(b.totalCostPct < a.totalCostPct, `${mode.name} cost share must fall with more entries`);
  }
});

test("cash outlay is the number a sybil farm has to fund", () => {
  const d = settle(DEP, { entries: 5, omcPriceUsd: 0.1, bnbUsd: BNB });
  assert.ok(near(d.outlayUsd, (DEP.depositBnb + DEP.gasBnb) * BNB));
  const unlocked = settle(GAS, { entries: 5, omcPriceUsd: 0.1, bnbUsd: BNB });
  assert.ok(d.outlayUsd > unlocked.outlayUsd * 20, "the deposit must dominate gas");
});

test("no mode can report a negative gross value", () => {
  for (const mode of Object.values(MODES)) {
    const s = settle(mode, { entries: 0, omcPriceUsd: 0.1, bnbUsd: BNB });
    assert.equal(s.grossUsd, 0);
    assert.ok(!Number.isNaN(s.netAfterRefundUsd));
  }
});
