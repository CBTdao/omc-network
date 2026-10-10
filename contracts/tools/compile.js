#!/usr/bin/env node
/**
 * Compile the OMC testnet contracts with solc (no imports, single-file sources).
 *
 *   NODE_PATH=<isolated node_modules> node contracts/tools/compile.js
 *
 * Writes contracts/artifacts/<Contract>.json  (ABI + bytecode; git-ignored)
 * and prints the 4-byte selectors the static front end hard-codes.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "artifacts");

const solc = require("solc");
const { keccak256, toUtf8Bytes } = require("ethers");

const FILES = ["OMCTestToken.sol", "OMCStaking.sol", "OMCComputeMarket.sol"];

const sources = {};
for (const f of FILES) {
  sources[f] = { content: fs.readFileSync(path.join(ROOT, f), "utf8") };
}

const input = {
  language: "Solidity",
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    // the view helpers return wide tuples; viaIR keeps the stack happy
    viaIR: true,
    // 'paris' avoids PUSH0 so the bytecode runs on every BNB-chain-compatible EVM
    evmVersion: "paris",
    outputSelection: {
      "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] },
    },
  },
};

const out = JSON.parse(solc.compile(JSON.stringify(input)));

const errors = (out.errors || []).filter((e) => e.severity === "error");
for (const e of out.errors || []) {
  // surface warnings too, but keep them short
  console.log(`${e.severity.toUpperCase()}: ${e.formattedMessage.split("\n")[0]}`);
}
if (errors.length) process.exit(1);

fs.mkdirSync(OUT, { recursive: true });
const artifacts = {};

for (const f of FILES) {
  const contracts = out.contracts[f] || {};
  for (const [name, c] of Object.entries(contracts)) {
    artifacts[name] = {
      abi: c.abi,
      bytecode: "0x" + c.evm.bytecode.object,
      deployedBytecode: "0x" + c.evm.deployedBytecode.object,
    };
    fs.writeFileSync(
      path.join(OUT, `${name}.json`),
      JSON.stringify(artifacts[name], null, 2)
    );
    console.log(
      `OK ${name.padEnd(14)} bytecode ${((c.evm.bytecode.object.length / 2) / 1024).toFixed(1)} KB`
    );
  }
}

/* selector table for the functions the static front end calls directly */
const FRONT_END_CALLS = {
  OMCTestToken: [
    "faucetReadyAt(address)",
    "claimFaucet()",
    "approve(address,uint256)",
    "allowance(address,address)",
    "balanceOf(address)",
    "faucetRemaining()",
    "FAUCET_AMOUNT()",
    "FAUCET_COOLDOWN()",
    "faucetClaims(address)",
  ],
  OMCStaking: [
    "stake(uint256,uint8)",
    "unstake(uint256)",
    "registerNode(uint8,string)",
    "heartbeat()",
    "deregister()",
    "claim()",
    "pendingOf(address)",
    "nodeSummary(address)",
    "protocolStats()",
    "minStakeForTier(uint8)",
    "isOverdue(address)",
    "nodeCount()",
    "market()",
  ],
  OMCComputeMarket: [
    "createJob(bytes32,uint8,uint8,uint8,uint256,uint64,bool)",
    "cancelJob(uint256)",
    "dispute(uint256)",
    "getJob(uint256)",
    "jobCount()",
    "protocolStats()",
    "minStakeForTier(uint8)",
    "isEligible(address,uint8)",
    "providerStanding(address,uint8,uint8)",
    "PROTOCOL_FEE_BPS()",
    "DISPUTE_WINDOW()",
  ],
};

console.log("\n--- selectors (copy into website/assets/js/stake.js) ---");
for (const [contract, sigs] of Object.entries(FRONT_END_CALLS)) {
  console.log(`\n[${contract}]`);
  for (const sig of sigs) {
    console.log(`  ${keccak256(toUtf8Bytes(sig)).slice(0, 10)}  ${sig}`);
  }
}
