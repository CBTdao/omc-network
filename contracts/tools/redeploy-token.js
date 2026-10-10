#!/usr/bin/env node
/**
 * Full cascade redeploy: tOMC (new faucet rules) -> OMCStaking -> OMCComputeMarket.
 *
 * The faucet constants changed (20 tOMC / 1 day / 5 lifetime claims to mirror
 * the mainnet airdrop), which forces a new token address; both the staking and
 * the market contracts take the token in their constructors, so everything is
 * redeployed in one pass, wired, funded and handed over.
 *
 * Usage: node contracts/tools/redeploy-token.js
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

(async () => {
  const { wallet, balance } = await connect();
  const d = load();

  console.log("\n[1/6] deploying OMCTestToken (faucet 20 / 1 day / 5 claims)");
  const TF = new ethers.ContractFactory(artifact("OMCTestToken").abi, artifact("OMCTestToken").bytecode, wallet);
  const token = await TF.deploy(wallet.address);
  await token.waitForDeployment();
  const tokenAddr = await token.getAddress();
  console.log("      token   =", tokenAddr);
  console.log("      FAUCET_AMOUNT   =", ethers.formatEther(await token.FAUCET_AMOUNT()), "tOMC");
  console.log("      FAUCET_COOLDOWN =", (await token.FAUCET_COOLDOWN()).toString(), "s");
  console.log("      MAX_FAUCET_CLAIMS =", (await token.MAX_FAUCET_CLAIMS()).toString());

  console.log("[2/6] deploying OMCStaking against the new token");
  const SF = new ethers.ContractFactory(artifact("OMCStaking").abi, artifact("OMCStaking").bytecode, wallet);
  const staking = await SF.deploy(tokenAddr, wallet.address, wallet.address);
  await staking.waitForDeployment();
  const stakingAddr = await staking.getAddress();
  console.log("      staking =", stakingAddr);
  for (let t = 1; t <= 5; t++) {
    console.log(`      tier ${t}:`, ethers.formatEther(await staking.minStakeForTier(t)), "tOMC");
  }

  console.log("[3/6] funding the reward pool with", ethers.formatEther(REWARD_FUNDING), "tOMC");
  await (await token.approve(stakingAddr, REWARD_FUNDING)).wait();
  await (await staking.fundRewards(REWARD_FUNDING)).wait();
  const stats = await staking.protocolStats();
  console.log("      rewardLiquidity =", ethers.formatEther(stats[2]), "tOMC");

  console.log("[4/6] deploying OMCComputeMarket against the new pair");
  const MF = new ethers.ContractFactory(artifact("OMCComputeMarket").abi, artifact("OMCComputeMarket").bytecode, wallet);
  const market = await MF.deploy(tokenAddr, stakingAddr, FINAL_OWNER, FINAL_OWNER, ethers.ZeroAddress);
  await market.waitForDeployment();
  const marketAddr = await market.getAddress();
  console.log("      market  =", marketAddr);

  console.log("[5/6] wiring setMarket (deployer is still staking owner)");
  const setTx = await staking.setMarket(marketAddr);
  await setTx.wait();
  console.log("      setMarket tx =", setTx.hash);
  console.log("      market()     =", await staking.market());

  console.log("[6/6] handing staking + token ownership to", FINAL_OWNER);
  await (await staking.setVerifier(FINAL_OWNER)).wait();
  await (await staking.setTreasury(FINAL_OWNER)).wait();
  await (await staking.setRequesterPool(FINAL_OWNER)).wait();
  await (await staking.transferOwnership(FINAL_OWNER)).wait();
  await (await token.transferOwnership(FINAL_OWNER)).wait();
  console.log("      done — deployer holds no privileged role");

  d.prevToken = d.token;
  d.prevStaking = d.staking;
  d.prevMarket = d.market;
  d.token = tokenAddr;
  d.tokenTx = token.deploymentTransaction().hash;
  d.staking = stakingAddr;
  d.stakingTx = staking.deploymentTransaction().hash;
  d.market = marketAddr;
  d.marketTx = market.deploymentTransaction().hash;
  d.deployedAt = new Date().toISOString();
  d.handedOverAt = new Date().toISOString();
  d.rewardLiquidity = REWARD_FUNDING.toString();
  d.tierLadder = ["20", "100", "500", "1000", "5000"];
  save(d);
  console.log("\nsaved →", DEPLOYMENTS);
})().catch((e) => {
  console.error("\nFAILED:", e.shortMessage || e.message);
  process.exit(1);
});
