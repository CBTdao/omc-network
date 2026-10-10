#!/usr/bin/env node
/**
 * Generate BscScan "Standard-Json-Input" verification files.
 *
 * The compiler settings MUST match contracts/tools/compile.js exactly, or
 * BscScan reports "no matching bytecode": 0.8.26 / optimizer 200 / viaIR /
 * evmVersion paris. The source content is the on-disk .sol, so whatever was
 * last deployed is what gets verified.
 *
 * Usage: node contracts/tools/make-verify-json.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUTDIR = path.resolve(ROOT, "..", ".."); // workbench root, next to the HTML helpers

function build(file) {
  const content = fs.readFileSync(path.join(ROOT, file), "utf8");
  return {
    language: "Solidity",
    sources: { [file]: { content } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
      evmVersion: "paris",
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object", "metadata"],
        },
      },
    },
  };
}

const JOBS = [
  { file: "OMCComputeMarket.sol", base: "verify-OMCComputeMarket-standard-json" },
  { file: "OMCTestToken.sol", base: "verify-OMCTestToken-standard-json" },
];

for (const j of JOBS) {
  const input = build(j.file);
  const json = JSON.stringify(input, null, 2);
  const p = path.join(OUTDIR, j.base + ".json");
  fs.writeFileSync(p, json);
  fs.writeFileSync(path.join(OUTDIR, j.base + ".txt"), json);
  console.log(`${j.base}.json  (${json.length} bytes)  ← ${j.file} ${input.sources[j.file].content.length} chars`);
}
console.log("\ndone");
