# Security review — OMC testnet contracts

**Scope:** `OMCTestToken.sol`, `OMCStaking.sol`, `OMCComputeMarket.sol` (1,573 lines as
reviewed; 1,587 after the fixes) and the BSC testnet deployments listed below.
**Date of review:** 2026-10-11
**Reviewer:** the OMC team (self-review), using free tooling only.
**Status:** 1 High-severity defect found and fixed in source. **The fix is not yet
deployed** — the addresses below still run the pre-fix code.

---

## 0. This is not an audit — read this first

This document reports what automated analysis and property-based testing found.
It is **not** a third-party security audit, and it must not be described as one.

Free automated tools have measurable limits, and the limits are large. A 2024 study
of 127 incidents causing roughly $2.3 B of losses found that five mainstream
automated analysers combined would have flagged only about **8%** of them. A 2023
study of 516 exploitable vulnerabilities found that **more than 80%** were outside
what those tools can see at all. Anything that says "audited" on the basis of this
document would be misleading.

What this review does support is the narrower claim: *the contracts were analysed
with static analysers and property-based tests, one High-severity defect was found
and fixed, and the remaining tool output has been triaged item by item.*

The deployed contracts are **BNB Smart Chain testnet** deployments. They hold no
value, no sale has taken place, and nothing here implies a return of any kind.

---

## 1. What was reviewed

| File | Lines (as reviewed → fixed) | Address (BSC testnet, chainId 97) |
|---|---|---|
| `contracts/OMCTestToken.sol` | 196 → 196 | `0xBEB21E40FB50A0F4ba9287C2058DC7851e450671` |
| `contracts/OMCStaking.sol` | 743 → 750 | `0x3226dffED51e28CEf526F8c078B2EC9a092E36e6` |
| `contracts/OMCComputeMarket.sol` | 634 → 641 | `0x3B81E6edfbA775B4E53694F531C3b0236D77FEF1` |

Build configuration under review: `solc 0.8.26`, `optimizer: enabled, runs: 200`,
`viaIR: true`, `evmVersion: paris` (`contracts/tools/compile.js`).

### Out of scope

The off-chain scheduler process, the node worker, the static front end, the
whitepaper's token economics and the incentive design were **not** reviewed. Only
the three Solidity contracts were.

---

## 2. Method

| Tool | Version | Result |
|---|---|---|
| **solhint** (Solidity linter) | 6.2.5 | 0 errors, 502 warnings — all style / gas / natspec |
| **Slither** (static analysis, Trail of Bits) | 0.11.6, 102 detectors | 0 Critical, 0 High, 26 Medium, 46 Low (72 total before the fix; 69 after) |
| **Property-based tests**, `anvil` + `web3.py` | Foundry 1.8.5 / web3.py 7.x | 2,521 assertions over randomised inputs — see §5 |
| **Property-based tests**, Foundry (`forge test`) | Foundry 1.8.5 | authored and compile-verified, **not executed** — see §3 |
| **Manual review** | — | all 1,573 lines of the pre-fix revision read line by line |

### Not run, and why

Recorded so the gaps are visible rather than implied.

- **`forge test` could not execute on the review machine.** Foundry cannot spawn
  `solc` on this Windows host: process creation fails with `os error 231`
  (*all pipe instances are busy*). This reproduces outside the sandbox, with the
  VM's own solc, and with Foundry's downloaded solc. The Foundry suite in
  `contracts/test/` therefore ships **compile-verified but unexecuted**
  (`solc --optimize --via-ir` on all three test contracts: 0 errors). The
  `anvil` + `web3.py` harness below re-covers the three highest-value properties.
- **No formal verification.** `solc`'s SMTChecker needs an SMT solver; the official
  Windows `solc` binary reports `Solver z3 was selected for SMTChecker but it is not
  available` and disables both the CHC and BMC engines. `z3` was installed and
  placed next to the compiler; the Windows build still could not load it.
- **Aderyn** (Cyfrin) publishes only macOS and Linux binaries — no Windows build.
- **Not run at all:** Semgrep `p/smart-contracts`, Mythril, Halmos, Echidna,
  Medusa, Consensys Diligence Fuzzing, `slither --print` summary printers beyond
  the default detector set.

---

## 3. Reproducibility — does the reviewed source match the chain?

`contracts/security/verify_live_bytecode.py` fetches the runtime bytecode from BSC
testnet and compares it with two local builds: the sources as reviewed, and the
sources as they stood at the commit that was deployed (`pre-fix-snapshot/`).

Result at block 136,093,149 — see `contracts/security/bytecode-report.json`:

| Contract | live | reviewed | pre-fix | verdict |
|---|---|---|---|---|
| `OMCTestToken` | 3,474 B | 3,474 B | 3,474 B | **byte-for-byte identical to both builds** |
| `OMCStaking` | 13,035 B | 12,996 B | 13,035 B | deployed == pre-fix build (differs only at zero-filled immutable regions) |
| `OMCComputeMarket` | 11,774 B | 11,329 B | 11,774 B | deployed == pre-fix build (differs only at zero-filled immutable regions) |

`tOMC` has no immutables, so its build must reproduce the deployed runtime exactly —
it does. That is the control which shows the toolchain is faithful. `OMCStaking` and
`OMCComputeMarket` both declare immutables (`token`, and `staking` respectively),
which are patched into the runtime code at construction; masking those regions, the
pre-fix build matches the chain exactly. **The code analysed below is therefore the
code that is running.**

`OMCTestToken` is untouched by this review's fixes; the two other files are not.

---

## 4. Findings

| # | Severity | Contract | Title | State |
|---|---|---|---|---|
| F-1 | **High** | `OMCComputeMarket` | `fail()` double-applies the slashing split and always reverts | **Fixed in source**; not deployed |
| F-2 | Low | `OMCStaking` | `heartbeat()` / `slashOverdue()` update state after an external call | Fixed in source |
| F-3 | Low | `OMCStaking` | Dead-code `require` in `unstake()` | Fixed in source |
| F-4 | Informational | `OMCStaking` | Local `bps` relied on implicit zero-initialisation | Fixed in source |
| F-5 | Low | `OMCStaking` | `setMarket()` accepts `address(0)` | Accepted, documented |
| F-6 | Informational | both | Integer division before multiplication in the fee / slash splits | Accepted by design |
| F-7 | Informational | both | `incorrect-equality` flags on zero sentinels | False positive |
| F-8 | Informational | both | State writes and events after token transfers | Accepted (token has no hooks) |
| F-9 | Informational | `OMCComputeMarket` | `unused-return` on the `nodeSummary` tuple | False positive; tuple verified |
| F-10 | Informational | `OMCStaking` | `nodeSummary`'s `stake` return shadows `stake()` | Accepted, cosmetic |
| F-11 | — | — | The live testnet still runs the pre-fix bytecode | **Open** |

---

### F-1 — High: `OMCComputeMarket.fail()` always reverts when a provider is slashed

**Where:** `OMCComputeMarket.fail()` (pre-fix `contracts/OMCComputeMarket.sol:526-567`).

**What happens.** The published slashing split (50% requester / 30% treasury /
20% burned, whitepaper §7.5) is applied **twice**, and the second application is
funded from the wrong balance.

`OMCStaking.slashFor()` already performs the whole split:

```solidity
if (toRequesters > 0) require(token.transfer(market, toRequesters), "OMCS: transfer");
if (toTreasury   > 0) require(token.transfer(treasury, toTreasury), "OMCS: transfer");
if (burned       > 0) require(token.transfer(BURN_ADDRESS, burned), "OMCS: transfer");
```

Only the requester slice reaches the market. `fail()` then paid all three slices
again out of its own balance, which is just the escrow plus that one slice:

```solidity
slashed = staking.slashFor(provider, uint8(reason));   // market receives 50%
if (toRequester > 0) require(token.transfer(j.requester, toRequester), ...);
if (toTreasury   > 0) require(token.transfer(treasury, toTreasury),   ...); // 30% — not held
if (burned      > 0) require(token.transfer(feeBurn, burned),        ...); // 20% — not held
j.state = JobState.REFUNDED;
require(token.transfer(j.requester, escrow), "OMCM: refund failed");
```

**Arithmetic.** The market holds `escrow`. It receives `toRequester` from staking,
then must pay `toRequester + toTreasury + burned + escrow = slashed + escrow`.
It is short by exactly `slashed − toRequester = toTreasury + burned`, i.e. **50% of
the slashed amount**, for every non-zero slash. There is no input for which the
refund succeeds while the market holds only its escrow.

**Impact.** The market's failure path — the mechanism that makes a requester whole
out of the provider's bond — cannot execute. A failed job stays stuck in
`ASSIGNED` / `DELIVERED` / `DISPUTED`, its escrow stays locked, and the provider is
never slashed. If the market ever holds surplus tokens beyond `totalEscrowed`
(direct donations), the call would instead succeed and pay the treasury and burn
slices a **second** time out of that surplus, while `totalEscrowed` accounting
drifts from the real balance. Both outcomes violate the design intent documented at
the top of `OMCComputeMarket.sol`.

No third party loses funds on the live deployment, because the market holds no
meaningful balance on testnet. The defect is in the protocol logic, not in custody.

**Evidence.**

1. Arithmetic above.
2. Property-based test, run against the **pre-fix build that matches the deployed
   bytecode** (`security/fuzz_props.py --artifacts pre-fix-snapshot --only p3`):

   ```
   P3#0: fail() is unusable -- reverted: tOMC: balance
         (reason=2, penalty 3000 bps, bond=299675 OMC, escrow=739.882 OMC)
   ```

3. Escrow-isolation property (P4), pre-fix build — the market is holding two
   escrows and neither call can even be made:

   ```
   P4#0: fail() is unusable -- reverted: tOMC: balance
   ```

4. Deterministic reproduction at bond 1,000 OMC / escrow 1,000 OMC: for each
   reason the market is short by exactly half the slash —

   | reason | penalty | slashed | requester | treasury | burn | market short by |
   |---|---|---|---|---|---|---|
   | 0 timeout | 2% | 20 | 10 | 6 | 4 | **10** |
   | 1 offline | 5% | 50 | 25 | 15 | 10 | **25** |
   | 2 bad output | 30% | 300 | 150 | 90 | 60 | **150** |
   | 3 fraud | 100% | 1000 | 500 | 300 | 200 | **500** |

   `fail()` reverted with `tOMC: balance` in every case.

**Fix applied.** The duplicate transfers were removed: `OMCStaking.slashFor()`
applies the split, and the market's only remaining job is to forward the requester
slice. The event still reports the treasury and burn slices, because staking really
does pay them. `j.state = JobState.REFUNDED` was also moved above the external
calls, which closes the checks-effects-interactions gap in the same function.

Note for callers: `OMCComputeMarket.treasury` and `.feeBurn` are no longer used by
`fail()`; they remain in use by `settle()` for the protocol fee split.

**After the fix**, the same property passes — see §5.

---

### F-2 — Low: `heartbeat()` and `slashOverdue()` updated the clock after transferring

**Where:** `OMCStaking.heartbeat()` (`:461-479`) and `slashOverdue()` (`:482-490`).

Both computed `missed = _overdueIntervals(...)`, then called `_applySlash()`, which
transfers tokens, and only afterwards wrote `n.lastHeartbeat = block.timestamp`.
Between the transfer and the write, `_overdueIntervals()` still reported the node as
overdue, so a re-entrant `heartbeat()` could charge the same intervals twice.

Not reachable today: `OMCTestToken` is a plain ERC-20 with no transfer hooks and no
callbacks, so no code of an attacker's runs inside the transfer. It becomes reachable
if a callback-capable token is ever used, which is a plausible mainnet decision.

**Fix applied.** Both functions now stop the clock before the slash. `heartbeat()`
still restores `earning` afterwards, which is intentional.

One Slither `reentrancy-no-eth` entry remains in `heartbeat()` for the bookkeeping
writes that must follow `_applySlash` (`n.earning`, `totalStake`, `n.rewardDebt`).
Those writes cannot be double-counted once `lastHeartbeat` is already current.

---

### F-3 — Low: dead code in `unstake()`

```solidity
uint256 remaining = n.stake - amount;
if (n.registered) {
    require(remaining >= minStakeForTier(n.tier), "OMCS: below tier minimum");
} else {
    require(remaining == 0 || remaining > 0, "OMCS: amount");   // always true
}
```

`remaining` is a `uint256`, so the else-branch assertion can never fail. Removed.

Worth recording as a behaviour note rather than a defect: because of the
`n.registered` branch, **a registered node can never unstake below its tier
minimum**, so the exit path is `heartbeat()` → `deregister()` → `unstake()`. Trying
to unstake the full amount while still registered reverts. This is asserted in
`contracts/test/StakingProps.t.sol::test_exitPath_requiresDeregisterFirst`.

---

### F-4 — Informational: implicitly initialised local

`OMCStaking.slashFor()` declared `uint256 bps;` and relied on Solidity's implicit
zero-initialisation. The `if / else if / else revert` chain does assign it on every
reachable path, so this was a false positive in effect — but the declaration is now
explicit (`uint256 bps = 0;`), which also removes a Slither Medium flag.

---

### F-5 — Low, accepted: `setMarket()` has no zero-address check

```solidity
function setMarket(address m) external onlyOwner {
    emit MarketChanged(market, m);
    market = m;
}
```

Slither flags the missing zero check. It is accepted deliberately: `onlyMarket`
already requires `market != address(0)`, so `setMarket(address(0))` is a meaningful
"detach the market" operation rather than a mistake. The consequence is that a
careless owner call silently disables all job-failure penalties; that is documented
here rather than blocked in code. `setTreasury`, `setRequesterPool` and
`setVerifier` do reject the zero address, because a zero address there is never
meaningful.

---

### F-6 — Informational: division before multiplication in the splits

Slither reports `divide-before-multiply` six times, e.g.

```solidity
uint256 fee    = (amount * PROTOCOL_FEE_BPS) / BPS;      // truncates
uint256 toBurn = (fee * FEE_BURN_BPS) / BPS;             // multiplies the truncated value
```

Each truncation loses at most one wei at 18 decimals, and the code is written so the
remainder cannot be lost: `burned = slashed - toRequesters - toTreasury` assigns the
rounding dust to the burn slice, and `toRewards = fee - toBurn` does the same on the
fee side. Reordering to `amount * FEE_BURN_BPS * PROTOCOL_FEE_BPS / BPS / BPS` would
change the published split's exact outputs for a rounding gain of no economic value.
Accepted as-is.

---

### F-7 — Informational, false positive: `incorrect-equality`

Slither reports 14 strict equalities, all of the form `x == 0` on a value that was
never set, e.g. `n.lastHeartbeat == 0` meaning "this node has never heartbeated",
`lastAccrual == 0`, `faucetClaims[msg.sender] < MAX_FAUCET_CLAIMS`. None guards a
balance, a price or a timestamp comparison that an attacker can influence. Reviewed
individually and dismissed.

---

### F-8 — Informational, accepted: writes and events after token transfers

Slither reports `reentrancy-events` (11) and `reentrancy-benign` (2). Both describe
state or logs written after `token.transfer` / `token.transferFrom`. `OMCTestToken`
has no hooks, no callbacks and no `receive`, so no external code executes during a
transfer. The two that matter — `heartbeat()` and `slashOverdue()` — were reordered
under F-2. `fundRewards()` (`rewardLiquidity += amount` after `transferFrom`) is
benign: a re-entrant call would move the same amount twice, which the token's
balance check makes impossible.

---

### F-9 — Informational, false positive: `unused-return` on `nodeSummary`

Slither reports that `isEligible()` and `providerStanding()` ignore most of the
13-field tuple returned by `OMCStaking.nodeSummary()`. The fields that are ignored
are ignored with `None` placeholders, and the five that are read are the right five.
The interface declaration in `OMCComputeMarket.sol` was checked field by field against
the implementation in `OMCStaking.sol`: 13 fields, same names, same order, same
types. Asset:

```
uint8 tier, bool registered, bool earning, bool overdue, uint256 stake,
uint256 pending, uint256 minStake, uint256 lastHeartbeat, uint256 deadline,
uint256 missedHeartbeats, uint256 slashedTotal, uint256 workUnits, uint256 registeredAt
```

---

### F-10 — Informational, accepted: local shadowing

`nodeSummary()` returns a value named `stake`, which shadows the `stake()` function.
Cosmetic; renaming it would change nothing but would touch every caller of the
13-field tuple. Accepted.

---

### F-11 — Open: the deployed testnet code still contains F-1

The fixes in this review are in the repository, not on chain. The three BSC testnet
addresses in §1 continue to run the pre-fix bytecode, recorded in
`contracts/security/bytecode-report.json`.

Remediation requires redeploying `OMCStaking` and `OMCComputeMarket`, updating the
addresses across the site and the deployment record, and re-registering the testnet
node. Because `OMCComputeMarket` stores `staking` as an immutable, a change to
`OMCStaking` always cascades to the market, so both must be redeployed together.

Two ways to close this out:

- **Redeploy on testnet** (~2 transactions, a fraction of a tBNB of gas, plus the
  address updates in `contracts/deployments/bsc-testnet.json`, `website/` and the
  node config). Recommended if the live demo is going to be exercised by anyone
  reviewing the project.
- **Carry the fix into mainnet preparation** and leave the testnet as an annotated
  known-issue deployment. Acceptable only if nobody will exercise the failure path
  on testnet, and it must be stated on the site rather than left implicit.

---

## 5. Property-based testing

Two harnesses, deliberately:

### 5.1 Foundry suite — `contracts/test/` (compile-verified, not executed here)

`TokenProps.t.sol`, `StakingProps.t.sol`, `MarketProps.t.sol`, with a minimal
cheatcode interface in `Vm.sol` (forge-std is not vendored, so the suite has no
submodules). Compiles clean under `solc 0.8.26` with the production settings. Run
with `forge test -vv` in `contracts/`.

Notable properties pinned there:

- the implied APR can never exceed the published `maxAprBps`, for any stake size and
  any dial setting;
- the emission rate never exceeds the 10-year schedule, and the schedule takes over
  automatically past the crossover;
- cancel / settle move exactly the escrow and leave nothing stranded;
- the penalty applied to a bond matches the §7.5 table exactly;
- a registered node cannot unstake below its tier minimum.

### 5.2 `anvil` + `web3.py` — `contracts/security/fuzz_props.py` (executed)

Because `forge test` cannot run on this machine, the four highest-value properties
were re-implemented against a real EVM (a local `anvil` node) and actually executed.
The harness reads committed build snapshots, so it needs no compiler.

| Run | Build under test | Properties | Result |
|---|---|---|---|
| A | `pre-fix-snapshot/` — **matches the deployed bytecode** | P1 APR ceiling, P2 escrow conservation | PASS (1,201 assertions) |
| A | `pre-fix-snapshot/` | P3 penalty table + bond-funded refund | **FAIL — `fail()` reverts** |
| A | `pre-fix-snapshot/` | P4 escrow isolation | **FAIL — `fail()` reverts** |
| B | `build-snapshot/` — the reviewed, fixed source | P1, P2, P3, P4 | **PASS — 2,521 assertions, 0 violations** |

Run B detail (`--iterations 120`, seed 20261011):

```
P1  published APR ceiling
  P1 exercised both branches: apr-bound 30, schedule-bound 90
P2  escrow conservation on settlement
P3  section 7.5 penalty table, paid from the bond
P4  escrow isolation between concurrent jobs

2521 assertions checked over generated cases
PASS -- no property violations found
```

The four properties:

- **P1** — over random stake sizes (20 to 5,000,000 OMC) and every dial setting from
  1 to 10,000 bps: `effectiveEmissionPerSecond() * SECONDS_PER_YEAR * BPS / totalStake
  <= maxAprBps`, and the rate never exceeds the schedule. Both branches of
  `emissionConstraint()` were exercised.
- **P2** — over random escrows and settle amounts, both fee paths: after settlement the
  market's token balance returns to exactly zero, `totalEscrowed()` returns to zero,
  and the fee equals the published 3% (or 2.7% when paid in OMC).
- **P3** — over random bonds (20 to 500,000 OMC) and all four failure reasons: exactly
  `bond * penalty_bps / 10000` leaves the bond and no more, the bond afterwards equals
  `bond - penalty`, the slashed provider stops earning, the job ends `REFUNDED`, the
  market holds nothing, and the requester's net gain equals 50% of the slash.
- **P4** — with two jobs open at once, failing one must leave the other's escrow intact
  to the wei, must leave `totalEscrowed()` reporting exactly that escrow, and must leave
  the second job refundable. This is the "the refund comes from the bond, not from other
  people's escrow" promise stated as an executable property.

P3 and P4 both fail against the pre-fix build and both pass against the fixed one; they
are the regression tests for F-1.

---

## 6. Residual risk

- **No independent review.** A first-tier audit of a contract this size starts around
  $3,000–$7,000 (CertiK's simplest tier) and a time-boxed senior review around
  $500–$5,000. Budget permitting, the market and staking contracts should be audited
  before they hold value on mainnet.
- **No formal verification.** Arithmetic safety rests on Solidity 0.8 checked math
  plus the property tests in §5, not on a proof.
- **Trusted roles remain trusted.** `owner` can retune emission, the APR ceiling,
  heartbeat parameters and the tier ladder; `scheduler` can assign, settle and fail
  jobs; `verifier` can attest work. The contracts document this openly, and the
  deployment keeps owner and scheduler on the deployer address, which is not a
  multisig. That is acceptable for testnet and must change for mainnet.
- **The APR ceiling is a rate limit, not a solvency guarantee.** Rewards can only be
  paid from `rewardLiquidity`, which `fundRewards()` tops up; the property test in
  §5.2 checks that the contract always covers staked principal, not that the reward
  pool is funded.
- **Off-chain components unreviewed.** The scheduler and node worker are the only
  thing standing between an arbitrary job and a slashing call.
- **`OMCStaking.queue`-free design has a known operational trap.** A node that goes
  dark cannot unstake until it heartbeats; `slashOverdue()` is permissionless so
  anyone can settle the debt, but the node still has to heartbeat to resume earning.
  Documented on the `/compute` page and asserted in the test suite.

---

## 7. How to reproduce

```bash
# artifact + evidence snapshots are committed; no compiler needed for the harness
cd contracts/security
python fuzz_props.py                 # P1+P2+P3 against the reviewed build
python fuzz_props.py --artifacts pre-fix-snapshot --only p3   # reproduces F-1
python verify_live_bytecode.py       # compares the chain against both builds

# rebuild artifacts from source
cd .. && NODE_PATH=<node_modules> node tools/compile.js

# the primary suite (needs Foundry and, on Windows, a machine where forge can spawn solc)
cd .. && forge test -vv
```

Static analysis:

```bash
solhint OMCTestToken.sol OMCStaking.sol OMCComputeMarket.sol
slither . --compile-force-framework solc --solc-args "--optimize --via-ir"
```

`contracts/security/slither-summary-*.json` and `solhint-summary-*.json` hold the
triaged output of those two commands, before and after the fixes.
