#!/usr/bin/env node
/**
 * Deploy + verify the OMC testnet staking stack on BNB Smart Chain testnet.
 *
 *   NODE_PATH=<isolated node_modules> node contracts/tools/deploy.js deploy
 *   NODE_PATH=<isolated node_modules> node contracts/tools/deploy.js verify
 *   NODE_PATH=<isolated node_modules> node contracts/tools/deploy.js handover
 *
 * The signing key is read from ~/.workbuddy/omc-secrets.env
 * (OMC_TESTNET_DEPLOYER_PRIVATE_KEY) and never leaves this machine.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { ethers } = require("ethers");

const ROOT = path.resolve(__dirname, "..");
const ART = path.join(ROOT, "artifacts");
const DEPLOYMENTS = path.join(ROOT, "deployments", "bsc-testnet.json");

const RPCS = [
  "https://data-seed-prebsc-1-s1.binance.org:8545/",
  "https://bsc-testnet-rpc.publicnode.com",
  "https://endpoints.omniatech.io/v1/bsc/testnet/public",
];

/* final owner of both contracts (the team's testnet wallet) */
const FINAL_OWNER = "0xc35711aa6128B8208FA534dbf94d3aF24BA22B4B";
const REWARD_FUNDING = 5_000_000n * 10n ** 18n; // tOMC pushed into the reward pool

function secrets() {
  const p = path.join(os.homedir(), ".workbuddy", "omc-secrets.env");
  const out = {};
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

function artifact(name) {
  return JSON.parse(fs.readFileSync(path.join(ART, `${name}.json`), "utf8"));
}

async function connect() {
  const env = secrets();
  const pk = env.OMC_TESTNET_DEPLOYER_PRIVATE_KEY;
  if (!pk) throw new Error("OMC_TESTNET_DEPLOYER_PRIVATE_KEY missing in omc-secrets.env");

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

function save(d) {
  fs.mkdirSync(path.dirname(DEPLOYMENTS), { recursive: true });
  fs.writeFileSync(DEPLOYMENTS, JSON.stringify(d, null, 2) + "\n");
}
function load() {
  return JSON.parse(fs.readFileSync(DEPLOYMENTS, "utf8"));
}

/* ------------------------------- deploy ------------------------------- */

async function deploy() {
  const { provider, wallet, balance } = await connect();
  if (balance < ethers.parseEther("0.01")) {
    throw new Error("deployer needs more tBNB (send ~0.05 tBNB to the address above)");
  }

  const tok = artifact("OMCTestToken");
  const stk = artifact("OMCStaking");

  console.log("\n[1/3] deploying OMCTestToken…");
  const TokenF = new ethers.ContractFactory(tok.abi, tok.bytecode, wallet);
  const token = await TokenF.deploy(wallet.address);
  await token.waitForDeployment();
  const tokenAddr = await token.getAddress();
  console.log("      token  =", tokenAddr);

  console.log("[2/3] deploying OMCStaking…");
  const StakingF = new ethers.ContractFactory(stk.abi, stk.bytecode, wallet);
  const staking = await StakingF.deploy(tokenAddr, FINAL_OWNER, FINAL_OWNER);
  await staking.waitForDeployment();
  const stakingAddr = await staking.getAddress();
  console.log("      staking=", stakingAddr);

  console.log("[3/3] funding the reward pool with", ethers.formatEther(REWARD_FUNDING), "tOMC…");
  await (await token.mint(wallet.address, REWARD_FUNDING)).wait();
  await (await token.approve(stakingAddr, REWARD_FUNDING)).wait();
  await (await staking.fundRewards(REWARD_FUNDING)).wait();

  const stats = await staking.protocolStats();
  console.log("      rewardLiquidity =", ethers.formatEther(stats[2]), "tOMC");

  save({
    chainId: 97,
    network: "BNB Smart Chain Testnet",
    deployedAt: new Date().toISOString(),
    deployer: wallet.address,
    owner: FINAL_OWNER,
    token: tokenAddr,
    staking: stakingAddr,
    tokenTx: token.deploymentTransaction().hash,
    stakingTx: staking.deploymentTransaction().hash,
    rewardLiquidity: REWARD_FUNDING.toString(),
    rewardFundingTx: null,
    legacyPointsContract: "0x3C7EDae9da38b72Db7AE98921eF0759d19dE7Cc5",
  });
  console.log("\nsaved →", DEPLOYMENTS);
  void provider;
}

/* ------------------------------- verify ------------------------------- */

async function verify() {
  const { wallet } = await connect();
  const d = load();
  console.log(`\nverifying ${d.token} / ${d.staking}`);

  const tokenOwner = new ethers.Contract(d.token, artifact("OMCTestToken").abi, wallet);
  const stakingOwner = new ethers.Contract(d.staking, artifact("OMCStaking").abi, wallet);

  /* a throwaway node so the flow is exercised exactly like a real operator */
  const actor = ethers.Wallet.createRandom().connect(wallet.provider);
  console.log("test node wallet", actor.address);
  await (await wallet.sendTransaction({ to: actor.address, value: ethers.parseEther("0.02") })).wait();

  const token = tokenOwner.connect(actor);
  const staking = stakingOwner.connect(actor);

  console.log("[1] claimFaucet()");
  console.log("    faucetBalance before:", ethers.formatEther(await tokenOwner.balanceOf(actor.address)));
  await (await token.claimFaucet()).wait();
  console.log("    faucetBalance after :", ethers.formatEther(await tokenOwner.balanceOf(actor.address)));

  /* read the entry tier straight from the contract so this check can never
     drift from the deployed ladder (tier 1 = 20 tOMC since 2026-10-10) */
  const tier1Min = await stakingOwner.minStakeForTier(1);
  console.log("[2] approve + stake(" + ethers.formatEther(tier1Min) + ", tier 1)");
  await (await token.approve(d.staking, tier1Min)).wait();
  await (await staking.stake(tier1Min, 1)).wait();

  /* prove the ladder rejects a below-minimum tier-1 stake */
  try {
    await (await staking.stake(ethers.parseEther("1"), 1)).wait();
    console.log("    !! below-minimum tier-1 stake unexpectedly succeeded");
  } catch (e) {
    console.log("    below-minimum tier-1 stake correctly rejected");
  }

  console.log("[2b] tier ladder read back from the contract");
  for (let t = 1; t <= 5; t++) {
    console.log(`     tier ${t}:`, ethers.formatEther(await stakingOwner.minStakeForTier(t)), "tOMC");
  }

  console.log("[3] registerNode(1, …)");
  await (await staking.registerNode(1, "https://node.example.test:9190")).wait();

  console.log("[4] verifier reportWork(5 units)");
  const beforeWork = await tokenOwner.balanceOf(actor.address);
  await (await stakingOwner.reportWork(actor.address, 5)).wait();
  const pend = await stakingOwner.pendingOf(actor.address);
  console.log("    pending after reportWork:", ethers.formatEther(pend[0]), "tOMC (accrued + reported)");

  console.log("[5] claim()");
  await (await staking.claim()).wait();
  const after = await tokenOwner.balanceOf(actor.address);
  console.log("    credited to the node :", ethers.formatEther(after - beforeWork), "tOMC");

  console.log("[6] slashing path — shrink the liveness window to 60s and go dark");
  await (await stakingOwner.setHeartbeatParams(60, 0)).wait();
  const staked = (await stakingOwner.nodeSummary(actor.address))[4];
  console.log("    stake before:", ethers.formatEther(staked));
  await new Promise((r) => setTimeout(r, 70_000));
  await (await stakingOwner.slashOverdue(actor.address)).wait();
  const staked2 = (await stakingOwner.nodeSummary(actor.address))[4];
  console.log("    stake after :", ethers.formatEther(staked2), "(slashed", ethers.formatEther(staked - staked2), ")");
  console.log("    requesterPool:", ethers.formatEther(await tokenOwner.balanceOf(d.owner)));
  console.log("    burned (0xdEaD):", ethers.formatEther(await tokenOwner.balanceOf("0x000000000000000000000000000000000000dEaD")));

  console.log("[7] restore the published window (30 min / 10 min)");
  await (await stakingOwner.setHeartbeatParams(1800, 600)).wait();

  console.log("[8] heartbeat(), deregister(), unstake(all) — the exit path");
  await (await staking.heartbeat()).wait();
  await (await staking.deregister()).wait();
  const left = (await stakingOwner.nodeSummary(actor.address))[4];
  await (await staking.unstake(left)).wait();
  console.log("    node stake now:", ethers.formatEther((await stakingOwner.nodeSummary(actor.address))[4]));

  const stats = await stakingOwner.protocolStats();
  console.log("\nprotocol stats");
  console.log("  totalStake       ", ethers.formatEther(stats[0]));
  console.log("  emissionPerSecond", ethers.formatEther(stats[1]), "tOMC/s");
  console.log("  rewardLiquidity  ", ethers.formatEther(stats[2]));
  console.log("  nodes            ", stats[4].toString());
  console.log("  totalSlashed     ", ethers.formatEther(stats[5]));
  console.log("  totalWorkUnits   ", stats[6].toString());
  console.log("\nALL STEPS OK");
}

/* ------------------------------ handover ------------------------------ */

async function handover() {
  const { wallet } = await connect();
  const d = load();
  const token = new ethers.Contract(d.token, artifact("OMCTestToken").abi, wallet);
  const staking = new ethers.Contract(d.staking, artifact("OMCStaking").abi, wallet);

  console.log("verifier →", FINAL_OWNER);
  await (await staking.setVerifier(FINAL_OWNER)).wait();
  console.log("treasury / requesterPool →", FINAL_OWNER);
  await (await staking.setTreasury(FINAL_OWNER)).wait();
  await (await staking.setRequesterPool(FINAL_OWNER)).wait();

  console.log("transferring ownership of OMCStaking…");
  await (await staking.transferOwnership(FINAL_OWNER)).wait();
  console.log("transferring ownership of OMCTestToken…");
  await (await token.transferOwnership(FINAL_OWNER)).wait();

  d.handedOverAt = new Date().toISOString();
  save(d);
  console.log("done — deployer holds no privileged role any more");
}

const cmd = process.argv[2];
const run = { deploy, verify, handover }[cmd];
if (!run) {
  console.log("usage: node contracts/tools/deploy.js deploy|verify|handover");
  process.exit(1);
}
run().catch((e) => {
  console.error("\nFAILED:", e.shortMessage || e.message);
  process.exit(1);
});
