#!/usr/bin/env node
/**
 * Put contracts/params.json on chain.
 *
 *   node contracts/tools/set-params.js check
 *   node contracts/tools/set-params.js plan  --price 0.02
 *   node contracts/tools/set-params.js ladder --price 0.02 --apply
 *   node contracts/tools/set-params.js emit   --year 1 --apply
 *   node contracts/tools/set-params.js show
 *
 * Why this exists
 *   The staking ladder and the emission rate are owner-settable on the
 *   deployed OMCStaking (`setTierMinStake`, `setEmissionPerSecond`), so
 *   changing either does not need a redeploy. What it needs is a record of
 *   what was changed, to what, at which price, and by whom.
 *
 * Safety
 *   Nothing is sent unless --apply is passed. Without it the script prints the
 *   exact calls it would make. The key is read from ~/.workbuddy/omc-secrets.env
 *   (OMC_TESTNET_DEPLOYER_PRIVATE_KEY) and never leaves the machine — same
 *   convention as deploy.js. The owner of the contract, not the deployer, is
 *   what matters: if they differ, the script says so and stops.
 *
 * check and plan need no dependencies. --apply needs ethers.
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const PARAMS_PATH = path.join(ROOT, "contracts", "params.json");
const MANIFEST_PATH = path.join(ROOT, "contracts", "deployments", "bsc-testnet.json");
const HISTORY_PATH = path.join(ROOT, "contracts", "deployments", "params-history.json");
const SECRETS_PATH = path.join(os.homedir(), ".workbuddy", "omc-secrets.env");

const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;
const WEI = 10n ** 18n;

/* ------------------------------- helpers -------------------------------- */

const argv = process.argv.slice(2);
const command = argv[0] || "show";

function flag(name) {
  const i = argv.indexOf("--" + name);
  return i === -1 ? null : argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : true;
}

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

function fmt(n) {
  return n.toLocaleString("en-US");
}

/** ceil(usd / price), in whole OMC wei. Ceiling, never floor: a bond that
 *  rounds down is a bond that is slightly too small. */
function omcForUsd(usd, price) {
  if (!(price > 0)) throw new Error("--price must be a positive number");
  const numerator = BigInt(Math.round(usd * 1e6)) * WEI;
  const denominator = BigInt(Math.round(price * 1e6));
  return (numerator + denominator - 1n) / denominator;
}

function perSecondForYear(annualOMC) {
  return (BigInt(annualOMC) * WEI) / BigInt(SECONDS_PER_YEAR);
}

function validate(params) {
  const problems = [];

  const s = params.emission.scheduleOMC;
  const total = s.reduce((a, b) => a + b, 0);
  if (s.length !== 10) problems.push(`emission schedule has ${s.length} years, published as 10`);
  const reserve = params.emission.daoReserveOMC || 0;
  if (total + reserve !== params.emission.pool) {
    problems.push(
      `emission schedule ${fmt(total)} + DAO reserve ${fmt(reserve)} = ${fmt(total + reserve)}, ` +
      `but the pool is ${fmt(params.emission.pool)}`
    );
  }
  for (let i = 1; i < s.length; i++) if (s[i] < s[i - 1]) problems.push(`emission falls in year ${i + 1}`);

  const tiers = params.staking.tiers;
  if (tiers.length !== 5) problems.push(`ladder has ${tiers.length} tiers, the contract has 5`);
  for (let i = 1; i < tiers.length; i++) {
    if (tiers[i].usdTarget <= tiers[i - 1].usdTarget) problems.push(`tier ${i + 1} is not more expensive than tier ${i}`);
  }
  if (tiers[0].usdTarget < 200) problems.push("tier 1 below USD 200 stops being collateral");

  const manifest = readJson(MANIFEST_PATH);
  if (params.staking.onChain.contract.toLowerCase() !== manifest.staking.toLowerCase()) {
    problems.push("params.staking.onChain.contract does not match the deployment manifest");
  }
  if (params.staking.onChain.amountsOMC.join(",") !== manifest.tierLadder.join(",")) {
    problems.push("params.staking.onChain.amountsOMC does not match the deployed ladder");
  }

  return problems;
}

/* ------------------------------- commands ------------------------------- */

function cmdCheck() {
  const params = readJson(PARAMS_PATH);
  const problems = validate(params);
  if (problems.length) {
    console.error("params.json is inconsistent:");
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }
  const scheduled = params.emission.scheduleOMC.reduce((a, b) => a + b, 0);
  console.log(
    "params.json OK — " +
      fmt(scheduled) +
      " scheduled over 10 years + " +
      fmt(params.emission.daoReserveOMC || 0) +
      " DAO reserve = " +
      fmt(params.emission.pool) +
      " pool, ladder is monotone."
  );
}

function cmdShow() {
  const params = readJson(PARAMS_PATH);
  const on = params.staking.onChain;
  console.log("\nLadder — published USD targets vs what the contract holds today\n");
  console.log("  tier  USD target   on-chain OMC   status");
  params.staking.tiers.forEach((t, i) => {
    const live = on.amountsOMC[i];
    console.log(
      "  " + String(t.tier).padEnd(5) +
      ("$" + fmt(t.usdTarget)).padEnd(13) +
      String(fmt(live)).padEnd(16) +
      (on.status === "placeholder" ? "placeholder" : "applied")
    );
  });
  console.log("\n  " + on.note + "\n");
  console.log("Emission — annual ceilings\n");
  params.emission.scheduleOMC.forEach((v, i) => {
    console.log("  year " + String(i + 1).padEnd(3) + fmt(v).padStart(12) + "   " + perSecondForYear(v) + " wei/s");
  });
  console.log("");
}

function cmdPlan(opts) {
  const params = readJson(PARAMS_PATH);
  const price = Number(opts.price);
  if (!price) {
    console.error("plan needs --price <USD per OMC>, the reference price this restatement is made at.");
    process.exit(2);
  }

  console.log("\nRestating the ladder at 1 OMC = $" + price + "\n");
  console.log("  tier  USD target   OMC to apply      new bond size");
  const amounts = [];
  for (const t of params.staking.tiers) {
    const wei = omcForUsd(t.usdTarget, price);
    amounts.push(wei);
    const whole = Number(wei / WEI);
    console.log(
      "  " + String(t.tier).padEnd(5) +
      ("$" + fmt(t.usdTarget)).padEnd(13) +
      fmt(whole).padEnd(18) +
      "~$" + fmt(Math.round(whole * price))
    );
  }

  const previous = params.staking.onChain.amountsOMC;
  console.log("\n  change from the deployed ladder: " + amounts.map((a, i) => {
    const was = previous[i];
    const now = Number(a / WEI);
    const x = was ? (now / was).toFixed(1) : "—";
    return `tier ${i + 1}: ${fmt(was)} -> ${fmt(now)} (x${x})`;
  }).join("\n                                "));

  if (opts.year) {
    const y = Number(opts.year);
    const annual = params.emission.scheduleOMC[y - 1];
    if (!annual) {
      console.error(`\nNo year ${y} in the schedule.`);
      process.exit(2);
    }
    console.log(`\nEmission for year ${y}: ${fmt(annual)} OMC = ${perSecondForYear(annual)} wei/s`);
  }

  console.log("\nNothing was sent. Re-run with --apply to send.\n");
  return amounts;
}

async function applyLadder(price) {
  const params = readJson(PARAMS_PATH);
  const manifest = readJson(MANIFEST_PATH);
  const { signer, address } = await connect(manifest);

  const owner = await call(signer, manifest.staking, "owner()", []);
  if (owner.toLowerCase() !== address.toLowerCase()) {
    throw new Error(
      `the key in omc-secrets.env is ${address}, but the staking contract's owner is ${owner}. ` +
      `setTierMinStake is onlyOwner — transfer ownership first, or use the owner key.`
    );
  }

  for (const t of params.staking.tiers) {
    const wei = omcForUsd(t.usdTarget, price);
    const current = await call(signer, manifest.staking, "minStakeForTier(uint8)", [t.tier]);
    if (BigInt(current) === wei) {
      console.log(`  tier ${t.tier}: already ${fmt(Number(wei / WEI))} OMC, skipping`);
      continue;
    }
    const tx = await send(signer, manifest.staking, "setTierMinStake(uint8,uint256)", [t.tier, wei.toString()]);
    console.log(`  tier ${t.tier}: ${fmt(Number(BigInt(current) / WEI))} -> ${fmt(Number(wei / WEI))} OMC  ${tx.hash}`);
  }
  return { applied: "ladder", price, at: new Date().toISOString() };
}

async function applyEmission(year) {
  const params = readJson(PARAMS_PATH);
  const manifest = readJson(MANIFEST_PATH);
  const { signer } = await connect(manifest);
  const annual = params.emission.scheduleOMC[Number(year) - 1];
  if (!annual) throw new Error(`no year ${year} in the schedule`);
  const rate = perSecondForYear(annual);
  const tx = await send(signer, manifest.staking, "setEmissionPerSecond(uint256)", [rate.toString()]);
  console.log(`  year ${year}: ${fmt(annual)} OMC over 365 days = ${rate} wei/s  ${tx.hash}`);
  return { applied: "emission", year: Number(year), annualOMC: annual, perSecond: rate.toString(), at: new Date().toISOString() };
}

function recordHistory(entry) {
  const history = fs.existsSync(HISTORY_PATH) ? readJson(HISTORY_PATH) : { changes: [] };
  history.changes.push(entry);
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2) + "\n");
  console.log("\nAppended to contracts/deployments/params-history.json. Commit that file with the change.");
}

async function connect(manifest) {
  let ethers;
  try {
    ethers = require("ethers");
  } catch (_) {
    throw new Error(
      "ethers is not installed here. Run with NODE_PATH pointing at the isolated module set, exactly like deploy.js:\n" +
      "  NODE_PATH=$(npm root -g) node contracts/tools/set-params.js ..."
    );
  }
  if (!fs.existsSync(SECRETS_PATH)) throw new Error(`${SECRETS_PATH} not found — this machine has no deployer key.`);
  const env = Object.fromEntries(
    fs.readFileSync(SECRETS_PATH, "utf8").split("\n")
      .map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
      .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
  );
  const pk = env.OMC_TESTNET_DEPLOYER_PRIVATE_KEY;
  if (!pk) throw new Error("OMC_TESTNET_DEPLOYER_PRIVATE_KEY missing from omc-secrets.env");

  const rpc = process.env.OMC_RPC || "https://bsc-testnet-rpc.publicnode.com";
  const provider = new ethers.JsonRpcProvider(rpc, manifest.chainId);
  const signer = new ethers.Wallet(pk, provider);

  console.log(`\nChain ${manifest.chainId} · staking ${manifest.staking}`);
  console.log(`Signer ${signer.address} (from omc-secrets.env)\n`);
  return { signer, address: signer.address };
}

const IFACE_CACHE = new Map();
function ifaceFor(kind) {
  const ethers = require("ethers");
  if (!IFACE_CACHE.has(kind)) {
    const abi = kind === "owner"
      ? ["function owner() view returns (address)"]
      : [
        "function owner() view returns (address)",
        "function setTierMinStake(uint8 tier, uint256 v)",
        "function setEmissionPerSecond(uint256 v)",
        "function minStakeForTier(uint8 tier) view returns (uint256)",
      ];
    IFACE_CACHE.set(kind, new ethers.Interface(abi));
  }
  return IFACE_CACHE.get(kind);
}

async function call(signer, to, sig, args) {
  const iface = ifaceFor("owner");
  const data = iface.encodeFunctionData(sig, args);
  const raw = await signer.provider.call({ to, data });
  return iface.decodeFunctionResult(sig, raw)[0];
}

async function send(signer, to, sig, args) {
  const iface = ifaceFor("all");
  const data = iface.encodeFunctionData(sig, args);
  return signer.sendTransaction({ to, data });
}

/* --------------------------------- main --------------------------------- */

(async () => {
  const opts = { price: flag("price"), year: flag("year"), apply: flag("apply") === true };

  switch (command) {
    case "check":
      return cmdCheck();
    case "show":
      return cmdShow();
    case "plan":
      cmdPlan(opts);
      if (!opts.apply) return;
      break;
    case "ladder": {
      const amounts = cmdPlan(opts);
      if (!opts.apply) return;
      if (!amounts) throw new Error("plan did not produce amounts");
      return recordHistory(await applyLadder(Number(opts.price)));
    }
    case "emit": {
      if (!opts.year) throw new Error("emit needs --year <1..10>");
      if (!opts.apply) {
        const params = readJson(PARAMS_PATH);
        const annual = params.emission.scheduleOMC[Number(opts.year) - 1];
        console.log(`\nYear ${opts.year}: ${fmt(annual)} OMC = ${perSecondForYear(annual)} wei/s`);
        console.log("Nothing was sent. Re-run with --apply to send.\n");
        return;
      }
      return recordHistory(await applyEmission(opts.year));
    }
    default:
      console.error(`Unknown command "${command}". Try: check | show | plan | ladder | emit`);
      process.exit(2);
  }
})().catch((err) => {
  console.error("\n" + err.message + "\n");
  process.exit(1);
});
