# contracts/security

Supporting material for the self-review published in
[`../../docs/security-review.md`](../../docs/security-review.md) and
[`../../SECURITY.md`](../../SECURITY.md).

This directory is evidence, not product. Nothing here is deployed.

| Path | What it is |
|---|---|
| `fuzz_props.py` | Property-based / fuzz harness. Spins up a local `anvil` node, deploys the contracts, and checks the three highest-value invariants over randomised inputs. Needs `web3.py` and `anvil` on PATH. |
| `verify_live_bytecode.py` | Fetches the runtime bytecode from BSC testnet and compares it against the reviewed build and the pre-fix build. Writes `bytecode-report.json` with `--write`. |
| `bytecode-report.json` | Output of the above, at the block recorded inside it. |
| `build-snapshot/` | ABI + bytecode of the **reviewed (fixed)** source, committed so `fuzz_props.py` runs from a fresh clone without a compiler. |
| `pre-fix-snapshot/` | ABI + bytecode of the sources as they stood at the deployed commit, i.e. **the code that is running on testnet**. `fuzz_props.py --artifacts pre-fix-snapshot --only p3` reproduces finding F-1. |
| `slither-summary-{pre,post}.json` | Triaged Slither output before and after the fixes (file, line, impact, check, truncated description). |
| `solhint-summary-{pre,post}.json` | Triaged solhint output before and after the fixes. |

## Running the harness

```bash
cd contracts/security

# all three properties against the reviewed build
python fuzz_props.py

# fewer iterations, or a different seed / port
python fuzz_props.py --iterations 20 --seed 1 --port 8600

# only one property
python fuzz_props.py --only p3

# against the bytecode that is deployed on testnet today
python fuzz_props.py --artifacts pre-fix-snapshot --only p3
python fuzz_props.py --artifacts pre-fix-snapshot --only p4
```

Exit code 0 means every property held for every generated input; 1 means at least one
violation was found and is printed.

`anvil` is looked up on PATH and falls back to
`~/.workbuddy/binaries/foundry/anvil.exe`. Override with `--anvil /path/to/anvil`.

## Properties checked

- **P1 — the published APR ceiling.** For any stake size and any dial setting,
  `effectiveEmissionPerSecond() * SECONDS_PER_YEAR * BPS / totalStake <= maxAprBps`,
  and the rate never exceeds the 10-year schedule. Both branches of
  `emissionConstraint()` are exercised.
- **P2 — escrow conservation on settlement.** After `settle()`, the market's token
  balance and `totalEscrowed()` both return to zero, and the fee matches the published
  3% (2.7% when paid in OMC).
- **P3 — the §7.5 penalty table and bond-funded compensation.** Exactly
  `bond * penalty_bps / 10000` leaves the bond and no more, the requester's net gain is
  50% of the slash, the slashed provider stops earning, and the market holds nothing.
- **P4 — escrow isolation between concurrent jobs.** Failing one job must leave another
  open job's escrow intact to the wei, must leave `totalEscrowed()` reporting exactly
  that escrow, and must leave the second job refundable.

P3 and P4 both found / pin finding **F-1** (see `../../docs/security-review.md`): the
market used to apply the slashing split a second time and was short by half of every
slash, so `fail()` reverted for every non-zero penalty. Both properties fail against
`pre-fix-snapshot/` and pass against `build-snapshot/`.

## Regenerating the snapshots

```bash
# reviewed build
cd contracts && NODE_PATH=<node_modules> node tools/compile.js
cp artifacts/{OMCTestToken,OMCStaking,OMCComputeMarket}.json security/build-snapshot/

# pre-fix build: check out the deployed revision into a scratch directory and compile
# it with the same settings (solc 0.8.26, optimizer 200, viaIR, evmVersion paris),
# then drop the three JSON files into security/pre-fix-snapshot/
```

The Foundry suite for the same contracts lives one level up in `contracts/test/`.
