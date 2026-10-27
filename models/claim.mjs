#!/usr/bin/env node
/**
 * Airdrop claim economics — 0.01 BNB per entry, kept by the treasury.
 *
 *   node models/claim.mjs                    # wallet cost, revenue, sybil cost
 *   node models/claim.mjs --revenue           # what the fee raises, and what it funds
 *   node models/claim.mjs --sybil             # cost of a farm, per entry
 *   node models/claim.mjs --price             # the same fee against several listing prices
 *   node models/claim.mjs --all               # fee / deposit / gas-only side by side
 *   node models/claim.mjs --bnb 900 --json
 *
 * What the fee is, and what it is not
 * -----------------------------------
 * It is a flat entrance charge of 0.01 BNB **per entry**, paid once, kept by the
 * treasury, never indexed to the token price. It is not a percentage of the airdrop,
 * not a discount, and not a promise about what OMC will be worth. An earlier draft
 * treated it as a purchase price and sized the allocation so the fee stayed under
 * half of the claim's dollar value; that made the campaign depend on a listing price
 * nobody can know. The shipped design does not: 1,000,000 slots of 20 OMC, 0.01 BNB
 * each, first come first served.
 *
 * Two consequences worth stating rather than discovering later:
 *
 *   1. Because the charge is per entry, cost is linear in entries and a wallet with
 *      all ten pays 0.1 BNB. Gas is per transaction and does not scale, so the fee
 *      dominates it by two orders of magnitude and is the actual filter.
 *   2. The pool is the ceiling on revenue: 1,000,000 entries × 0.01 BNB = 10,000 BNB
 *      however popular the campaign becomes. That is the whole airdrop as a funding
 *      source, and it is why compute margin — not the campaign — has to fund the
 *      company after launch.
 */

const BPS = 10_000;

/* Per-entry payload, OMC. Mirrors contracts/params.json airdrop.perEntry. */
export const OMC_PER_ENTRY = 20;

/* Entries a wallet can register without referrals, and the referral ceiling.
   Mirrors airdrop.baseEntries / airdrop.referralEntries. */
export const BASE_ENTRIES = 5;
export const REFERRAL_ENTRIES = 5;

/* Slots in the pool: 20,000,000 ÷ 20. Mirrors airdrop.poolSlots. */
export const POOL_SLOTS = 1_000_000;

/* A BSC claim transaction — Merkle proof + transfer — costs roughly this much in
   gas, once per claim however many entries it covers. Order-of-magnitude estimate,
   not a quote: it moves with calldata size and with BSC's gas price. */
export const GAS_PER_CLAIM_BNB = 0.0004;

/* The fee, in BNB, per entry, and where it goes. Mirrors airdrop.claimCost. */
export const CLAIM_FEE_BNB = 0.01;
export const TREASURY_SPLIT = { ecosystem: 6_000, team: 4_000 }; // bps of the fee

export const MODES = {
  fee: {
    name: "fee",
    label: "0.01 BNB per entry — kept by the treasury (shipped)",
    gasBnb: GAS_PER_CLAIM_BNB,
    feeBnbPerEntry: CLAIM_FEE_BNB,
    depositBnbPerEntry: 0,
    refundBps: 0,
    refundAfterDays: 0,
  },
  "refundable-deposit": {
    name: "refundable-deposit",
    label: "0.01 BNB per entry escrowed, returned after 30 days (rejected)",
    gasBnb: GAS_PER_CLAIM_BNB,
    feeBnbPerEntry: 0,
    depositBnbPerEntry: CLAIM_FEE_BNB,
    refundBps: 10_000,
    refundAfterDays: 30,
  },
  "gas-only": {
    name: "gas-only",
    label: "Gas only — no protocol charge (rejected)",
    gasBnb: GAS_PER_CLAIM_BNB,
    feeBnbPerEntry: 0,
    depositBnbPerEntry: 0,
    refundBps: 0,
    refundAfterDays: 0,
  },
};

/**
 * Settle one wallet's claim.
 *
 * Gas is constant per claim; the fee multiplies by entries. `protocolRevenueUsd`
 * counts only what the protocol keeps, so an escrowed deposit is a liability until
 * forfeited — which is why the deposit mode reports zero revenue however large the
 * deposit is.
 *
 * `breakevenPriceUsd` is kept because it is a true identity (cost ÷ OMC received),
 * not because the design targets it. No number in `contracts/params.json` is chosen
 * to make it small.
 */
export function settle(mode, { entries, omcPriceUsd, bnbUsd }) {
  const omc = entries * OMC_PER_ENTRY;
  const grossUsd = omc * omcPriceUsd;

  const gasUsd = mode.gasBnb * bnbUsd;
  const feeBnb = entries * mode.feeBnbPerEntry;
  const depositBnb = entries * mode.depositBnbPerEntry;
  const feeUsd = feeBnb * bnbUsd;
  const depositUsd = depositBnb * bnbUsd;
  const refundUsd = (depositUsd * mode.refundBps) / BPS;
  const forfeitedUsd = depositUsd - refundUsd;

  /* What leaves the wallet on claim day. For a farm this is the number it has to
     fund per wallet, irreversibly in fee mode. */
  const outlayUsd = gasUsd + feeUsd + depositUsd;

  /* Net value once the escrow is returned (the normal path in deposit mode). */
  const netAfterRefundUsd = grossUsd - (gasUsd + feeUsd + forfeitedUsd);

  /* Net value if the deposit is never returned (the punitive path). */
  const netIfForfeitedUsd = grossUsd - outlayUsd;

  /* Permanently captured: fee plus any forfeited deposit. Gas is burned by the
     chain, not collected by the protocol, so it is excluded here. */
  const protocolRevenueUsd = feeUsd + forfeitedUsd;

  const breakevenPriceUsd =
    omc > 0 ? (gasUsd + feeUsd + forfeitedUsd) / omc : Number.POSITIVE_INFINITY;

  /* Share of the airdrop's dollar value that never reaches the claimant. A
     descriptive number, not a design constraint. */
  const totalCostPct = grossUsd > 0 ? (gasUsd + feeUsd + forfeitedUsd) / grossUsd : Infinity;

  const maxOmc = OMC_PER_ENTRY * (BASE_ENTRIES + REFERRAL_ENTRIES);
  const farmBreakevenPriceUsd = (feeUsd + gasUsd) / maxOmc;

  return {
    mode: mode.name,
    entries,
    omc,
    grossUsd,
    gasUsd,
    feeBnb,
    feeUsd,
    depositBnb,
    depositUsd,
    refundUsd,
    forfeitedUsd,
    outlayUsd,
    netAfterRefundUsd,
    netIfForfeitedUsd,
    protocolRevenueUsd,
    breakevenPriceUsd,
    farmBreakevenPriceUsd,
    totalCostPct,
  };
}

/**
 * What the fee raises. Revenue is per entry, so it is linear in entries claimed and
 * capped by the pool rather than by demand.
 */
export function revenue({ entries, bnbUsd, burnMonthlyUsd = null }) {
  const total = entries * CLAIM_FEE_BNB;
  const dollars = total * bnbUsd;
  return {
    entries,
    wallets: entries / BASE_ENTRIES,
    bnb: total,
    usd: dollars,
    ecosystemUsd: (dollars * TREASURY_SPLIT.ecosystem) / BPS,
    teamUsd: (dollars * TREASURY_SPLIT.team) / BPS,
    monthsAtBurn: burnMonthlyUsd ? dollars / burnMonthlyUsd : null,
  };
}

/** Slots the pool can pay for at a given payload, and the claims that fill it. */
export function capacity({ pool = 20_000_000, perEntry = OMC_PER_ENTRY, entriesPerClaim = BASE_ENTRIES }) {
  const slots = Math.floor(pool / perEntry);
  return { slots, entriesPerClaim, claims: Math.floor(slots / entriesPerClaim) };
}

/* ---------- reporting ---------- */

const usd = (n) => {
  if (!Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  const body =
    a >= 1_000_000 ? (a / 1_000_000).toFixed(2) + "M" : a >= 1000 ? Math.round(a / 100) / 10 + "k" : a.toFixed(2);
  return (n < 0 ? "-$" : "$") + body;
};
const pct = (n) => (!Number.isFinite(n) ? "—" : (n * 100).toFixed(0) + "%");
const bnb = (n) => (Number.isInteger(n) ? n.toLocaleString("en-US") : n.toFixed(4));

/* Section 1 — what a wallet actually pays. */
function walletTable(bnbUsd) {
  const rows = [
    "| Wallet | OMC | Fee (BNB) | Fee (USD) | Gas (USD) | Out of pocket |",
    "|---|---:|---:|---:|---:|---:|",
  ];
  for (const entries of [1, BASE_ENTRIES, BASE_ENTRIES + REFERRAL_ENTRIES]) {
    const s = settle(MODES.fee, { entries, omcPriceUsd: 0.05, bnbUsd });
    const label =
      entries === 1
        ? "1 entry"
        : entries === BASE_ENTRIES
          ? `${entries} entries (base claim)`
          : `${entries} entries (cap)`;
    rows.push(
      `| ${label} | ${s.omc} | ${bnb(s.feeBnb)} | ${usd(s.feeUsd)} | ${usd(s.gasUsd)} | **${usd(s.outlayUsd)}** |`
    );
  }
  rows.push(
    "",
    "The charge is `entries × 0.01 BNB`. It does not move with the OMC price, with the",
    "listing price, or with anything the market decides — `node models/claim.mjs --price`",
    "shows the same charge against six different prices."
  );
  return rows.join("\n");
}

/* Section 2 — the same charge against several listing prices, to show that it is not
   a percentage of anything. */
function priceTable(bnbUsd) {
  const prices = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5];
  const rows = [
    "| OMC price | 100 OMC base claim worth | Fee | Fee as % of the claim | Net cash after claim |",
    "|---:|---:|---:|---:|---:|",
  ];
  for (const p of prices) {
    const s = settle(MODES.fee, { entries: BASE_ENTRIES, omcPriceUsd: p, bnbUsd });
    rows.push(
      `| $${p.toFixed(2)} | ${usd(s.grossUsd)} | ${usd(s.feeUsd)} (fixed) | ${pct(s.totalCostPct)} | ` +
        `${s.netAfterRefundUsd < 0 ? "**" : ""}${usd(s.netAfterRefundUsd)}${s.netAfterRefundUsd < 0 ? "**" : ""} |`
    );
  }
  rows.push(
    "",
    "The fee column never changes. The percentage does, because the denominator does —",
    "which is exactly why the parameter is not set from that percentage."
  );
  return rows.join("\n");
}

/* Section 3 — what the fee raises, and how long it lasts. */
function revenueTable(bnbUsd, burns = [8_000, 15_000, 25_000]) {
  const rows = [
    "| Entries claimed | Wallets (5 each) | Fee raised (BNB) | Fee raised (USD) | Ecosystem 60% | Team 40% | " +
      burns.map((b) => "runway @ $" + b / 1000 + "k/mo").join(" | ") +
      " |",
    "|---:|---:|---:|---:|---:|---:|" + burns.map(() => "---:").join("|") + "|",
  ];
  for (const entries of [50_000, 100_000, 250_000, 500_000, POOL_SLOTS]) {
    const r = revenue({ entries, bnbUsd });
    rows.push(
      `| ${entries.toLocaleString("en-US")} | ${Math.round(r.wallets).toLocaleString("en-US")} | ` +
        `${r.bnb.toLocaleString("en-US")} | ${usd(r.usd)} | ${usd(r.ecosystemUsd)} | ${usd(r.teamUsd)} | ` +
        burns.map((b) => (r.usd / b).toFixed(1) + " mo").join(" | ") +
        " |"
    );
  }
  const cap = capacity({});
  const ceiling = revenue({ entries: cap.slots, bnbUsd });
  rows.push(
    "",
    `The last row is the ceiling, not a forecast: ${cap.slots.toLocaleString("en-US")} slots × 0.01 BNB = ` +
      `${ceiling.bnb.toLocaleString("en-US")} BNB (${usd(ceiling.usd)}) if every slot is claimed. ` +
      `Nothing the campaign does can raise more, and the airdrop alone cannot fund a company.`
  );
  return rows.join("\n");
}

/* Section 4 — the sybil filter, sized in dollars rather than adjectives. */
function sybilTable(bnbUsd) {
  const perBase = settle(MODES.fee, { entries: BASE_ENTRIES, omcPriceUsd: 0.05, bnbUsd });
  const perCap = settle(MODES.fee, { entries: BASE_ENTRIES + REFERRAL_ENTRIES, omcPriceUsd: 0.05, bnbUsd });
  const maxOmc = OMC_PER_ENTRY * (BASE_ENTRIES + REFERRAL_ENTRIES);
  const rows = [
    "| Wallets | 5 entries each: cost / wallet | Total spent | 10 entries each: total spent | Pool consumed (at the cap) |",
    "|---:|---:|---:|---:|---:|",
  ];
  for (const n of [1_000, 10_000, 50_000, 100_000]) {
    rows.push(
      `| ${n.toLocaleString("en-US")} | ${usd(perBase.outlayUsd)} | **${usd(n * perBase.outlayUsd)}** | ` +
        `${usd(n * perCap.outlayUsd)} | ${(((n * maxOmc) / 20_000_000) * 100).toFixed(0)}% |`
    );
  }
  rows.push(
    "",
    "Every dollar here is spent, not escrowed: the only thing a farm holds after paying is",
    "a token position, and its entry cost is its budget ceiling. The pool caps it too —",
    "1,000,000 entries, 10,000 BNB, whatever the farm plans."
  );
  return rows.join("\n");
}

function modeTable(bnbUsd) {
  const rows = [
    "| Mode | 5 entries: out of pocket | 10 entries: out of pocket | Protocol revenue (5 / 10) | Recoverable |",
    "|---|---:|---:|---:|---|",
  ];
  for (const mode of Object.values(MODES)) {
    const a = settle(mode, { entries: BASE_ENTRIES, omcPriceUsd: 0.05, bnbUsd });
    const b = settle(mode, { entries: BASE_ENTRIES + REFERRAL_ENTRIES, omcPriceUsd: 0.05, bnbUsd });
    rows.push(
      `| ${mode.name} | ${usd(a.outlayUsd)} | ${usd(b.outlayUsd)} | ` +
        `${usd(a.protocolRevenueUsd)} / ${usd(b.protocolRevenueUsd)} | ${usd(a.refundUsd)} |`
    );
  }
  return rows.join("\n");
}

/* ---------- CLI ---------- */

function main() {
  const args = process.argv.slice(2);
  const getArg = (n, d) => {
    const i = args.indexOf("--" + n);
    return i >= 0 ? args[i + 1] : d;
  };
  const bnbUsd = Number(getArg("bnb", 742)); // BNB reference, 2026-10-27
  const asJson = args.includes("--json");
  const all = args.includes("--all");
  const rev = args.includes("--revenue");
  const sybil = args.includes("--sybil");
  const showPrice = args.includes("--price");
  const only = getArg("mode", null);

  if (asJson) {
    const out = {
      bnbUsd,
      perEntry: OMC_PER_ENTRY,
      poolSlots: POOL_SLOTS,
      claimFeeBnbPerEntry: CLAIM_FEE_BNB,
      modes: {},
    };
    for (const [name, mode] of Object.entries(MODES)) {
      if (only && only !== name) continue;
      out.modes[name] = [BASE_ENTRIES, BASE_ENTRIES + REFERRAL_ENTRIES].map((entries) =>
        settle(mode, { entries, omcPriceUsd: 0.05, bnbUsd })
      );
    }
    out.revenue = [100_000, 500_000, POOL_SLOTS].map((entries) => revenue({ entries, bnbUsd }));
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  if (all) {
    console.log(modeTable(bnbUsd));
    return;
  }

  if (rev) {
    console.log(revenueTable(bnbUsd));
    return;
  }

  if (sybil) {
    console.log(sybilTable(bnbUsd));
    return;
  }

  if (showPrice) {
    console.log(priceTable(bnbUsd));
    return;
  }

  console.log(`## Airdrop claim — 0.01 BNB per entry, ${POOL_SLOTS.toLocaleString("en-US")} slots\n`);
  console.log(walletTable(bnbUsd));
  console.log("\n## What it raises\n");
  console.log(revenueTable(bnbUsd));
  console.log("\n## What it costs a farm\n");
  console.log(sybilTable(bnbUsd));
}

import { pathToFileURL } from "node:url";

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main();
