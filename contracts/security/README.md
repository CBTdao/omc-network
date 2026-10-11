# contracts/security

Supporting material for the self-review published in
[`../../docs/security-review.md`](../../docs/security-review.md) and
[`../../SECURITY.md`](../../SECURITY.md).

This directory is evidence, not product. Nothing here is deployed.

| Path | What it is |
|---|---|
| `fuzz_props.py` | Property-based / fuzz harness. Spins up a local `anvil` node, deploys the contracts, and checks the five highest-value invariants over randomised inputs. Needs `web3.py` and `anvil` on PATH. |
| `verify_live_bytecode.py` | Fetches the runtime bytecode from BSC testnet and compares it against the reviewed build and every historical snapshot. Reads the addresses from `../deployments/bsc-testnet.json`. Writes `bytecode-report.json` with `--write`. |
| `bytecode-report.json` | Output of the above, at the block recorded inside it. |
| `build-snapshot/` | ABI + bytecode of the **current source tree** — what a redeploy today would ship, and what §3 finds live on testnet. Committed so `fuzz_props.py` runs from a fresh clone without a compiler. |
| `pre-f5-snapshot/` | F-1 fixed, F-12 not yet. The revision that was live between the two passes. `fuzz_props.py --artifacts pre-f5-snapshot --only p5` reproduces F-12: 241 assertions, 241 violations. |
| `pre-fix-snapshot/` | ABI + bytecode of the sources as they stood at the first deployed commit. `fuzz_props.py --artifacts pre-fix-snapshot --only p3` reproduces finding F-1. |
| `slither-summary-{pre,post}.json` | Triaged Slither output before and after the fixes (file, line, impact, check, truncated description). |
| `solhint-summary-{pre,post}.json` | Triaged solhint output before and after the fixes. |

Three snapshots, one per source revision that has ever been deployed. They exist so that
"the fix is written" and "the fix is live" can be told apart mechanically: the verifier
compares the chain against all three and reports `STALE DEPLOYMENT` when the live code
matches an older one. That exact confusion happened once — see F-11 in
[`../../docs/security-review.md`](../../docs/security-review.md).

## Running the harness

```bash
cd contracts/security

# all five properties against the current build
python fuzz_props.py

# fewer iterations, or a different seed / port
python fuzz_props.py --iterations 20 --seed 1 --port 8600

# only one property
python fuzz_props.py --only p3

# reproduce the two defects that were found and fixed
python fuzz_props.py --artifacts pre-fix-snapshot --only p3   # F-1: fail() reverts
python fuzz_props.py --artifacts pre-fix-snapshot --only p4   # F-1: escrow isolation
python fuzz_props.py --artifacts pre-f5-snapshot  --only p5   # F-12: the burn does not burn
```

Exit code 0 means every property held for every generated input; 1 means at least one
violation was found and is printed. Run the snapshot variants too: a property that only
ever passes proves nothing about its own discriminating power.

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
- **P5 — the penalty burn destroys the tokens.** `totalSupply()` must fall by exactly the
  20% burn slice and the dead address must receive nothing. Naming the dead address as a
  literal in the harness rather than reading it from the artifact under test is
  deliberate: a build must not be able to move the constant and still pass.

P3 and P4 pin finding **F-1** (see `../../docs/security-review.md`): the market used to
apply the slashing split a second time and was short by half of every slash, so `fail()`
reverted for every non-zero penalty. Both properties fail against `pre-fix-snapshot/`
and pass against `build-snapshot/`. P5 pins **F-12**: the burn slice used to be
`transfer`red to `0x…dEaD`, which moves tokens without reducing supply, so the published
rule that the burn reduces supply was not enforced. It fails 241 out of 241 assertions
against `pre-f5-snapshot/` and passes against `build-snapshot/`.

## Regenerating the snapshots

```bash
# current build
cd contracts && NODE_PATH=<node_modules> node tools/compile.js
cp artifacts/{OMCTestToken,OMCStaking,OMCComputeMarket}.json security/build-snapshot/

# historical snapshots: before refreshing build-snapshot/, copy the outgoing version
# aside first — it is the only record of what that revision compiled to
cp security/build-snapshot/*.json security/pre-f5-snapshot/

# pre-fix build: check out the first deployed revision into a scratch directory and
# compile it with the same settings (solc 0.8.26, optimizer 200, viaIR, paris),
# then drop the three JSON files into security/pre-fix-snapshot/
```

The Foundry suite for the same contracts lives one level up in `contracts/test/`.
