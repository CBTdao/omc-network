#!/usr/bin/env node
/**
 * Airdrop claim economics — what a 0.01 BNB charge actually costs a claimant.
 *
 *   node models/claim.mjs                       # all three modes, reference prices
 *   node models/claim.mjs --bnb 742 --json
 *   node models/claim.mjs --mode fee
 *   node models/claim.mjs --sybil               # cost of a sybil farm, by size
 *
 * Why this file exists
 * --------------------
 * "Charge 0.01 BNB per claim" is a one-line rule with a non-obvious price tag.
 * At a BNB reference of $742 that is $7.42 per wallet, against a maximum
 * airdrop of 200 OMC. The rule therefore sets a floor under the token price
 * whether or not anybody intended to: below it, claiming is a loss and a
 * rational holder does not claim.
 *
 * Three ways to place that cost, all implemented here so the choice is a
 * parameter and not a rewrite:
 *
 *   gas-only           the claimant pays BNB Chain gas and nothing else.
 *   refundable-deposit the claimant escrows 0.01 BNB at claim, refundable in
 *                      full after a lock period. Same up-front cost to a sybil,
 *                      but it is not revenue and not a sale.
 *   fee                0.01 BNB is transferred to the treasury and kept.
 *
 * The model deliberately does not forecast a claim rate. It reports the price
 * at which claiming turns negative, which is the only claim-rate input that is
 * derived rather than assumed.
 */

const BPS = 10_000;

/* Per-entry payload is 20 OMC (contracts/params.json airdrop.perEntry). */
export const OMC_PER_ENTRY = 20;

/* A BSC claim transaction — Merkle proof + transfer — costs roughly this much
   in gas. The figure is an order-of-magnitude estimate, not a quote: it moves
   with calldata size and with BSC's gas price. It is included because a mode
   that ignores gas is not a mode a user can compare. */
export const GAS_PER_CLAIM_BNB = 0.0004;

export const MODES = {
  "gas-only": {
    name: "gas-only",
    label: "Gas only — no protocol charge",
    gasBnb: GAS_PER_CLAIM_BNB,
    feeBnb: 0,
    depositBnb: 0,
    refundBps: 0,
    refundAfterDays: 0,
  },
  "refundable-deposit": {
    name: "refundable-deposit",
    label: "Refundable 0.01 BNB deposit — escrowed, returned after 30 days",
    gasBnb: GAS_PER_CLAIM_BNB,
    feeBnb: 0,
    depositBnb: 0.01,
    refundBps: 10_000,
    refundAfterDays: 30,
  },
  fee: {
    name: "fee",
    label: "0.01 BNB fee — transferred to the treasury, not returned",
    gasBnb: GAS_PER_CLAIM_BNB,
    feeBnb: 0.01,
    depositBnb: 0,
    refundBps: 0,
    refundAfterDays: 0,
  },
};

/**
 * Settle one wallet's claim.
 *
 * `protocolRevenueUsd` counts only what the protocol keeps. An escrowed
 * deposit is a liability, not revenue, until it is forfeited — which is why
 * the deposit mode reports the same revenue as gas-only however large the
 * deposit is.
 */
export function settle(mode, { entries, omcPriceUsd, bnbUsd }) {
  const omc = entries * OMC_PER_ENTRY;
  const grossUsd = omc * omcPriceUsd;

  const gasUsd = mode.gasBnb * bnbUsd;
  const feeUsd = mode.feeBnb * bnbUsd;
  const depositUsd = mode.depositBnb * bnbUsd;
  const refundUsd = (depositUsd * mode.refundBps) / BPS;
  const forfeitedUsd = depositUsd - refundUsd;

  /* What leaves the wallet on claim day. For the deposit mode this is the
     number a sybil farm has to fund per wallet, which is the whole point. */
  const outlayUsd = gasUsd + feeUsd + depositUsd;

  /* Net value once the escrow is returned (the normal path). */
  const netAfterRefundUsd = grossUsd - (gasUsd + feeUsd + forfeitedUsd);

  /* Net value if the deposit is never returned (the punitive path). */
  const netIfForfeitedUsd = grossUsd - outlayUsd;

  /* Permanently captured: fee plus any forfeited deposit. Gas is burned by the
     chain, not collected by the protocol, so it is excluded here and reported
     separately as a cost. */
  const protocolRevenueUsd = feeUsd + forfeitedUsd;

  const breakevenPriceUsd =
    omc > 0 ? (gasUsd + feeUsd + forfeitedUsd) / omc : Number.POSITIVE_INFINITY;

  /* Share of the airdrop's dollar value that never reaches the claimant. */
  const totalCostPct = grossUsd > 0 ? (gasUsd + feeUsd + forfeitedUsd) / grossUsd : Infinity;
  const protocolTakePct = grossUsd > 0 ? protocolRevenueUsd / grossUsd : Infinity;

  return {
    mode: mode.name,
    entries,
    omc,
    grossUsd,
    gasUsd,
    feeUsd,
    depositUsd,
    refundUsd,
    forfeitedUsd,
    outlayUsd,
    netAfterRefundUsd,
    netIfForfeitedUsd,
    protocolRevenueUsd,
    breakevenPriceUsd,
    totalCostPct,
    protocolTakePct,
  };
}

/* ---------- reporting ---------- */

const usd = (n) =>
  !Number.isFinite(n)
    ? "—"
    : (n < 0 ? "-$" : "$") +
      (Math.abs(n) >= 1000 ? Math.round(Math.abs(n) / 100) / 10 + "k" : Math.abs(n).toFixed(2));
const pct = (n) => (!Number.isFinite(n) ? "—" : (n * 100).toFixed(0) + "%");

const REFERENCE_PRICES = [0.02, 0.05, 0.075, 0.1, 0.2];

function netTable(bnbUsd, mode) {
  const lines = [];
  for (const entries of [5, 10]) {
    const amount = entries * OMC_PER_ENTRY;
    lines.push(`**${entries} entries = ${amount} OMC** — net value once the escrow is returned\n`);
    lines.push("| Mode | " + REFERENCE_PRICES.map((p) => "$" + p).join(" | ") + " |");
    lines.push("|---|" + REFERENCE_PRICES.map(() => "---:").join("|") + "|");
    const cells = REFERENCE_PRICES.map((p) =>
      usd(settle(mode, { entries, omcPriceUsd: p, bnbUsd }).netAfterRefundUsd)
    );
    lines.push(`| ${mode.name} | ${cells.join(" | ")} |`);
    lines.push("");
  }
  return lines.join("\n");
}

function costTable(bnbUsd, mode) {
  const a = settle(mode, { entries: 5, omcPriceUsd: 0.1, bnbUsd });
  const b = settle(mode, { entries: 10, omcPriceUsd: 0.1, bnbUsd });
  return [
    "| Breakeven OMC price (100 OMC) | Breakeven (200 OMC) | Cost as % of value @ $0.10 | Protocol revenue per claim @ $0.10 |",
    "|---:|---:|---:|---:|",
    `| $${a.breakevenPriceUsd.toFixed(4)} | $${b.breakevenPriceUsd.toFixed(4)} | ` +
      `${pct(a.totalCostPct)} | ${usd(a.protocolRevenueUsd)} |`,
  ].join("\n");
}

function sybilTable(bnbUsd) {
  const lines = [
    "| Wallets | Fee mode — cash burned | Deposit mode — cash burned | Deposit mode — escrow locked |",
    "|---:|---:|---:|---:|",
  ];
  const f = settle(MODES.fee, { entries: 5, omcPriceUsd: 0.1, bnbUsd });
  const d = settle(MODES["refundable-deposit"], { entries: 5, omcPriceUsd: 0.1, bnbUsd });
  for (const n of [1_000, 10_000, 100_000]) {
    lines.push(
      `| ${n.toLocaleString("en-US")} | ${usd(n * (f.gasUsd + f.feeUsd))} | ` +
        `${usd(n * (d.gasUsd + d.feeUsd))} | ${usd(n * d.depositUsd)} locked ${MODES["refundable-deposit"].refundAfterDays} days |`
    );
  }
  return lines.join("\n");
}

/* ---------- CLI ---------- */

const args = process.argv.slice(2);
const getArg = (n, d) => {
  const i = args.indexOf("--" + n);
  return i >= 0 ? args[i + 1] : d;
};
const bnbUsd = Number(getArg("bnb", 742)); // BNB reference, 2026-10-27
const asJson = args.includes("--json");
const sybil = args.includes("--sybil");
const only = getArg("mode", null);

if (asJson) {
  const out = { bnbUsd, modes: {} };
  for (const [name, mode] of Object.entries(MODES)) {
    if (only && only !== name) continue;
    out.modes[name] = {
      entries: [5, 10].map((entries) =>
        Object.fromEntries(
          REFERENCE_PRICES.map((p) => [String(p), settle(mode, { entries, omcPriceUsd: p, bnbUsd })])
        )
      ),
    };
  }
  console.log(JSON.stringify(out, null, 2));
} else if (sybil) {
  console.log("# Cost of a sybil farm\n");
  console.log(`BNB reference: $${bnbUsd} · 5 entries (100 OMC) per wallet\n`);
  console.log(sybilTable(bnbUsd) + "\n");
  console.log(
    "The fee mode is the only one where a sybil farm is a revenue event for the\n" +
      "protocol, which is also the reason it cannot be described as an airdrop.\n"
  );
} else {
  console.log("# Airdrop claim economics\n");
  console.log(
    `BNB reference: $${bnbUsd} · 20 OMC per entry · gas ${GAS_PER_CLAIM_BNB} BNB per claim\n`
  );
  for (const mode of Object.values(MODES)) {
    if (only && only !== mode.name) continue;
    console.log("## " + mode.label + "\n");
    console.log(
      ["gas " + usd(mode.gasBnb * bnbUsd), "fee " + usd(mode.feeBnb * bnbUsd), "deposit " + usd(mode.depositBnb * bnbUsd)]
        .join(" · ") + (mode.refundAfterDays ? ` · refunded after ${mode.refundAfterDays} days` : "")
    );
    console.log("");
    console.log(costTable(bnbUsd, mode) + "\n");
    console.log(netTable(bnbUsd, mode) + "\n");
  }
  console.log("## Reading the table\n");
  console.log(
    "A negative cell is not a rounding error: it is the price at which a rational\n" +
      "holder declines the airdrop. That is the whole risk of a fixed per-claim charge —\n" +
      "it converts an unbounded giveaway into a call option struck at a price nobody\n" +
      "has to agree with.\n"
  );
  console.log("Run `node models/claim.mjs --sybil` for the farm cost side.\n");
}
