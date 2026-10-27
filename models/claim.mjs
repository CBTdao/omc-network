#!/usr/bin/env node
/**
 * Airdrop claim economics — a 0.01 BNB claim fee that the treasury keeps.
 *
 *   node models/claim.mjs                    # shipped design: fee, ratio, revenue, sybil
 *   node models/claim.mjs --all              # fee / deposit / gas-only side by side
 *   node models/claim.mjs --revenue          # what the fee raises, and what it funds
 *   node models/claim.mjs --sybil            # cost of a farm, and where it turns profitable
 *   node models/claim.mjs --bnb 900 --price 0.05 --json
 *
 * Why this file exists
 * --------------------
 * The claim fee is the only part of the model that touches a user's wallet before
 * they own a single token, so the arithmetic has to be right the first time. Two
 * questions decide whether 0.01 BNB works:
 *
 *   1. Is the fee small relative to what the claimant receives? A fee is a strike
 *      price on the airdrop: below `fee / allocation` the rational move is not to
 *      claim, and the campaign distributes nothing. That is a *ratio* problem, not
 *      a fee problem — the same 0.01 BNB is 148% of a 100 OMC claim at a $0.05
 *      listing and 74% of a 200 OMC claim. The ratio is set by `perEntry`.
 *   2. Does the fee stop a sybil farm, or tax it? A non-refundable fee is a toll:
 *      above `fee / maxAllocation` per token, farming pays for itself and the farm
 *      pays the toll. That is acceptable — the toll is revenue — but it has to be
 *      stated, not discovered later.
 *
 * The fee and `perEntry` therefore only make sense as a pair. The shipped pair is
 * 0.01 BNB against 40 OMC per entry: 200 OMC for a base claim, 400 OMC at the cap.
 */

const BPS = 10_000;

/* Per-entry payload, OMC. Mirrors contracts/params.json airdrop.perEntry. */
export const OMC_PER_ENTRY = 40;

/* Entries a wallet can register without referrals, and the referral ceiling.
   Mirrors airdrop.baseEntries / airdrop.referralEntries. */
export const BASE_ENTRIES = 5;
export const REFERRAL_ENTRIES = 5;

/* A BSC claim transaction — Merkle proof + transfer — costs roughly this much in
   gas. Order-of-magnitude estimate, not a quote: it moves with calldata size and
   with BSC's gas price. Included because a mode that ignores gas is not a mode a
   user can compare. */
export const GAS_PER_CLAIM_BNB = 0.0004;

/* The fee, in BNB, and where it goes. Mirrors airdrop.claimCost. */
export const CLAIM_FEE_BNB = 0.01;
export const TREASURY_SPLIT = { ecosystem: 6_000, team: 4_000 }; // bps of the fee

export const MODES = {
  fee: {
    name: "fee",
    label: "0.01 BNB claim fee — kept by the treasury (shipped)",
    gasBnb: GAS_PER_CLAIM_BNB,
    feeBnb: CLAIM_FEE_BNB,
    depositBnb: 0,
    refundBps: 0,
    refundAfterDays: 0,
  },
  "refundable-deposit": {
    name: "refundable-deposit",
    label: "0.01 BNB deposit — escrowed, returned after 30 days (rejected)",
    gasBnb: GAS_PER_CLAIM_BNB,
    feeBnb: 0,
    depositBnb: CLAIM_FEE_BNB,
    refundBps: 10_000,
    refundAfterDays: 30,
  },
  "gas-only": {
    name: "gas-only",
    label: "Gas only — no protocol charge (rejected)",
    gasBnb: GAS_PER_CLAIM_BNB,
    feeBnb: 0,
    depositBnb: 0,
    refundBps: 0,
    refundAfterDays: 0,
  },
};

/**
 * Settle one wallet's claim.
 *
 * `protocolRevenueUsd` counts only what the protocol keeps. An escrowed deposit
 * is a liability, not revenue, until it is forfeited — which is why the deposit
 * mode reports the same revenue as gas-only however large the deposit is.
 *
 * `breakevenPriceUsd` is the one derived number in the model: the OMC price at
 * which a claimant recovers exactly what the claim costs. It is not a forecast,
 * and it is the reason `perEntry` is 40 rather than 20.
 */
export function settle(mode, { entries, omcPriceUsd, bnbUsd }) {
  const omc = entries * OMC_PER_ENTRY;
  const grossUsd = omc * omcPriceUsd;

  const gasUsd = mode.gasBnb * bnbUsd;
  const feeUsd = mode.feeBnb * bnbUsd;
  const depositUsd = mode.depositBnb * bnbUsd;
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
     chain, not collected by the protocol, so it is excluded here and reported
     separately as a cost. */
  const protocolRevenueUsd = feeUsd + forfeitedUsd;

  const breakevenPriceUsd =
    omc > 0 ? (gasUsd + feeUsd + forfeitedUsd) / omc : Number.POSITIVE_INFINITY;

  /* Share of the airdrop's dollar value that never reaches the claimant. */
  const totalCostPct = grossUsd > 0 ? (gasUsd + feeUsd + forfeitedUsd) / grossUsd : Infinity;

  /* The price at which farming the largest possible allocation stops losing money.
     Above it the fee is a toll rather than a wall — deliberately, because a toll
     on a farm is income. */
  const maxOmc = OMC_PER_ENTRY * (BASE_ENTRIES + REFERRAL_ENTRIES);
  const farmBreakevenPriceUsd = (feeUsd + gasUsd) / maxOmc;

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
    farmBreakevenPriceUsd,
    totalCostPct,
  };
}

/**
 * What the fee raises. Revenue is one fee per *claim transaction*, so a bigger
 * allocation means fewer claims and less revenue: the pool, not demand, is the
 * ceiling. This is the trade-off behind `perEntry` stated as a number.
 */
export function revenue({ claimers, bnbUsd, burnMonthlyUsd = null }) {
  const bnb = claimers * CLAIM_FEE_BNB;
  const usd = bnb * bnbUsd;
  return {
    claimers,
    bnb,
    usd,
    ecosystemUsd: (usd * TREASURY_SPLIT.ecosystem) / BPS,
    teamUsd: (usd * TREASURY_SPLIT.team) / BPS,
    monthsAtBurn: burnMonthlyUsd ? usd / burnMonthlyUsd : null,
  };
}

/** Claim transactions the pool can pay for, at a given per-entry payload. */
export function capacity({ pool = 20_000_000, perEntry = OMC_PER_ENTRY, entriesPerClaim = BASE_ENTRIES }) {
  const slots = Math.floor(pool / perEntry);
  return { slots, entriesPerClaim, claims: Math.floor(slots / entriesPerClaim) };
}

/* ---------- reporting ---------- */

const usd = (n) => {
  if (!Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  const body = a >= 1_000_000 ? (a / 1_000_000).toFixed(2) + "M" : a >= 1000 ? Math.round(a / 100) / 10 + "k" : a.toFixed(2);
  return (n < 0 ? "-$" : "$") + body;
};
const pct = (n) => (!Number.isFinite(n) ? "—" : (n * 100).toFixed(0) + "%");

const REFERENCE_PRICES = [0.01, 0.02, 0.037, 0.05, 0.1, 0.2];

/* Section 1 — does a claim make sense for one person? */
function claimTable(bnbUsd, mode = MODES.fee) {
  const out = [];
  for (const entries of [BASE_ENTRIES, BASE_ENTRIES + REFERRAL_ENTRIES]) {
    const s = settle(mode, { entries, omcPriceUsd: 0.05, bnbUsd });
    out.push(
      `\n**${entries} entries = ${s.omc} OMC** · fee ${usd(s.feeUsd)} + gas ${usd(s.gasUsd)}` +
        ` · breakeven **$${s.breakevenPriceUsd.toFixed(4)}/OMC**\n`
    );
    out.push("| | " + REFERENCE_PRICES.map((p) => "$" + p).join(" | ") + " |");
    out.push("|---|" + REFERENCE_PRICES.map(() => "---:").join("|") + "|");
    out.push("| Gross value | " + REFERENCE_PRICES.map((p) => usd(s.omc * p)).join(" | ") + " |");
    out.push(
      "| Net of fee | " +
        REFERENCE_PRICES.map((p) => {
          const v = settle(mode, { entries, omcPriceUsd: p, bnbUsd }).netAfterRefundUsd;
          return v < 0 ? "**" + usd(v) + "**" : usd(v);
        }).join(" | ") +
        " |"
    );
  }
  return out.join("\n");
}

/* Section 2 — why perEntry is 40: the fee as a share of the claim. */
function ratioTable(bnbUsd) {
  const fee = CLAIM_FEE_BNB * bnbUsd;
  const rows = [
    "| perEntry | Base claim | Pool slots | Fee ÷ claim @ $0.05 | Breakeven, fee only |",
    "|---:|---:|---:|---:|---:|",
  ];
  for (const perEntry of [20, 40, 50, 100]) {
    const omc = perEntry * BASE_ENTRIES;
    const cap = capacity({ perEntry });
    rows.push(
      `| ${perEntry} OMC | ${omc} OMC | ${cap.slots.toLocaleString("en-US")} | ` +
        `${pct(fee / (omc * 0.05))} | $${(fee / omc).toFixed(4)} |`
    );
  }
  return rows.join("\n");
}

/* Section 2b — the one number to watch: the fee IS a distribution price. */
function feeSensitivity(bnbUsd) {
  const cols = [BASE_ENTRIES, BASE_ENTRIES + REFERRAL_ENTRIES];
  const rows = [
    "| Fee | " + cols.map((e) => e * OMC_PER_ENTRY + " OMC claim").join(" | ") + " | Revenue per claim |",
    "|---|" + cols.map(() => "---:").join("|") + "|---:|",
  ];
  for (const feeBnb of [0.0025, 0.005, 0.01, 0.02]) {
    const feeUsd = feeBnb * bnbUsd;
    rows.push(
      `| ${feeBnb} BNB (${usd(feeUsd)}) | ` +
        cols.map((e) => "$" + (feeUsd / (e * OMC_PER_ENTRY)).toFixed(4)).join(" | ") +
        ` | ${usd(feeUsd)} |`
    );
  }
  return rows.join("\n");
}

/* Section 3 — what the fee raises, and how long it lasts. */
function revenueTable(bnbUsd, burns = [8_000, 15_000, 25_000]) {
  const rows = [
    "| Claimants | Fee raised (BNB) | Fee raised (USD) | Ecosystem 60% | Team 40% | " +
      burns.map((b) => "runway @ $" + b / 1000 + "k/mo").join(" | ") + " |",
    "|---:|---:|---:|---:|---:|" + burns.map(() => "---:").join("|") + "|",
  ];
  for (const claimers of [5_000, 10_000, 25_000, 50_000, 100_000]) {
    const r = revenue({ claimers, bnbUsd });
    rows.push(
      `| ${claimers.toLocaleString("en-US")} | ${r.bnb.toLocaleString("en-US")} | ${usd(r.usd)} | ` +
        `${usd(r.ecosystemUsd)} | ${usd(r.teamUsd)} | ` +
        burns.map((b) => (r.usd / b).toFixed(1) + " mo").join(" | ") +
        " |"
    );
  }
  return rows.join("\n");
}

/* Section 4 — the sybil filter, sized in dollars rather than adjectives. */
function sybilTable(bnbUsd) {
  const per = (CLAIM_FEE_BNB + GAS_PER_CLAIM_BNB) * bnbUsd;
  const maxOmc = OMC_PER_ENTRY * (BASE_ENTRIES + REFERRAL_ENTRIES);
  const rows = [
    "| Wallets | Sunk cost per wallet | Total burned | Pool consumed at the cap |",
    "|---:|---:|---:|---:|",
  ];
  for (const n of [1_000, 10_000, 50_000, 100_000]) {
    rows.push(
      `| ${n.toLocaleString("en-US")} | ${usd(per)} | **${usd(n * per)}** | ` +
        `${(((n * maxOmc) / 20_000_000) * 100).toFixed(0)}% |`
    );
  }
  return rows.join("\n");
}

/* ---------- CLI ---------- */

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
const only = getArg("mode", null);
const price = Number(getArg("price", 0.05));

if (asJson) {
  const out = { bnbUsd, perEntry: OMC_PER_ENTRY, claimFeeBnb: CLAIM_FEE_BNB, modes: {} };
  for (const [name, mode] of Object.entries(MODES)) {
    if (only && only !== name) continue;
    out.modes[name] = [BASE_ENTRIES, BASE_ENTRIES + REFERRAL_ENTRIES].map((entries) => ({
      entries,
      omc: entries * OMC_PER_ENTRY,
      ...Object.fromEntries(
        REFERENCE_PRICES.map((p) => [String(p), settle(mode, { entries, omcPriceUsd: p, bnbUsd })])
      ),
    }));
  }
  out.revenue = [5_000, 10_000, 25_000, 50_000, 100_000].map((c) => revenue({ claimers: c, bnbUsd }));
  out.capacity = capacity({});
  console.log(JSON.stringify(out, null, 2));
} else if (rev) {
  console.log("# What a 0.01 BNB claim fee raises\n");
  console.log(`BNB reference: $${bnbUsd} · fee ${CLAIM_FEE_BNB} BNB = ${usd(CLAIM_FEE_BNB * bnbUsd)}\n`);
  console.log(revenueTable(bnbUsd) + "\n");
  const cap = capacity({});
  console.log(
    `The pool is the ceiling, not demand: ${cap.slots.toLocaleString("en-US")} entries ÷ ` +
      `${cap.entriesPerClaim} entries per base claim = ${cap.claims.toLocaleString("en-US")} ` +
      `claim transactions = ${(cap.claims * CLAIM_FEE_BNB).toLocaleString("en-US")} BNB ` +
      `(${usd(cap.claims * CLAIM_FEE_BNB * bnbUsd)}) if every slot is claimed.`
  );
  console.log(
    "That ceiling is what the airdrop itself can fund; everything above it has to come from the"
  );
  console.log("compute margin, which is why the emission is revenue-gated rather than dated.");
} else if (sybil) {
  console.log("# Cost of farming the pool\n");
  console.log(`BNB reference: $${bnbUsd} · ${CLAIM_FEE_BNB} BNB fee · ${OMC_PER_ENTRY} OMC per entry\n`);
  console.log(sybilTable(bnbUsd) + "\n");
  const s = settle(MODES.fee, { entries: BASE_ENTRIES + REFERRAL_ENTRIES, omcPriceUsd: 0.05, bnbUsd });
  console.log(
    `Farming turns profitable above **$${s.farmBreakevenPriceUsd.toFixed(4)}/OMC** — the fee spread over\n` +
      `${s.omc} OMC, the largest allocation one wallet can hold. Below that price every farm wallet\n` +
      "loses money and the fee is a wall; above it the fee is a toll, and a toll is revenue. Neither\n" +
      "outcome drains the pool for free, which is the property that matters."
  );
} else {
  console.log("# Airdrop claim economics\n");
  console.log(
    `BNB reference: $${bnbUsd} · ${OMC_PER_ENTRY} OMC per entry · ` +
      `base claim ${OMC_PER_ENTRY * BASE_ENTRIES} OMC · cap ${OMC_PER_ENTRY * (BASE_ENTRIES + REFERRAL_ENTRIES)} OMC\n`
  );

  if (all) {
    for (const mode of Object.values(MODES)) {
      console.log("## " + mode.label + "\n");
      console.log(
        ["gas " + usd(mode.gasBnb * bnbUsd), "fee " + usd(mode.feeBnb * bnbUsd), "deposit " + usd(mode.depositBnb * bnbUsd)]
          .join(" · ") + (mode.refundAfterDays ? ` · returned after ${mode.refundAfterDays} days` : "") + "\n"
      );
      console.log(claimTable(bnbUsd, mode) + "\n");
    }
  } else {
    const s = settle(MODES.fee, { entries: BASE_ENTRIES, omcPriceUsd: price, bnbUsd });
    console.log("## 0.01 BNB claim fee, kept by the treasury\n");
    console.log(
      `At an OMC price of $${price}: ${s.omc} OMC worth ${usd(s.grossUsd)}, cost ` +
        `${usd(s.feeUsd + s.gasUsd)}, net ${usd(s.netAfterRefundUsd)} ` +
        `(${pct((s.feeUsd + s.gasUsd) / s.grossUsd)} of value).\n`
    );
    console.log(claimTable(bnbUsd) + "\n");
  }

  console.log("## Why 40 OMC per entry\n");
  console.log(ratioTable(bnbUsd) + "\n");
  console.log(
    "The fee is fixed by the treasury, so the only lever on the ratio is the allocation. At 20 OMC\n" +
      "per entry a base claim of 100 OMC is worth $5.00 at a $0.05 listing, the fee takes 148% of it,\n" +
      "nobody claims, and the pool stays full. At 40 OMC the same claim breaks even at $0.037 and the\n" +
      "fee is a distribution price rather than a tax.\n"
  );
  console.log("## The fee is a distribution price\n");
  console.log(feeSensitivity(bnbUsd) + "\n");
  console.log(
    "Read this before launch. 0.01 BNB against a 400 OMC allocation says the token is worth $0.019;\n" +
      "against a 200 OMC base claim it says $0.039. If OMC lists below the base-claim figure, most\n" +
      "wallets decline and the pool only moves to the ones who maxed out their referrals. The fee is\n" +
      "a parameter (contracts/params.json airdrop.claimCost.feeBnb), and this table is the argument for\n" +
      "changing it — 0.005 BNB halves the distribution price and halves the revenue with it.\n"
  );
  console.log("## What it raises\n");
  console.log(revenueTable(bnbUsd) + "\n");
  console.log("## The sybil question\n");
  console.log(sybilTable(bnbUsd) + "\n");
  const farm = settle(MODES.fee, { entries: BASE_ENTRIES + REFERRAL_ENTRIES, omcPriceUsd: 0.05, bnbUsd });
  console.log(
    `Farming turns profitable above **$${farm.farmBreakevenPriceUsd.toFixed(4)}/OMC**. The fee is not a wall and\n` +
      "pretending otherwise would be the mistake: it is a toll. A 100,000-wallet farm pays\n" +
      `**${usd(100_000 * (CLAIM_FEE_BNB + GAS_PER_CLAIM_BNB) * bnbUsd)}** before it holds a single token, and that money is\n` +
      "gone. That is the difference between this and a deposit."
  );
}
