#!/usr/bin/env python3
"""
Property-based / fuzz harness for the OMC testnet contracts.

Why this file exists next to the Foundry suite
----------------------------------------------
`contracts/test/*.t.sol` is the primary harness and is what a reviewer should
run (`forge test`). That suite could not be executed on the machine this review
was carried out on, because Foundry cannot spawn `solc` there (Windows returns
`os error 231`, "all pipe instances are busy", from process creation). So this
script re-runs the three highest-value properties against a real EVM (a local
`anvil` node) with randomised inputs, using nothing but `web3.py`.

It is deliberately standalone: it reads the committed build artifacts in
`contracts/artifacts/*.json`, so it needs no compiler and no Foundry.

Properties checked
------------------
  P1  the published APR ceiling
      implied_apr_bps = effectiveEmissionPerSecond * SECONDS_PER_YEAR * BPS
                        / totalStake
      must never exceed maxAprBps, for any stake size and any dial setting.

  P2  escrow conservation in the market
      on settlement the market must pass the whole escrow straight through:
      its token balance returns to exactly zero and the outflow equals maxPrice.

  P3  section 7.5 penalty table + bond-funded compensation
      stakeAfter == stakeBefore - stakeBefore * penalty_bps / 10000, and the
      requester's net gain equals 50% of the slashed amount.

  P4  escrow isolation between concurrent jobs
      failing one job must leave another open job's escrow intact to the wei.

  P5  the penalty burn destroys the tokens (F-12)
      totalSupply() must fall by exactly the 20% burn slice, and the dead
      address must not receive a single wei. A transfer to 0x…dEaD moves tokens
      without reducing supply, which is what the deployed revision used to do.
      Run this against `pre-f5-snapshot/` to reproduce F-12.

Usage
-----
    python fuzz_props.py [--iterations 120] [--port 8547] [--seed 20261011]

Requires `anvil` on PATH (or --anvil pointing at it) and web3.py.
Exit code 0 = every property held for every generated input.
"""

from __future__ import annotations

import argparse
import json
import os
import random
import shutil
import subprocess
import sys
import time
from pathlib import Path

try:
    from web3 import Web3
except ImportError:  # pragma: no cover
    sys.exit("web3.py is required: pip install web3")

BPS = 10_000
SECONDS_PER_YEAR = 365 * 24 * 3600
E18 = 10**18

ARTIFACTS = Path(__file__).resolve().parent.parent / "artifacts"

FAILURES: list[str] = []
CHECKS = 0


def check(condition: bool, message: str) -> None:
    global CHECKS
    CHECKS += 1
    if not condition:
        FAILURES.append(message)


def resolve_artifacts(explicit: str | None) -> Path:
    """Prefer the local build output; fall back to the committed snapshot so the
    harness runs from a fresh clone with no compiler installed."""
    if explicit:
        path = Path(explicit)
        if not path.is_dir():
            raise SystemExit(f"--artifacts {explicit} is not a directory")
        return path
    built = Path(__file__).resolve().parent.parent / "artifacts"
    if built.is_dir() and any(built.glob("*.json")):
        return built
    return Path(__file__).resolve().parent / "build-snapshot"


def artifact(name: str) -> dict:
    with open(ARTIFACTS / f"{name}.json", encoding="utf-8") as fh:
        return json.load(fh)


def find_anvil(explicit: str | None) -> str:
    if explicit:
        return explicit
    found = shutil.which("anvil")
    if found:
        return found
    guess = Path.home() / ".workbuddy" / "binaries" / "foundry" / "anvil.exe"
    if guess.exists():
        return str(guess)
    raise SystemExit("anvil not found; pass --anvil /path/to/anvil")


def start_anvil(binary: str, port: int) -> subprocess.Popen:
    proc = subprocess.Popen(
        [binary, "--port", str(port), "--silent", "--gas-limit", "60000000"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        stdin=subprocess.DEVNULL,
    )
    url = f"http://127.0.0.1:{port}"
    w3 = Web3(Web3.HTTPProvider(url, request_kwargs={"timeout": 30}))
    for _ in range(120):
        try:
            if w3.is_connected():
                return proc
        except Exception:
            pass
        time.sleep(0.25)
    proc.terminate()
    raise SystemExit("anvil did not come up")


class Chain:
    def __init__(self, w3: Web3):
        self.w3 = w3
        self.accounts = [Web3.to_checksum_address(a) for a in w3.eth.accounts]

    def send(self, fn, sender: str, value: int = 0):
        tx = fn.transact({"from": sender, "value": value})
        return self.w3.eth.wait_for_transaction_receipt(tx, timeout=60)

    def try_send(self, fn, sender: str, value: int = 0):
        """Send a transaction that is allowed to revert.

        Returns (receipt_or_None, error_string_or_None) so a property can report
        "this call reverts" as a violation instead of crashing the harness.
        """
        try:
            return self.send(fn, sender, value), None
        except Exception as exc:  # ContractLogicError, TimeExhausted, ...
            text = str(exc)
            if "reverted" in text:
                reason = text.split("reverted:")[-1].split("'")[0].strip()
                return None, f"reverted: {reason}" if reason else "reverted"
            raise

    def deploy(self, name: str, args: list):
        spec = artifact(name)
        bytecode = spec["bytecode"]
        if not bytecode.startswith("0x"):
            bytecode = "0x" + bytecode
        factory = self.w3.eth.contract(abi=spec["abi"], bytecode=bytecode)
        rcpt = self.send(factory.constructor(*args), self.accounts[0])
        return self.w3.eth.contract(address=rcpt.contractAddress, abi=spec["abi"])


# --------------------------------------------------------------------------- #
# P1 -- the published APR ceiling                                             #
# --------------------------------------------------------------------------- #


def property_apr_ceiling(chain: Chain, token, staking, iters: int, rng: random.Random) -> None:
    node = chain.accounts[1]
    chain.send(token.functions.approve(staking.address, 2**256 - 1), node)
    seen_capped_by_apr = 0
    seen_capped_by_schedule = 0

    for i in range(iters):
        stake_amt = rng.randint(20 * E18, 5_000_000 * E18)
        apr_bps = rng.randint(1, 10_000)

        chain.send(staking.functions.setMaxAprBps(apr_bps), chain.accounts[0])
        chain.send(staking.functions.stake(stake_amt, 1), node)
        chain.send(staking.functions.registerNode(1, "http://node.local"), node)

        total_stake = staking.functions.totalStake().call()
        check(total_stake == stake_amt, f"P1#{i}: totalStake {total_stake} != {stake_amt}")

        rate = staking.functions.effectiveEmissionPerSecond().call()
        schedule = staking.functions.emissionPerSecond().call()
        _, capped_by = staking.functions.emissionConstraint().call()

        if capped_by == "apr":
            seen_capped_by_apr += 1
        else:
            seen_capped_by_schedule += 1

        implied_bps = (rate * SECONDS_PER_YEAR * BPS) // total_stake
        check(
            implied_bps <= apr_bps,
            f"P1#{i}: implied APR {implied_bps} bps exceeds published ceiling "
            f"{apr_bps} bps (stake={stake_amt}, rate={rate})",
        )
        check(
            rate <= schedule,
            f"P1#{i}: effective rate {rate} exceeds the published schedule {schedule}",
        )
        check(
            capped_by in ("apr", "schedule"),
            f"P1#{i}: unexpected binding constraint {capped_by!r}",
        )

        # full exit so the next iteration starts from a clean slate
        chain.send(staking.functions.deregister(), node)
        chain.send(staking.functions.unstake(stake_amt), node)

    print(f"  P1 exercised both branches: apr-bound {seen_capped_by_apr}, "
          f"schedule-bound {seen_capped_by_schedule}")


# --------------------------------------------------------------------------- #
# P2 -- escrow conservation on settlement                                     #
# --------------------------------------------------------------------------- #


def property_escrow_conservation(chain: Chain, token, staking, market, iters: int, rng) -> None:
    owner, provider, requester = chain.accounts[0], chain.accounts[1], chain.accounts[2]

    chain.send(token.functions.approve(staking.address, 2**256 - 1), provider)
    chain.send(token.functions.approve(market.address, 2**256 - 1), requester)
    chain.send(token.functions.approve(market.address, 2**256 - 1), provider)

    chain.send(staking.functions.stake(1_000_000 * E18, 1), provider)
    chain.send(staking.functions.registerNode(1, "http://node.local"), provider)
    check(
        market.functions.isEligible(provider, 1).call(),
        "P2 setup: provider is not eligible after staking tier 1",
    )

    for i in range(iters):
        max_price = rng.randint(1 * E18, 10_000 * E18)
        amount = rng.randint(1, max_price)
        paid_in_omc = rng.random() < 0.5
        deadline = chain.w3.eth.get_block("latest").timestamp + 3600

        chain.send(
            market.functions.createJob(
                b"\x11" * 32, 1, 0, 0, max_price, deadline, paid_in_omc
            ),
            requester,
        )
        job_id = market.functions.jobCount().call()

        held = token.functions.balanceOf(market.address).call()
        check(held == max_price, f"P2#{i}: market holds {held}, expected {max_price}")

        chain.send(market.functions.assign(job_id, provider), owner)
        chain.send(market.functions.confirmDelivery(job_id, b"\x22" * 32), owner)
        chain.send(market.functions.settle(job_id, amount), owner)

        after = token.functions.balanceOf(market.address).call()
        check(after == 0, f"P2#{i}: {after} wei stranded in the market after settle")

        job = market.functions.job(job_id).call()
        state, paid, fee_paid = job[5], job[7], job[8]
        check(state == 4, f"P2#{i}: job state {state}, expected SETTLED(4)")
        check(paid == amount, f"P2#{i}: paid {paid} != requested settle amount {amount}")
        expected_fee = amount * 300 // BPS
        if paid_in_omc:
            expected_fee -= expected_fee * 1_000 // BPS
        check(
            fee_paid == expected_fee,
            f"P2#{i}: fee {fee_paid} != published rate {expected_fee} "
            f"(paidInOMC={paid_in_omc})",
        )
        check(market.functions.totalEscrowed().call() == 0, f"P2#{i}: totalEscrowed not cleared")


# --------------------------------------------------------------------------- #
# P3 -- the section 7.5 penalty table, paid out of the bond                   #
# --------------------------------------------------------------------------- #

PENALTY_BPS = [200, 500, 3_000, 10_000]


def property_penalty_table(chain: Chain, token, staking, market, iters: int, rng) -> None:
    owner, requester, provider = chain.accounts[0], chain.accounts[2], chain.accounts[3]

    chain.send(token.functions.approve(staking.address, 2**256 - 1), provider)
    chain.send(token.functions.approve(market.address, 2**256 - 1), provider)
    chain.send(token.functions.approve(market.address, 2**256 - 1), requester)

    for i in range(iters):
        stake_amt = rng.randint(20 * E18, 500_000 * E18)
        reason = rng.randrange(4)
        max_price = rng.randint(1 * E18, 10_000 * E18)
        deadline = chain.w3.eth.get_block("latest").timestamp + 3600

        chain.send(staking.functions.stake(stake_amt, 1), provider)
        chain.send(staking.functions.registerNode(1, "http://node.local"), provider)

        # a provider keeps whatever survived the previous round, so the bond under
        # test is what the contract says it is, not what this iteration staked
        bond = staking.functions.node(provider).call()[3]

        before = token.functions.balanceOf(requester).call()
        chain.send(
            market.functions.createJob(b"\x33" * 32, 1, 0, 0, max_price, deadline, False),
            requester,
        )
        job_id = market.functions.jobCount().call()
        chain.send(market.functions.assign(job_id, provider), owner)

        staking_before = token.functions.balanceOf(staking.address).call()
        _, err = chain.try_send(market.functions.fail(job_id, reason), owner)
        if err is not None:
            # the failure/refund path is the headline feature of the market: if
            # it cannot execute, that is a finding, not a test error
            check(
                False,
                f"P3#{i}: fail() is unusable -- {err} "
                f"(reason={reason}, penalty {PENALTY_BPS[reason]} bps, "
                f"bond={bond / E18:g} OMC, escrow={max_price / E18:g} OMC)",
            )
            break

        slashed = bond * PENALTY_BPS[reason] // BPS
        check(
            token.functions.balanceOf(requester).call() == before + slashed * 5_000 // BPS,
            f"P3#{i}: requester was not made whole out of the bond "
            f"(reason={reason}, slashed={slashed})",
        )
        check(
            token.functions.balanceOf(market.address).call() == 0,
            f"P3#{i}: tokens stranded in the market after fail()",
        )
        check(
            market.functions.totalEscrowed().call() == 0,
            f"P3#{i}: totalEscrowed not cleared after fail()",
        )
        # exactly the slashed amount must leave the bond: no more (which would
        # raid other requesters' escrow) and no less (which would leave the
        # published split unpaid)
        check(
            staking_before - token.functions.balanceOf(staking.address).call() == slashed,
            f"P3#{i}: bond moved "
            f"{staking_before - token.functions.balanceOf(staking.address).call()} wei, "
            f"expected exactly {slashed}",
        )

        node = staking.functions.node(provider).call()
        left, earning = node[3], node[2]
        check(
            left == bond - slashed,
            f"P3#{i}: bond {left}, expected {bond - slashed} "
            f"(reason={reason}, penalty {PENALTY_BPS[reason]} bps)",
        )
        check(not earning, f"P3#{i}: a slashed provider is still earning")

        job = market.functions.job(job_id).call()
        check(job[5] == 6, f"P3#{i}: job state {job[5]}, expected REFUNDED(6)")


# --------------------------------------------------------------------------- #
# P4 -- escrow isolation: one job's failure must not reach another's escrow   #
# --------------------------------------------------------------------------- #


def property_escrow_isolation(chain: Chain, token, staking, market, iters: int, rng) -> None:
    owner, requester, provider = chain.accounts[0], chain.accounts[2], chain.accounts[3]

    chain.send(token.functions.approve(staking.address, 2**256 - 1), provider)
    chain.send(token.functions.approve(market.address, 2**256 - 1), provider)
    chain.send(token.functions.approve(market.address, 2**256 - 1), requester)

    for i in range(iters):
        reason = rng.randrange(4)
        bond_top_up = rng.randint(20 * E18, 500_000 * E18)
        escrow_failing = rng.randint(1 * E18, 10_000 * E18)
        escrow_untouched = rng.randint(1 * E18, 10_000 * E18)
        deadline = chain.w3.eth.get_block("latest").timestamp + 3600

        chain.send(staking.functions.stake(bond_top_up, 1), provider)
        chain.send(staking.functions.registerNode(1, "http://node.local"), provider)

        # two jobs open at the same time, so the market is holding two escrows
        chain.send(market.functions.createJob(
            b"\x44" * 32, 1, 0, 0, escrow_failing, deadline, False), requester)
        failing = market.functions.jobCount().call()
        chain.send(market.functions.createJob(
            b"\x55" * 32, 1, 0, 0, escrow_untouched, deadline, False), requester)
        untouched = market.functions.jobCount().call()

        assert token.functions.balanceOf(market.address).call() == escrow_failing + escrow_untouched

        chain.send(market.functions.assign(failing, provider), owner)
        _, err = chain.try_send(market.functions.fail(failing, reason), owner)
        if err is not None:
            check(False, f"P4#{i}: fail() is unusable -- {err}")
            break

        # the untouched job's escrow has to still be there, to the wei
        after = token.functions.balanceOf(market.address).call()
        check(
            after == escrow_untouched,
            f"P4#{i}: failing one job left {after} in the market, "
            f"expected {escrow_untouched} (the other job's escrow)",
        )
        check(
            market.functions.totalEscrowed().call() == escrow_untouched,
            f"P4#{i}: totalEscrowed is {market.functions.totalEscrowed().call()}, "
            f"expected {escrow_untouched}",
        )

        # and it must still be refundable
        chain.send(market.functions.cancelJob(untouched), requester)
        check(
            token.functions.balanceOf(market.address).call() == 0,
            f"P4#{i}: the untouched job could no longer be refunded",
        )
        check(
            market.functions.totalEscrowed().call() == 0,
            f"P4#{i}: totalEscrowed not cleared after cancelling the second job",
        )


# --------------------------------------------------------------------------- #
# P5 -- the burn slice of a penalty must actually burn (F-12)                  #
# --------------------------------------------------------------------------- #

# OMCStaking.BURN_ADDRESS. Kept as a literal here on purpose: the property is
# that this address must receive nothing, so reading it from the artifact under
# test would let a build move the constant and still pass.
DEAD_ADDRESS = "0x000000000000000000000000000000000000dEaD"


def property_slash_burns(chain: Chain, token, staking, market, iters: int, rng) -> None:
    """F-12: the 20% burn slice of a penalty has to destroy tokens.

    `token.transfer(0x…dEaD, burned)` empties the sender's balance and leaves
    `totalSupply()` exactly where it was, so the published rule -- that the
    slashing burn reduces supply -- is not actually enforced by the code. This
    property holds the build to the published behaviour, and checks the dead
    address separately so that a build which burns *and* also parks tokens there
    cannot slip through.
    """
    owner = chain.accounts[0]
    requester, provider = chain.accounts[2], chain.accounts[3]

    chain.send(token.functions.approve(staking.address, 2**256 - 1), provider)
    chain.send(token.functions.approve(market.address, 2**256 - 1), provider)
    chain.send(token.functions.approve(market.address, 2**256 - 1), requester)

    dead_at_start = token.functions.balanceOf(DEAD_ADDRESS).call()

    for i in range(iters):
        stake_amt = rng.randint(20 * E18, 500_000 * E18)
        reason = rng.randrange(4)
        max_price = rng.randint(1 * E18, 10_000 * E18)
        deadline = chain.w3.eth.get_block("latest").timestamp + 3600

        chain.send(staking.functions.stake(stake_amt, 1), provider)
        chain.send(staking.functions.registerNode(1, "http://node.local"), provider)
        bond = staking.functions.node(provider).call()[3]

        chain.send(
            market.functions.createJob(b"\x66" * 32, 1, 0, 0, max_price, deadline, False),
            requester,
        )
        job_id = market.functions.jobCount().call()
        chain.send(market.functions.assign(job_id, provider), owner)

        supply_before = token.functions.totalSupply().call()
        dead_before = token.functions.balanceOf(DEAD_ADDRESS).call()

        _, err = chain.try_send(market.functions.fail(job_id, reason), owner)
        if err is not None:
            check(False, f"P5#{i}: fail() is unusable -- {err}")
            break

        slashed = bond * PENALTY_BPS[reason] // BPS
        burned = slashed - slashed * 5_000 // BPS - slashed * 3_000 // BPS

        supply_after = token.functions.totalSupply().call()
        dead_after = token.functions.balanceOf(DEAD_ADDRESS).call()

        check(
            supply_before - supply_after == burned,
            f"P5#{i}: totalSupply fell by {supply_before - supply_after} wei, "
            f"expected exactly the burn slice {burned} "
            f"(reason={reason}, penalty {PENALTY_BPS[reason]} bps, slashed={slashed})",
        )
        check(
            dead_after == dead_before,
            f"P5#{i}: the burn slice was moved to the dead address instead of "
            f"being destroyed (+{dead_after - dead_before} wei)",
        )

    check(
        token.functions.balanceOf(DEAD_ADDRESS).call() == dead_at_start,
        "P5: the dead address received tokens over the course of the run",
    )


# --------------------------------------------------------------------------- #


def main() -> int:
    global ARTIFACTS

    ap = argparse.ArgumentParser()
    ap.add_argument("--iterations", type=int, default=120)
    ap.add_argument("--port", type=int, default=8547)
    ap.add_argument("--seed", type=int, default=20261011)
    ap.add_argument("--anvil", default=None)
    ap.add_argument("--only", default="p1,p2,p3,p4,p5",
                    help="comma-separated subset of p1,p2,p3,p4,p5 to run")
    ap.add_argument("--artifacts", default=None,
                    help="directory holding <Contract>.json (default: ../artifacts, "
                         "falling back to ./build-snapshot)")
    args = ap.parse_args()

    wanted = {p.strip().lower() for p in args.only.split(",") if p.strip()}
    ARTIFACTS = resolve_artifacts(args.artifacts)

    rng = random.Random(args.seed)
    anvil_binary = find_anvil(args.anvil)
    print(f"anvil:     {anvil_binary}")
    print(f"artifacts: {ARTIFACTS}")
    proc = start_anvil(anvil_binary, args.port)

    try:
        w3 = Web3(Web3.HTTPProvider(f"http://127.0.0.1:{args.port}",
                                    request_kwargs={"timeout": 30}))
        chain = Chain(w3)
        owner = chain.accounts[0]

        token = chain.deploy("OMCTestToken", [owner])
        staking = chain.deploy("OMCStaking", [token.address, owner, owner])
        market = chain.deploy(
            "OMCComputeMarket", [token.address, staking.address, owner, owner, owner]
        )
        chain.send(staking.functions.setMarket(market.address), owner)

        # the deployer only starts with INITIAL_SUPPLY (10M tOMC); top it up to
        # the hard cap so the fuzzed stake sizes are actually reachable
        chain.send(token.functions.mint(owner, 900_000_000 * E18), owner)
        for account in (chain.accounts[1], chain.accounts[2], chain.accounts[3]):
            chain.send(token.functions.transfer(account, 200_000_000 * E18), owner)

        print(f"token   {token.address}")
        print(f"staking {staking.address}")
        print(f"market  {market.address}")
        print(f"seed    {args.seed}   iterations {args.iterations}")
        print()

        if "p1" in wanted:
            # P1 needs a clean pool, so it runs against a dedicated staking contract
            apr_staking = chain.deploy("OMCStaking", [token.address, owner, owner])
            print("P1  published APR ceiling")
            property_apr_ceiling(chain, token, apr_staking, args.iterations, rng)

        if "p2" in wanted:
            print("P2  escrow conservation on settlement")
            property_escrow_conservation(chain, token, staking, market, args.iterations, rng)

        if "p3" in wanted:
            print("P3  section 7.5 penalty table, paid from the bond")
            property_penalty_table(chain, token, staking, market, args.iterations, rng)

        if "p4" in wanted:
            print("P4  escrow isolation between concurrent jobs")
            property_escrow_isolation(chain, token, staking, market, args.iterations, rng)

        if "p5" in wanted:
            print("P5  the penalty burn destroys the tokens")
            property_slash_burns(chain, token, staking, market, args.iterations, rng)
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except Exception:
            proc.kill()

    print()
    print(f"{CHECKS} assertions checked over generated cases")
    if FAILURES:
        print(f"FAILED: {len(FAILURES)} property violation(s)")
        for line in FAILURES[:25]:
            print("  -", line)
        return 1
    print("PASS -- no property violations found")
    return 0


if __name__ == "__main__":
    sys.exit(main())
