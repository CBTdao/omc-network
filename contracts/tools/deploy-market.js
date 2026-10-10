/**
 * Deploy OMCComputeMarket (the "AI Compute Station" requester-side contract)
 * against the already-live tOMC token and OMCStaking contract.
 *
 * The staking contract is *not* redeployed: it already holds the ladder and the
 * 500M tOMC reward pool. The only thing this script does to it is register the
 * new market address via `setMarket()`, which is what lets a failed job charge
 * the provider's bond.
 *
 * Usage:
 *   node contracts/tools/deploy-market.js deploy    (deploy + wire setMarket)
 *   node contracts/tools/deploy-market.js verify    (read every parameter back)
 *   node contracts/tools/deploy-market.js demo      (optional: run one escrow
 *                                                    round trip with the deployer
 *                                                    as both requester and node)
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const { ethers } = require("ethers");

const ROOT = path.join(__dirname, "..");
const ART = path.join(ROOT, "artifacts");
const DEPLOYMENTS = path.join(ROOT, "deployments", "bsc-testnet.json");

const RPCS = [
  "https://bsc-testnet-rpc.publicnode.com",
  "https://data-seed-prebsc-1-s1.binance.org:8545/",
  "https://endpoints.omniatech.io/v1/bsc/testnet/public",
];

/** owner on the live deployments: matches FINAL_OWNER used by the staking deploy */
const FINAL_OWNER = "0xc35711aa6128B8208FA534dbf94d3aF24BA22B4B";

function artifact(name) {
  return JSON.parse(fs.readFileSync(path.join(ART, `${name}.json`), "utf8"));
}
function load() {
  return JSON.parse(fs.readFileSync(DEPLOYMENTS, "utf8"));
}
function save(d) {
  fs.writeFileSync(DEPLOYMENTS, JSON.stringify(d, null, 2) + "\n");
}
function secrets() {
  const p = path.join(os.homedir(), ".workbuddy", "omc-secrets.env");
  const out = {};
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

async function connect() {
  const env = secrets();
  const pk = env.OMC_TESTNET_DEPLOYER_PRIVATE_KEY;
  if (!pk) throw new Error("OMC_TESTNET_DEPLOYER_PRIVATE_KEY missing");
  for (const url of RPCS) {
    try {
      const provider = new ethers.JsonRpcProvider(url, 97, { staticNetwork: true });
      const net = await provider.getNetwork();
      if (net.chainId !== 97n) continue;
      const wallet = new ethers.Wallet(pk, provider);
      const bal = await provider.getBalance(wallet.address);
      console.log(`rpc       ${url}`);
      console.log(`deployer  ${wallet.address}`);
      console.log(`balance   ${ethers.formatEther(bal)} tBNB`);
      return { provider, wallet, balance: bal };
    } catch (e) {
      console.log(`rpc failed: ${url} (${e.shortMessage || e.message})`);
    }
  }
  throw new Error("no working BSC testnet RPC");
}

function marketContract(d, runner) {
  return new ethers.Contract(d.market, artifact("OMCComputeMarket").abi, runner);
}
function stakingContract(d, runner) {
  return new ethers.Contract(d.staking, artifact("OMCStaking").abi, runner);
}

async function deploy() {
  const { wallet, balance } = await connect();
  /* ~12.3 KB of code costs 32k + 200*12595 ≈ 2.55M gas ≈ 0.00025 tBNB at the
     0.1 gwei testnet gas price, so 0.008 tBNB was ~30x the real cost. */
  if (balance < ethers.parseEther("0.0012")) {
    throw new Error(
      "deployer needs more tBNB (has " + ethers.formatEther(balance) + ", needs about 0.00025)"
    );
  }

  const d = load();
  if (d.market) {
    console.log("\n! deployments already record a market at", d.market);
    console.log("  delete the `market` key first if you really mean to deploy another.");
    return;
  }

  console.log("\n[1/3] deploying OMCComputeMarket");
  console.log("      token   =", d.token);
  console.log("      staking =", d.staking);
  const art = artifact("OMCComputeMarket");
  const F = new ethers.ContractFactory(art.abi, art.bytecode, wallet);
  // treasury / requesterPool / feeBurn all point at FINAL_OWNER on testnet:
  // there is no separate DAO treasury yet, and the burn sink is the dead address
  // configured inside the contract when feeBurn_ == address(0).
  const market = await F.deploy(d.token, d.staking, FINAL_OWNER, FINAL_OWNER, ethers.ZeroAddress);
  await market.waitForDeployment();
  const marketAddr = await market.getAddress();
  console.log("      market  =", marketAddr);

  console.log("[2/3] registering the market on OMCStaking (setMarket)");
  const stk = stakingContract(d, wallet);
  const currentOwner = await stk.owner();
  if (currentOwner.toLowerCase() !== wallet.address.toLowerCase()) {
    console.log("      ! staking owner is", currentOwner);
    console.log("      ! deployer cannot call setMarket — the owner wallet must do it:");
    console.log(`        staking.setMarket(${marketAddr})`);
  } else {
    const tx = await stk.setMarket(marketAddr);
    await tx.wait();
    console.log("      setMarket tx =", tx.hash);
  }

  console.log("[3/3] reading parameters back from the chain");
  await verifyInto(market, d, marketAddr);

  d.market = marketAddr;
  d.marketTx = market.deploymentTransaction().hash;
  d.marketDeployedAt = new Date().toISOString();
  d.marketOwner = await market.owner();
  d.marketScheduler = await market.scheduler();
  d.marketTreasury = await market.treasury();
  d.marketRequesterPool = await market.requesterPool();
  d.marketFeeBurn = await market.feeBurn();
  save(d);
  console.log("\nsaved →", DEPLOYMENTS);
}

async function verifyInto(market, d, addr) {
  const fee = await market.PROTOCOL_FEE_BPS();
  const win = await market.DISPUTE_WINDOW();
  console.log(`      ${addr}`);
  console.log("      PROTOCOL_FEE_BPS  =", fee.toString(), "(3%)");
  console.log("      DISPUTE_WINDOW    =", win.toString(), "s");
  console.log("      jobCount          =", (await market.jobCount()).toString());
  for (let t = 1; t <= 5; t++) {
    console.log(
      `      tier ${t} min stake =`,
      ethers.formatEther(await market.minStakeForTier(t)),
      "tOMC  (read through to OMCStaking)"
    );
  }
  void d;
}

async function verify() {
  const { provider, wallet } = await connect();
  const d = load();
  if (!d.market) throw new Error("no market in deployments yet — run `deploy` first");
  const market = marketContract(d, wallet);
  console.log("\n[verify] OMCComputeMarket", d.market);
  await verifyInto(market, d, d.market);
  const stk = stakingContract(d, wallet);
  /* staking.market() is the live wiring check. Until the OMCStaking owner calls
     setMarket(), the market's fail()/slashFor() path is dead: onlyMarket reverts.
     Read-only nodes still work, which is why this can slip past a smoke test. */
  let wired = null;
  try {
    wired = await stk.market();
  } catch (e) {
    wired = null;
  }
  if (wired && wired.toLowerCase() === d.market.toLowerCase()) {
    console.log("      staking.market()  =", wired, " OK — slashing is wired");
  } else {
    console.log("      staking.market()  =", wired || "(reverted / not set)");
    console.log("");
    console.log("  !! ACTION REQUIRED — the market is NOT wired into OMCStaking.");
    console.log("     Until the owner calls setMarket(), the fail() and slashFor()");
    console.log("     paths revert, so buyer refunds cannot be paid.");
    console.log("");
    console.log("     Owner (staking owner wallet) must send this transaction:");
    console.log("       to   " + d.staking);
    console.log("       data setMarket(" + d.market + ")");
    console.log("");
  }
  const stats = await market.protocolStats();
  console.log("      jobsTotal         =", stats[0].toString());
  console.log("      jobsSettled       =", stats[1].toString());
  console.log("      jobsFailed        =", stats[2].toString());
  console.log("      escrowedNow       =", ethers.formatEther(stats[3]));
  console.log("      settledVolume     =", ethers.formatEther(stats[4]));
  void provider;
}

/**
 * End-to-end smoke test on testnet, using the deployer wallet for both sides:
 *   1. stake + register the deployer as a tier-1 node (20 tOMC)
 *   2. appprove the market and create a job escrowing 1 tOMC
 *   3. scheduler assigns the deployer's own node, delivers a hash, settles
 *   4. print the fee split that actually moved
 * This exercises escrow, eligibility, settlement and the fee split on chain.
 */
async function demo() {
  const { wallet } = await connect();
  const d = load();
  const market = marketContract(d, wallet);
  const staking = stakingContract(d, wallet);
  const token = new ethers.Contract(d.token, artifact("OMCTestToken").abi, wallet);

  const me = wallet.address;
  console.log("\n[demo] node address:", me);

  const bal = await token.balanceOf(me);
  console.log("[demo] tOMC balance:", ethers.formatEther(bal));
  if (bal < ethers.parseEther("25")) {
    throw new Error("need at least 25 tOMC (20 to stake + 1 escrow + buffer)");
  }

  const minT1 = await staking.minStakeForTier(1);
  const already = await staking.node(me);
  if (already.stake < minT1) {
    console.log("[demo] approving + staking", ethers.formatEther(minT1), "tOMC at tier 1");
    await (await token.approve(d.staking, minT1)).wait();
    await (await staking.stake(minT1, 1)).wait();
  }
  if (!already.registered) {
    console.log("[demo] registering node");
    await (await staking.registerNode(1, "https://testnet.omc.network")).wait();
  }
  console.log("[demo] eligible for tier 1:", await market.isEligible(me, 1));
  const standing = await market.providerStanding(me, 1, 2);
  console.log(
    "[demo] standing: eligible=%s stake=%s required=%s worstCase(badOutput)=%s",
    standing[0],
    ethers.formatEther(standing[1]),
    ethers.formatEther(standing[2]),
    ethers.formatEther(standing[3])
  );

  const price = ethers.parseEther("1");
  const deadline = Math.floor(Date.now() / 1000) + 3600;
  const spec = ethers.keccak256(ethers.toUtf8Bytes("demo:inference:rtx4090:24gb"));
  console.log("[demo] approving escrow", ethers.formatEther(price), "tOMC");
  await (await token.approve(d.market, price)).wait();
  console.log("[demo] createJob (tier 1, spot-check, standard, paid in OMC)");
  const cj = await market.createJob(spec, 1, 0, 0, price, deadline, true);
  const rc = await cj.wait();
  const jobId = 1n; // first job on a fresh contract
  console.log("[demo] jobId =", jobId.toString(), "tx =", rc.hash);

  console.log("[demo] assign → confirmDelivery → settle");
  await (await market.assign(jobId, me)).wait();
  const res = ethers.keccak256(ethers.toUtf8Bytes("demo:output-hash"));
  await (await market.confirmDelivery(jobId, res)).wait();
  const before = await token.balanceOf(me);
  await (await market.settle(jobId, price)).wait();
  const after = await token.balanceOf(me);

  console.log("[demo] job state   =", (await market.getJob(jobId)).state.toString(), "(5 = SETTLED)");
  console.log("[demo] net tOMC out of the deployer wallet for this job:", ethers.formatEther(before - after));
  const stats = await market.protocolStats();
  console.log("[demo] settledVolume =", ethers.formatEther(stats[4]));
  console.log("[demo] feesCollected =", ethers.formatEther(stats[5]));
  console.log("[demo] feesBurned    =", ethers.formatEther(stats[6]));
  console.log("[demo] (fee should be 3% of 1 tOMC, minus the 10% OMC payment discount)");
}

const cmd = process.argv[2];
const run = { deploy, verify, demo }[cmd];
if (!run) {
  console.log("usage: node contracts/tools/deploy-market.js deploy|verify|demo");
  process.exit(1);
}
run().catch((e) => {
  console.error("\nFAILED:", e.shortMessage || e.message);
  process.exit(1);
});
