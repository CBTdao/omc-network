/**
 * Redeploy ONLY the OMCStaking contract against the existing tOMC token.
 *
 * The token is unchanged and already handed over, so redeploying it would only
 * burn testnet gas. The staking contract changed (the tier ladder is now
 * 20 / 100 / 500 / 1000 / 5000 instead of 100 × tier), so it genuinely needs a
 * new address.
 *
 * Usage:
 *   node contracts/tools/redeploy-staking.js deploy
 *   node contracts/tools/redeploy-staking.js fund      (mint + fund reward pool)
 *   node contracts/tools/redeploy-staking.js handover  (owner -> FINAL_OWNER)
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

const FINAL_OWNER = "0xc35711aa6128B8208FA534dbf94d3aF24BA22B4B";
const REWARD_FUNDING = 5_000_000n * 10n ** 18n;

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

async function deploy() {
  const { provider, wallet, balance } = await connect();
  if (balance < ethers.parseEther("0.008")) {
    throw new Error("deployer needs more tBNB");
  }
  const d = load();
  const stk = artifact("OMCStaking");

  console.log("\n[1/2] deploying OMCStaking against existing token", d.token);
  const F = new ethers.ContractFactory(stk.abi, stk.bytecode, wallet);
  const staking = await F.deploy(d.token, wallet.address, wallet.address);
  await staking.waitForDeployment();
  const stakingAddr = await staking.getAddress();
  console.log("      staking =", stakingAddr);

  console.log("[2/2] reading the new ladder back from the chain");
  for (let t = 1; t <= 5; t++) {
    console.log(`      tier ${t}:`, ethers.formatEther(await staking.minStakeForTier(t)), "tOMC");
  }

  d.prevStaking = d.staking;
  d.staking = stakingAddr;
  d.stakingTx = staking.deploymentTransaction().hash;
  d.deployedAt = new Date().toISOString();
  d.handedOverAt = null;
  d.rewardLiquidity = "0";
  d.tierLadder = ["20", "100", "500", "1000", "5000"];
  save(d);
  console.log("\nsaved →", DEPLOYMENTS);
  void provider;
}

async function fund() {
  const { wallet } = await connect();
  const d = load();
  const token = new ethers.Contract(d.token, artifact("OMCTestToken").abi, wallet);
  const staking = new ethers.Contract(d.staking, artifact("OMCStaking").abi, wallet);

  /* The token is already handed over to FINAL_OWNER, so the deployer can no
     longer mint. It does still hold spare tOMC from the first deployment —
     use that instead of minting. */
  const held = await token.balanceOf(wallet.address);
  console.log("deployer tOMC balance:", ethers.formatEther(held));
  if (held < REWARD_FUNDING) {
    throw new Error(
      "deployer holds " + ethers.formatEther(held) + " tOMC, needs " +
      ethers.formatEther(REWARD_FUNDING) + " — top it up from the token owner wallet"
    );
  }

  console.log("approving + funding", ethers.formatEther(REWARD_FUNDING), "tOMC into the new pool");
  await (await token.approve(d.staking, REWARD_FUNDING)).wait();
  const tx = await staking.fundRewards(REWARD_FUNDING);
  await tx.wait();
  d.rewardLiquidity = REWARD_FUNDING.toString();
  d.rewardFundingTx = tx.hash;
  save(d);
  const stats = await staking.protocolStats();
  console.log("rewardLiquidity =", ethers.formatEther(stats[2]), "tOMC");
}

async function handover() {
  const { wallet } = await connect();
  const d = load();
  const token = new ethers.Contract(d.token, artifact("OMCTestToken").abi, wallet);
  const staking = new ethers.Contract(d.staking, artifact("OMCStaking").abi, wallet);

  console.log("transferring verifier / treasury / requesterPool …");
  await (await staking.setVerifier(FINAL_OWNER)).wait();
  await (await staking.setTreasury(FINAL_OWNER)).wait();
  await (await staking.setRequesterPool(FINAL_OWNER)).wait();
  console.log("transferring staking ownership …");
  await (await staking.transferOwnership(FINAL_OWNER)).wait();
  d.handedOverAt = new Date().toISOString();
  save(d);
  console.log("done — deployer holds no privileged role on the new staking contract");
  void token;
}

const cmd = process.argv[2];
const run = { deploy, fund, handover }[cmd];
if (!run) {
  console.log("usage: node contracts/tools/redeploy-staking.js deploy|fund|handover");
  process.exit(1);
}
run().catch((e) => {
  console.error("\nFAILED:", e.shortMessage || e.message);
  process.exit(1);
});
