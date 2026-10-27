/**
 * The identities the supply model depends on. If one of these breaks, the
 * numbers in the whitepaper are wrong and nothing else in this repo would
 * notice — the docs quote the model, the model quotes these.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  CURRENT,
  PROPOSED,
  SCENARIOS,
  FLOAT_TGE,
  MAX_SUPPLY,
  project,
  thresholds,
  gateRegimeRatio,
} from "./economics.mjs";

const PRICE = 0.02;

test("fee splits add up to the whole fee", () => {
  for (const d of [CURRENT, PROPOSED]) {
    assert.equal(
      d.burnShareBps + d.stakerShareBps + d.treasuryShareBps,
      10_000,
      d.name + " does not distribute 100% of the fee"
    );
  }
});

test("the revenue gate only ever tightens: k is non-increasing", () => {
  for (let i = 1; i < PROPOSED.revenueGateK.length; i++) {
    assert.ok(
      PROPOSED.revenueGateK[i] <= PROPOSED.revenueGateK[i - 1],
      "k rose in year " + (i + 1) + " — dilution would increase over time"
    );
  }
});

test("emission never exceeds the ceiling, and never exceeds the gate", () => {
  for (const [name, gmv] of Object.entries(SCENARIOS)) {
    const res = project(PROPOSED, { gmv, price: PRICE });
    for (const r of res.rows) {
      assert.ok(r.emission <= r.ceiling + 1e-9, name + " y" + r.year + " broke the ceiling");
      if (r.gate !== null) {
        assert.ok(r.emission <= r.gate + 1e-9, name + " y" + r.year + " broke the gate");
      }
    }
  }
});

test("burn ÷ emission in the gate regime is exactly burnShare / k", () => {
  /* This is the price- and GMV-independent claim the docs lead with, so it is
     verified against a hand-computed value rather than against itself. */
  assert.equal(gateRegimeRatio(PROPOSED, 1), 0.5 / 3);
  assert.equal(gateRegimeRatio(PROPOSED, 4), 0.5 / 1);
  assert.equal(gateRegimeRatio(PROPOSED, 6), 1); // emission = burn: supply flat
  assert.equal(gateRegimeRatio(CURRENT, 1), null); // no gate at all
});

test("at k = 0.5 the gate regime is exactly net-zero, by construction", () => {
  const y = 6;
  assert.equal(PROPOSED.revenueGateK[y - 1], 0.5);
  const ratio = gateRegimeRatio(PROPOSED, y);
  assert.ok(Math.abs(ratio - 1) < 1e-12, "k=0.5 must make burn equal emission");

  /* And verify it on a run where the gate is the binding constraint. */
  const gmv = SCENARIOS.conservative;
  const res = project(PROPOSED, { gmv, price: PRICE });
  const row = res.rows[y - 1];
  assert.equal(row.boundBy, "gate", "this scenario must have the gate binding in year 6");
  assert.ok(Math.abs(row.net) < 1e-6, "net supply change must be zero, got " + row.net);
});

test("the proposed design dilutes less than the current one in every scenario", () => {
  for (const [name, gmv] of Object.entries(SCENARIOS)) {
    const a = project(CURRENT, { gmv, price: PRICE });
    const b = project(PROPOSED, { gmv, price: PRICE });
    assert.ok(
      b.rows[0].inflationPct < a.rows[0].inflationPct,
      name + ": year-1 inflation did not improve (" + a.rows[0].inflationPct.toFixed(1) + "% → " + b.rows[0].inflationPct.toFixed(1) + "%)"
    );
    assert.ok(
      b.burned / b.emitted > a.burned / a.emitted,
      name + ": sink/source did not improve"
    );
  }
});

test("ten-year supply stays inside the max supply, in every scenario", () => {
  for (const design of [CURRENT, PROPOSED]) {
    for (const [name, gmv] of Object.entries(SCENARIOS)) {
      const res = project(design, { gmv, price: PRICE });
      assert.ok(
        res.circulatingEnd <= MAX_SUPPLY,
        design.name + " " + name + ": circulating " + res.circulatingEnd + " exceeds max supply"
      );
      assert.ok(res.circulatingEnd >= 0, design.name + " " + name + ": negative supply");
    }
  }
});

test("nothing is emitted before TGE float exists", () => {
  const res = project(PROPOSED, { gmv: SCENARIOS.base, price: PRICE });
  assert.equal(res.rows[0].start, FLOAT_TGE);
});

test("net-zero GMV rises with price, because burn is denominated in OMC", () => {
  const a = thresholds(PROPOSED, 0.01)[0].netZeroGmv;
  const b = thresholds(PROPOSED, 0.02)[0].netZeroGmv;
  const c = thresholds(PROPOSED, 0.05)[0].netZeroGmv;
  assert.ok(a < b && b < c, "net-zero GMV must scale linearly with price");
});

test("doubling the fee with an unchanged burn share doubles the sink", () => {
  const doubled = { ...PROPOSED, feeBps: 1_600 };
  const a = project(PROPOSED, { gmv: SCENARIOS.base, price: PRICE });
  const b = project(doubled, { gmv: SCENARIOS.base, price: PRICE });
  assert.ok(Math.abs(b.rows[0].burn / a.rows[0].burn - 2) < 1e-9);
});
