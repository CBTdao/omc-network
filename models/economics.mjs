#!/usr/bin/env node
/**
 * Token supply model — the arithmetic behind contracts/params.json.
 *
 *   node models/economics.mjs                       # both designs, three scenarios
 *   node models/economics.mjs --scenario aggressive
 *   node models/economics.mjs --price 0.05
 *   node models/economics.mjs --breakeven           # GMV needed for net-zero, by price
 *   node models/economics.mjs --json
 *
 * Why a script instead of a spreadsheet: every figure in the whitepaper is a
 * claim, and a claim nobody can re-derive is a claim nobody should believe.
 * models/economics.test.mjs asserts the identities this file relies on.
 *
 * THE ONE ASSUMPTION TO KEEP IN MIND
 * Price is held constant. That is wrong in the direction that matters: burn is
 * denominated in OMC, so a rising price makes each dollar of GMV burn fewer
 * tokens. Holding price fixed therefore OVERSTATES deflation at high GMV — which
 * is why burn is clamped at circulating supply and flagged † rather than being
 * allowed to drive supply negative. Read the low-GMV rows as the honest ones and
 * the high-GMV rows as "deflationary, and price would have moved".
 */

const BPS = 10_000;

/* 50.5M = 5.05% of 1B: treasury 25M + airdrop 5M (25% of the 20M pool is
   claimable at TGE, the other 75% vests over 180 days) + private 8M +
   ecosystem 7.5M + institutional 5M. The airdrop used to be counted at 100%,
   which made the float 65.5M; releasing 25% at claim removes 15M from day one,
   and a smaller float raises the same emission by more percentage points —
   which is why the inflation figures below moved up, not down. */
export const FLOAT_TGE = 50_500_000;
export const MAX_SUPPLY = 1_000_000_000;

/* ---------- the two designs ---------- */

export const CURRENT = {
  name: "current",
  label: "Current — fee 3%, 30% of fee burned, emission ignores revenue",
  feeBps: 300,
  burnShareBps: 3_000,
  stakerShareBps: 0, //    stakers earn emissions only; no share of fees
  treasuryShareBps: 7_000,
  scheduleOMC: [15e6, 30e6, 45e6, 50e6, 60e6, 60e6, 60e6, 60e6, 60e6, 60e6],
  revenueGateK: null, //    no gate
  unstakeCooldownDays: 0,
  airdropVesting: "100% at claim",
};

export const PROPOSED = {
  name: "proposed",
  label: "Proposed — fee 8%, 50% of fee burned, emission gated by revenue",
  feeBps: 800,
  burnShareBps: 5_000, //   of the fee → 4.0% of GMV
  stakerShareBps: 3_000, // real yield, pro-rata stake
  treasuryShareBps: 2_000,
  /* Ceilings, not entitlements. In most years the gate below binds first, and
     whatever the gate withholds stays unminted — it is not deferred. */
  scheduleOMC: [10e6, 20e6, 30e6, 40e6, 50e6, 50e6, 50e6, 50e6, 50e6, 50e6],
  /* Emission ≤ k × fee revenue of the trailing 30 days. k decays to 0.5, where
     emission equals burn and circulating supply stops growing. */
  revenueGateK: [3, 2, 1.5, 1, 0.75, 0.5, 0.5, 0.5, 0.5, 0.5],
  unstakeCooldownDays: 14,
  airdropVesting: "25% at claim + 75% linear over 180 days",
};

export const SCENARIOS = {
  conservative: [0.15e6, 0.8e6, 2.5e6, 6e6, 12e6, 18e6, 22e6, 25e6, 28e6, 30e6],
  base: [0.3e6, 2e6, 8e6, 20e6, 40e6, 55e6, 65e6, 72e6, 78e6, 85e6],
  aggressive: [0.5e6, 5e6, 20e6, 55e6, 110e6, 170e6, 220e6, 260e6, 290e6, 320e6],
};

/* ---------- the model ---------- */

export function project(params, { gmv, price }) {
  const rows = [];
  let circulating = FLOAT_TGE;
  let emitted = 0;
  let burned = 0;

  for (let y = 0; y < 10; y++) {
    const gmvUsd = gmv[y];
    const feeUsd = (gmvUsd * params.feeBps) / BPS;
    const feeOMC = feeUsd / price;

    const burnWanted = (feeOMC * params.burnShareBps) / BPS;
    const burn = Math.min(burnWanted, circulating); // cannot burn what is not there
    const capped = burnWanted > burn;

    const stakerOMC = (feeOMC * params.stakerShareBps) / BPS;
    const treasuryOMC = (feeOMC * params.treasuryShareBps) / BPS;

    const ceiling = params.scheduleOMC[y];
    const k = params.revenueGateK ? params.revenueGateK[y] : null;
    const gate = k === null ? Infinity : k * feeOMC;
    const emission = Math.min(ceiling, gate);

    const net = emission - burn;
    const start = circulating;
    circulating = Math.max(0, circulating + net);
    emitted += emission;
    burned += burn;

    rows.push({
      year: y + 1,
      gmvUsd,
      feeUsd,
      feeOMC,
      burn,
      burnWanted,
      capped,
      stakerOMC,
      treasuryOMC,
      ceiling,
      gate: Number.isFinite(gate) ? gate : null,
      emission,
      boundBy: gate < ceiling ? "gate" : "ceiling",
      net,
      start,
      end: circulating,
      inflationPct: start > 0 ? (net / start) * 100 : 0,
      sinkToSource: emission > 0 ? burn / emission : Infinity,
    });
  }

  return {
    rows,
    emitted,
    burned,
    unemitted: params.scheduleOMC.reduce((a, b) => a + b, 0) - emitted,
    circulatingEnd: circulating,
    thresholds: thresholds(params, price),
  };
}

/**
 * Two numbers investors actually ask for, per year.
 *
 *   gateBindsBelowGmv — under this GMV the gate is the constraint, so emission
 *     tracks usage; above it the ceiling takes over.
 *   netZeroGmv — GMV at which burn equals the ceiling. Above it the token is
 *     deflationary outright.
 */
export function thresholds(params, price) {
  const feeRate = params.feeBps / BPS;
  const burnRate = (feeRate * params.burnShareBps) / BPS; // of GMV, in OMC/price
  return params.scheduleOMC.map((ceiling, y) => {
    const k = params.revenueGateK ? params.revenueGateK[y] : null;
    return {
      year: y + 1,
      ceiling,
      k,
      gateBindsBelowGmv: k === null ? null : (ceiling * price) / (k * feeRate),
      netZeroGmv: (ceiling * price) / burnRate,
    };
  });
}

/**
 * Sink/source in the gate regime does not depend on GMV or on price:
 *   burn = burnShare × fee,  emission = k × fee  →  ratio = burnShare / k.
 * This is the one number that is true at any scale, which is why it leads.
 */
export function gateRegimeRatio(params, year) {
  const k = params.revenueGateK ? params.revenueGateK[year - 1] : null;
  if (k === null) return null;
  return params.burnShareBps / BPS / k;
}

/* ---------- reporting ---------- */

const fmtUsd = (n) =>
  n >= 1e6
    ? "$" + (n / 1e6).toFixed(2) + "M"
    : n >= 1e3
      ? "$" + Math.round(n / 1e3) + "k"
      : "$" + Math.round(n);
const fmtOMC = (n) => (Number.isFinite(n) ? (n / 1e6).toFixed(2) + "M" : "—");
const pct = (n) => (n * 100).toFixed(0) + "%";

function table(res) {
  const head =
    "| Yr | GMV | Fee (OMC) | Burn | Emission | Bound by | Net | Circulating | Inflation | Burn÷Emit |\n" +
    "|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|";
  const body = res.rows
    .map(
      (r) =>
        `| ${r.year} | ${fmtUsd(r.gmvUsd)} | ${fmtOMC(r.feeOMC)} | ${fmtOMC(r.burn)}${r.capped ? "†" : ""} | ` +
        `${fmtOMC(r.emission)} | ${r.boundBy} | ${fmtOMC(r.net)} | ${fmtOMC(r.end)} | ` +
        `${r.inflationPct.toFixed(1)}% | ${pct(r.sinkToSource)} |`
    )
    .join("\n");
  return head + "\n" + body;
}

function summary(res) {
  const last = res.rows[res.rows.length - 1];
  return {
    emitted: res.emitted,
    burned: res.burned,
    unemitted: res.unemitted,
    sinkSource: res.burned / res.emitted,
    year1Inflation: res.rows[0].inflationPct,
    year5SinkSource: res.rows[4].sinkToSource,
    year10SinkSource: last.sinkToSource,
    netZeroYear1: res.thresholds[0].netZeroGmv,
    netZeroYear5: res.thresholds[4].netZeroGmv,
    gateYear1: res.thresholds[0].gateBindsBelowGmv,
    firstNonPositive: res.rows.find((r) => r.net <= 0)?.year ?? null,
  };
}

const args = process.argv.slice(2);
const getArg = (n, d) => {
  const i = args.indexOf("--" + n);
  return i >= 0 ? args[i + 1] : d;
};
const price = Number(getArg("price", 0.02));
const only = getArg("scenario", null);
const asJson = args.includes("--json");
const breakeven = args.includes("--breakeven");

if (asJson) {
  const out = { price, designs: {} };
  for (const d of [CURRENT, PROPOSED]) {
    out.designs[d.name] = {};
    for (const [name, gmv] of Object.entries(SCENARIOS)) {
      if (only && only !== name) continue;
      out.designs[d.name][name] = project(d, { gmv, price });
    }
  }
  console.log(JSON.stringify(out, null, 2));
} else if (breakeven) {
  const prices = [0.01, 0.02, 0.05, 0.1];
  console.log("# GMV required for net-zero supply, by reference price\n");
  console.log("Below these GMV figures the year is inflationary; above them the burn exceeds the ceiling.\n");
  for (const d of [CURRENT, PROPOSED]) {
    console.log("## " + d.label + "\n");
    console.log("| Yr | Emission ceiling | " + prices.map((p) => "$" + p).join(" | ") + " |");
    console.log("|---:|---:|" + prices.map(() => "---:").join("|") + "|");
    for (let y = 0; y < 10; y++) {
      const cells = prices.map((p) => fmtUsd(thresholds(d, p)[y].netZeroGmv));
      console.log(`| ${y + 1} | ${fmtOMC(d.scheduleOMC[y])} | ${cells.join(" | ")} |`);
    }
    console.log("");
  }
} else {
  console.log("# OMC supply model\n");
  console.log(
    "Reference price: $" + price + " / OMC · burn held constant in OMC terms, so high-GMV rows overstate deflation († = clamped)\n"
  );
  for (const d of [CURRENT, PROPOSED]) {
    console.log("## " + d.label + "\n");
    console.log(
      "Fee " + d.feeBps / 100 + "% → burn " + (d.feeBps * d.burnShareBps) / 1e6 +
        "% of GMV · stakers " + (d.feeBps * d.stakerShareBps) / 1e6 + "% · treasury " +
        (d.feeBps * d.treasuryShareBps) / 1e6 + "%"
    );
    const ratios = [1, 2, 3, 4, 5, 6, 7, 8]
      .map((y) => {
        const r = gateRegimeRatio(d, y);
        return r === null ? null : `y${y} ` + pct(r);
      })
      .filter(Boolean);
    if (ratios.length) {
      console.log("Burn ÷ emission in the gate regime (independent of GMV and price): " + ratios.join(" · "));
    }
    console.log("");
    for (const [name, gmv] of Object.entries(SCENARIOS)) {
      if (only && only !== name) continue;
      const res = project(d, { gmv, price });
      const s = summary(res);
      console.log("### " + name + "\n");
      console.log(table(res));
      console.log("");
      console.log(
        "10y: emitted **" + fmtOMC(s.emitted) + "**, burned **" + fmtOMC(s.burned) +
          "**, never minted **" + fmtOMC(s.unemitted) + "**, sink/source **" + s.sinkSource.toFixed(2) + "**"
      );
      console.log(
        "Year-1 inflation **" + s.year1Inflation.toFixed(1) + "%** · year-5 burn÷emit **" +
          pct(s.year5SinkSource) + "** · first year burn ≥ emission: **" + (s.firstNonPositive ?? "—") + "**"
      );
      console.log(
        "Net-zero GMV: year 1 **" + fmtUsd(s.netZeroYear1) + "**, year 5 **" + fmtUsd(s.netZeroYear5) +
          "**" + (s.gateYear1 === null ? " · no revenue gate" : " · gate binds below " + fmtUsd(s.gateYear1)) + "\n"
      );
    }
  }
}
