# Security review — OMC testnet contracts

**Scope:** `OMCTestToken.sol`, `OMCStaking.sol`, `OMCComputeMarket.sol` (1,573 lines as
reviewed; 1,619 after the fixes) and the BSC testnet deployments listed below.
**Date of review:** 2026-10-11 (two passes the same day: F-1…F-11, then F-12…F-14)
**Reviewer:** the OMC team (self-review), using free tooling only.
**Status:** 1 High-severity defect and 2 further defects found and fixed. **Both passes
are deployed** — the addresses below run the reviewed bytecode, verified against the
chain by `contracts/security/verify_live_bytecode.py` (see §3).

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
| `contracts/OMCStaking.sol` | 743 → 769 | `0xa70B8506a1a614Fd83D0C70d73Da1E21fdcf1fB6` |
| `contracts/OMCComputeMarket.sol` | 634 → 654 | `0x7664f1e73c2CBCbaFE636a653C173378C369C40A` |

Build configuration under review: `solc 0.8.26`, `optimizer: enabled, runs: 200`,
`viaIR: true`, `evmVersion: paris` (`contracts/tools/compile.js`).

The staking and market addresses above are the **post-fix** deployments. The earlier
deployments are kept in `contracts/deployments/bsc-testnet.json` under the `prev*` keys
(`prevStaking`, `prevStaking4`, `prevMarket`, `prevMarket4`) so the bytecode of every
revision that was ever live can still be located on chain. That record — not this
table — is the source of truth; `verify_live_bytecode.py` reads it rather than holding
its own copy of the addresses. An earlier revision of that script hard-coded them, and
a redeploy turned its output into a comparison of the old chain code against the new
build: a confidently wrong answer that read as "the fix is not deployed" when it was.
The script now fails loudly on a stale deployment instead (`STALE DEPLOYMENT …`).

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
| **Property-based tests**, `anvil` + `web3.py` | Foundry 1.8.5 / web3.py 7.x | 5 properties, 2,762 assertions over randomised inputs against the current build; 241 violations against the previous one — see §5 |
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
testnet and compares it with the local builds. It answers three separate questions:
does the reviewed build reproduce the deployed code; if not, does it reproduce it with
the immutable slots masked out; and if neither, which *older* snapshot is on chain.
The third question is the one that catches a fix that was committed but not deployed.
The addresses come from `contracts/deployments/bsc-testnet.json`.

Result at block 136,138,468 — see `contracts/security/bytecode-report.json`:

| Contract | live | reviewed | verdict |
|---|---|---|---|
| `OMCTestToken` | 3,474 B | 3,474 B | **byte-for-byte identical** |
| `OMCStaking` | 13,092 B | 13,092 B | reviewed build, differing only at 66 zero-filled immutable regions |
| `OMCComputeMarket` | 11,853 B | 11,853 B | reviewed build, differing only at 85 zero-filled immutable regions |

`tOMC` has no immutables, so its build must reproduce the deployed runtime exactly —
it does, and it matches all three snapshots identically (the contract was never
touched by either pass). That is the control which shows the toolchain
(solc 0.8.26, optimizer 200, viaIR, evmVersion paris) is faithful.
`OMCStaking` and `OMCComputeMarket` declare immutables (`token`; `token` and
`staking`), which are patched into the runtime code at construction time and read as
zeroes in a compiled artifact. Masking those regions, the reviewed build matches the
chain exactly. **The code analysed in this document is therefore the code that is
running.**

Three snapshots are kept, one per source revision that has been deployed:

| Snapshot | Source state | Live address it matches |
|---|---|---|
| `pre-fix-snapshot/` | as deployed, before F-1 was fixed | none — superseded |
| `pre-f5-snapshot/` | F-1 fixed, before F-12 was fixed | none — superseded |
| `build-snapshot/` | the current tree | the addresses in §1 |

The middle one exists because this exact trap was sprung once: after F-1 was fixed in
source, the check still reported `deployed code == pre-fix build`. It was right, and
that was the point — a green-looking repository with a stale chain. The snapshots make
the difference between "the fix is written" and "the fix is live" mechanically
checkable instead of a matter of memory.

Byte sizes per revision, for cross-checking against `bytecode-report.json`:

| Contract | pre-fix | pre-F-12 | live (current) |
|---|---|---|---|
| `OMCTestToken` | 3,474 B | 3,474 B | 3,474 B |
| `OMCStaking` | 13,035 B | 12,996 B | 13,092 B |
| `OMCComputeMarket` | 11,774 B | 11,329 B | 11,853 B |

---

## 4. Findings

| # | Severity | Contract | Title | State |
|---|---|---|---|---|
| F-1 | **High** | `OMCComputeMarket` | `fail()` double-applies the slashing split and always reverts | **Fixed and deployed** |
| F-2 | Low | `OMCStaking` | `heartbeat()` / `slashOverdue()` update state after an external call | Fixed and deployed |
| F-3 | Low | `OMCStaking` | Dead-code `require` in `unstake()` | Fixed and deployed |
| F-4 | Informational | `OMCStaking` | Local `bps` relied on implicit zero-initialisation | Fixed and deployed |
| F-5 | Low | `OMCStaking` | `setMarket()` accepts `address(0)` | Accepted, documented |
| F-6 | Informational | both | Integer division before multiplication in the fee / slash splits | Accepted by design |
| F-7 | Informational | both | `incorrect-equality` flags on zero sentinels | False positive |
| F-8 | Informational | both | State writes and events after token transfers | Accepted (token has no hooks) |
| F-9 | Informational | `OMCComputeMarket` | `unused-return` on the `nodeSummary` tuple | False positive; tuple verified |
| F-10 | Informational | `OMCStaking` | `nodeSummary`'s `stake` return shadows `stake()` | Accepted, cosmetic |
| F-11 | — | — | The live testnet still runs the pre-fix bytecode | **Resolved** — see §3 |
| F-12 | Low | `OMCStaking`, `OMCComputeMarket` | Slashing / fee "burns" only moved tokens to a dead address, so `totalSupply()` never fell | **Fixed and deployed** |
| F-13 | Informational | docs | The whitepaper promised a market buy-back the contracts never performed | Docs corrected |
| F-14 | Low | off-chain | The node worker's heartbeat check ignored the `earning` flag, so a slashed node went permanently silent while logging green | Fixed in the worker |

**A note on the numbering.** F-12 and F-13 are the second pass. An interim report
circulated on the same day used "F-5" and "F-6" for these two — the burn semantics and
the buy-back wording — which collide with the F-5 and F-6 already used above for
`setMarket()` and division ordering. Those interim labels are retired; this table is
the only numbering. If a pasted "F-5" mentions `burn()` or the whitepaper, it means
F-12 or F-13.

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
2. **The deployed failure path, exercised end to end on chain.** With the fix live,
   job #2 of the rehearsal ran `createJob → assign → confirmDelivery → fail` and ended
   `REFUNDED`, with the requester made whole out of the bond and the provider slashed
   6.0 tOMC. Transaction hashes are in `p1-service/evidence/`. This is the same defect
   P3 and P4 pin in a controlled environment, confirmed on the real chain.
3. Property-based test, run against the **pre-fix build**
   (`security/fuzz_props.py --artifacts pre-fix-snapshot --only p3`):

   ```
   P3#0: fail() is unusable -- reverted: tOMC: balance
         (reason=2, penalty 3000 bps, bond=299675 OMC, escrow=739.882 OMC)
   ```

4. Escrow-isolation property (P4), pre-fix build — the market is holding two
   escrows and neither call can even be made:

   ```
   P4#0: fail() is unusable -- reverted: tOMC: balance
   ```

5. Deterministic reproduction at bond 1,000 OMC / escrow 1,000 OMC: for each
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

The `token.transfer(BURN_ADDRESS, burned)` line quoted above from the pre-fix source
was itself replaced in the second pass: the burn slice is now destroyed outright
rather than parked at a dead address. See F-12.

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

### F-11 — Resolved: the deployed testnet code was stale

The fixes from the first pass sat in the repository for several hours before they were
on chain. The addresses originally listed in §1 ran the pre-fix bytecode, and the check
at the time said so, in as many words: *deployed code == pre-fix build*. A green
repository over a stale chain is exactly the state that reads as "done".

**Closed on 2026-10-11.** `OMCStaking` and `OMCComputeMarket` were redeployed — the
market has to be redeployed with it, because its `staking` reference is immutable — the
node was re-registered, the addresses were updated across the site, the whitepaper and
the deployment record, and §3 now verifies the live runtime against the reviewed build
at block 136,138,468.

Two things worth keeping from it:

- **A source fix is not a fix.** Until the chain changes, the defect is live. The check
  now compares three snapshots and reports `STALE DEPLOYMENT` when the live code
  matches an older one, so a fixed-but-undeployed contract can no longer produce a
  report that agrees everything is well.
- **Redeploying staking strands its reward pool.** `fundRewards()` is one-way: the pool
  lives inside whichever staking contract received it and there is no owner rescue.
  Replacing staking therefore abandons whatever was funded into it — 200 tOMC on this
  testnet redeploy, unrecoverable. On testnet that is a rounding error; on mainnet it
  is the strongest argument for freezing `OMCStaking` before the public launch. The
  redeploy tool (`contracts/tools/redeploy-staking.js`) now takes an explicit
  `--amount` so the size of the new pool is a decision rather than a default.

---

### F-12 — Low: the "burn" halves of both splits never reduced the supply

**Where:** `OMCStaking.slashFor()` (`:513`) and `slashOverdue()` (`:760`) — the 20%
slice of every penalty; and `OMCComputeMarket.settle()` — the 30% slice of the protocol
fee.

**What happened.** Both splits routed their burn share with

```solidity
require(token.transfer(BURN_ADDRESS, burned), "OMCS: transfer");
```

`BURN_ADDRESS` is `0x…dEaD`. That is a transfer, not a burn. The tokens leave the
contract and land at an address nobody controls; `totalSupply()` never moves. The
published rule — that the slashing burn and the fee burn reduce the supply — was
therefore not true of the deployed code. Both the whitepaper and `/tokenomics` state it
plainly, and the site's own supply display would have contradicted the contract the
moment anyone checked.

The second-order effect runs the other way and is the reason this was a real decision
rather than a one-line tidy-up. A true burn lowers `totalSupply()`, which means the
destroyed amount becomes mintable again later: `OMCTestToken._mint()` only enforces
`totalSupply + amount <= MAX_SUPPLY`. Burning to a dead address is irreversible by
construction — those tokens can never re-enter circulation, and the supply ceiling
stays permanently consumed. Neither is unconditionally better; the question is which
one the published economics describe. They describe a burn, so the code now burns.

**Fix applied.** `IERC20Like` gained `burn(uint256)` in both contracts; the two staking
call sites and the market's fee path now call `token.burn(amount)`.
`OMCComputeMarket` keeps the configurable `feeBurn` sink: when it is the dead address
the fee is burned, otherwise it is transferred to the configured address, so a future
decision to route the slice elsewhere does not need a code change.

**Evidence — live, on chain.** The failure path was exercised end to end against the
current deployment, on job #2 of the rehearsal, which incidentally re-proves F-1:

```
job #2 final state = REFUNDED
provider stake 20.0 -> 14.0   slashed 6.0 tOMC
token totalSupply 10000019.9595 -> 10000018.7595   burned 1.2 tOMC
slash split on 6.0 tOMC slashed: requester 3.0 / treasury 1.8 / burned 1.2
```

1.2 is exactly 20% of 6.0. The fee path burned a further 0.0405 (30% of the 0.135 fee
on the settlement that followed). `p1-service/audit-supply.js` checks the invariant
directly: `totalSupply()` fell by the amount burned, and `balanceOf(0x…dEaD)` did
**not** grow. The 3.4425 tOMC sitting at the dead address is the historical residue of
the pre-fix deployments and will never move again — now a permanent, visible artefact
of the defect rather than the live mechanism.

**Evidence — regression property.** P5 in `security/fuzz_props.py` states the rule as
an executable claim. Against `pre-f5-snapshot/` it fails every single time — 241
assertions, 241 violations — and against the current build it passes:

```bash
python fuzz_props.py --artifacts pre-f5-snapshot --only p5   # 241/241 violate
python fuzz_props.py --only p5                               # PASS
```

---

### F-13 — Informational: the whitepaper promised a buy-back the code never performed

The whitepaper said a share of every fee "is used to buy back OMC on the market and
burn it automatically through smart contracts". No contract has ever contained a market
purchase. Jobs are escrowed and settled in OMC, so the fee is already denominated in
the token; settlement destroys its share directly. The sentence described a mechanism
that did not exist and, given that the fee arrives in OMC, was never needed.

**Docs corrected.** The affected passages now say the share is burned at settlement and
state explicitly that no market purchase is involved: four places in
`wp-v3/OMC-Whitepaper-v3.0-EN.md`, one deck table row in `wp-v3/build_deck.py`, and
seven strings across the site including both `en` and `zh` tokenomics copy. The PDF and
the deck were rebuilt and re-verified (whitepaper 20 pages, deck 13 pages, zero
remaining occurrences of the buy-back wording).

Worth recording for its shape rather than its size: the code was reviewed and the
documents were not, and the documents were the thing making the promise. A sentence can
be the defect.

---

### F-14 — Low (off-chain): a slashed node went silent while the log stayed green

**Where:** the node worker's heartbeat decision —
`ai-tools-service/p1-service/node-worker.js`.

`OMCStaking.isEligible()` folds five conditions into one boolean: registered, earning,
not overdue, stake at or above the tier minimum, tier at least 1. The worker decided
whether to heartbeat by looking at the deadline alone. After `slashFor()` sets
`n.earning = false`, only a real `heartbeat()` restores it
(`if (!n.earning && n.stake > 0) n.earning = true`). A node that had been slashed
therefore dropped out of the dispatch set permanently — every assignment would revert —
while its operator watched a log line reading `heartbeat ok, N min left`.

One 30% BAD_OUTPUT penalty is enough to trigger it: a 20 tOMC bond falls to 14, below
the T1 minimum of 20, and the node can no longer be assigned any work at all.

**Fixed in the worker.** The heartbeat decision now reads `earning` as well and logs the
reason when it is false. `bootstrap-node.js` tops a node up by the **shortfall** rather
than a fixed amount, so recovery does not overshoot the tier. The contract is unchanged
and was always correct — `isEligible()` gave the right answer to the question asked; the
caller was reading one field of a five-field answer.

Filed here rather than with the contract findings because it is an integration defect.
The contracts never promised anything about the worker's log output, which is precisely
why nobody was watching for it.

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

P5 — the burn slice actually destroys tokens — is **not** in this suite. It was written
after the suite was frozen, in the second pass. Porting it to `MarketProps.t.sol` is the
obvious next step; until then `forge test` does not cover F-12.

### 5.2 `anvil` + `web3.py` — `contracts/security/fuzz_props.py` (executed)

Because `forge test` cannot run on this machine, the five highest-value properties
were re-implemented against a real EVM (a local `anvil` node) and actually executed.
The harness reads committed build snapshots, so it needs no compiler. Every snapshot
is exercised, not just the current one: a property that only ever passes is not
evidence of anything.

| Run | Build under test | Properties | Result |
|---|---|---|---|
| A | `pre-fix-snapshot/` — the revision first deployed | P1 APR ceiling, P2 escrow conservation | PASS (1,201 assertions) |
| A | `pre-fix-snapshot/` | P3 penalty table + bond-funded refund | **FAIL — `fail()` reverts** |
| A | `pre-fix-snapshot/` | P4 escrow isolation | **FAIL — `fail()` reverts** |
| B | `pre-f5-snapshot/` — F-1 fixed, F-12 not yet | P1, P2 | PASS (1,201 assertions) |
| B | `pre-f5-snapshot/` | P3, P4 | PASS (1,320 assertions) |
| B | `pre-f5-snapshot/` | P5 the penalty burn destroys the tokens | **FAIL — 241 assertions, 241 violations** |
| C | `build-snapshot/` — the current tree, which is what §3 finds live | P1, P2, P3, P4, P5 | **PASS — 2,762 assertions, 0 violations** |

Run C detail (`--iterations 120`, seed 20261011):

```
P1  published APR ceiling
  P1 exercised both branches: apr-bound 30, schedule-bound 90
P2  escrow conservation on settlement
P3  section 7.5 penalty table, paid from the bond
P4  escrow isolation between concurrent jobs
P5  the penalty burn destroys the tokens

2762 assertions checked over generated cases
PASS -- no property violations found
```

Run B's failure, in full — every iteration fails, on both counts:

```
P5#0: totalSupply fell by 0 wei, expected exactly the burn slice 17980518276834975460824
      (reason=2, penalty 3000 bps, slashed=89902591384174877304115)
P5#0: the burn slice was moved to the dead address instead of being destroyed
      (+17980518276834975460824 wei)
...
241 assertions checked over generated cases
FAILED: 241 property violation(s)
```

The five properties:

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
- **P5** — over random bonds and all four failure reasons: `totalSupply()` falls by
  exactly the burn slice (`slashed - 50% - 30%`) and the dead address receives nothing.
  The dead address is named as a literal in the harness rather than read from the
  artifact, so a build cannot move the constant and still pass.

P3 and P4 fail against the pre-fix build and pass against the fixed one; they are the
regression tests for F-1. P5 fails against the pre-F-12 build and passes against the
current one; it is the regression test for F-12. In both cases the property was written
from the published rule, not from the code — which is why it was able to disagree with
the code.

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
- **Burning reduces supply, which reopens mint headroom.** `OMCTestToken._mint()`
  enforces `totalSupply + amount <= MAX_SUPPLY` (1,000,000,000 tOMC), so a burned token
  can later be minted again — the ceiling applies to the supply in existence, not to
  cumulative issuance. That is a property of the token rather than of the burn, and it
  is worth stating explicitly because "burn reduces supply" is easy to read as "the burn
  is permanent". It is not. Circulation today is 10,000,000 tOMC, 1% of the cap.
- **A redeploy of `OMCStaking` strands its reward pool.** `fundRewards()` is one-way
  and there is no owner rescue, so the pool is lost with the contract. On mainnet this
  means `OMCStaking` must be frozen before public launch, or the funding must be
  re-added. Testnet redeploys on 2026-10-11 abandoned 200 tOMC this way.

---

## 7. How to reproduce

```bash
# artifact + evidence snapshots are committed; no compiler needed for the harness
cd contracts/security
python fuzz_props.py                 # P1-P5 against the reviewed build
python fuzz_props.py --artifacts pre-fix-snapshot --only p3   # reproduces F-1
python fuzz_props.py --artifacts pre-f5-snapshot --only p5    # reproduces F-12
python verify_live_bytecode.py       # chain vs the reviewed build, and vs every
                                     # snapshot; STALE DEPLOYMENT if the chain lags

# rebuild artifacts from source
cd .. && NODE_PATH=<node_modules> node tools/compile.js
cp artifacts/{OMCTestToken,OMCStaking,OMCComputeMarket}.json security/build-snapshot/

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
