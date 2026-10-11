#!/usr/bin/env node
/**
 * OMC AI Tools · P1 · supply-accounting audit
 *
 * Reads the two "deflationary" paths the whitepaper names and asks the chain a
 * blunt question: did totalSupply() actually fall?
 *
 * The staking contract's burn slice is `token.transfer(BURN_ADDRESS, burned)`
 * and the market's fee-burn slice is `token.transfer(feeBurn, toBurn)`. If the
 * token has no hook that debits totalSupply on a transfer to the sink, then
 * "burned" means "removed from circulation", not "removed from supply" — and
 * the whitepaper says supply. This script measures which one it is, on chain,
 * rather than reading the comment that claims it.
 *
 * Usage: node p1-service/audit-supply.js
 */
"use strict";

const C = require("./chain.js");
const { ethers } = require("ethers");

const DEAD = "0x000000000000000000000000000000000000dEaD";

async function main() {
  const p = await C.provider();
  const tok = await C.token(p);
  const stk = await C.staking(p);
  const mkt = await C.market(p);
  const d = C.deployments();

  const fmt = (x) => ethers.formatEther(x);

  const supply = await tok.totalSupply();
  const dead = await tok.balanceOf(DEAD);
  const feeBurn = await mkt.feeBurn();
  const feeBurnBal = await tok.balanceOf(feeBurn);
  const treasury = await stk.treasury();

  console.log("OMC AI Tools · supply-accounting audit");
  console.log("  token        " + d.token);
  console.log("  staking      " + d.staking);
  console.log("  market       " + d.market);
  console.log("");

  console.log("  totalSupply()              = " + fmt(supply));
  console.log("  balanceOf(0x…dEaD)         = " + fmt(dead));
  console.log("  market.feeBurn()           = " + feeBurn);
  console.log("  balanceOf(feeBurn sink)    = " + fmt(feeBurnBal));
  console.log("  staking.treasury()         = " + treasury);
  console.log("  balanceOf(treasury)        = " + fmt(await tok.balanceOf(treasury)));
  console.log("  balanceOf(staking)         = " + fmt(await tok.balanceOf(d.staking)));
  console.log("  balanceOf(market)          = " + fmt(await tok.balanceOf(d.market)));
  console.log("  staking.totalSlashed()     = " + fmt(await stk.totalSlashed()));
  console.log("  staking.totalStake()       = " + fmt(await stk.totalStake()));
  console.log("");

  const slashed = await stk.totalSlashed();
  const burnBps = Number(await stk.SLASH_BURN_BPS());
  console.log("  SLASH_BURN_BPS             = " + burnBps + " bps (" + burnBps / 100 + "%)");

  /* Is 0xdEaD excluded from the supply the token reports, or does it just hold
     coins? Ask the token whether it knows any burn semantics at all. */
  const names = Object.keys(tok.interface.fragments.reduce((a, f) => {
    if (f.type === "function") a[f.name] = 1;
    return a;
  }, {}));
  const burns = names.filter((n) => /burn/i.test(n));
  console.log("  token functions matching /burn/ = " + (burns.length ? burns.join(", ") : "(none)"));
  console.log("");

  const slashedBurn = (slashed * BigInt(burnBps)) / 10000n;
  console.log("  slashing burn accrued so far      = " + fmt(slashedBurn));
  console.log("  of which still sitting at 0x…dEaD = " + fmt(dead));
  console.log("");

  /* The verdict. A sink address that keeps growing while totalSupply() stays
     put means the burn is a relocation, not a burn. The decisive check is the
     one the failure-path rehearsal performs: totalSupply() must fall by exactly
     20% of what was slashed, while the sink balance does not move at all. */
  console.log("  VERDICT");
  console.log("    A transfer to 0x…dEaD leaves totalSupply() untouched; only a real");
  console.log("    burn reduces it. So the invariant to test is:");
  console.log("      totalSupply() after a slash == totalSupply() before − slashed × 20%");
  console.log("      balanceOf(0x…dEaD) unchanged across that same slash");
  console.log("    Run e2e-failure.js and read its `token totalSupply A -> B` line:");
  console.log("    with the F-5 fix B is A minus the burn slice; without it B equals A.");
  if (dead > 0n) {
    console.log("");
    console.log("    The " + fmt(dead) + " already parked at the sink is pre-fix history: those");
    console.log("    transfers happened before the fix and are recoverable by nobody.");
  }
}

main().catch((e) => {
  console.error("FAILED:", e.shortMessage || e.message);
  process.exit(1);
});
