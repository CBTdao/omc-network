#!/usr/bin/env python3
"""
Compare what is deployed on BSC testnet with what this repository builds.

Three questions, and they are different:

  1. Does the reviewed build reproduce the deployed code?
     Immutables are patched into the runtime bytecode at construction time, so
     the comparison is exact only for a contract with no immutables. `tOMC` has
     none, so it must match byte for byte — that is the control that proves the
     toolchain (solc 0.8.26, optimizer 200, viaIR, evmVersion paris) is faithful.

  2. Is the code that was reviewed the same code that is running?
     The reviewed build carries zeroes in the immutable slots; the live runtime
     carries the real addresses. So the live code is compared against the
     reviewed build with those slots masked out.

  3. If the live code is neither, which historical snapshot is it?
     The repository keeps a build of every source revision that has ever been
     deployed. A live address that matches an *older* snapshot means the source
     tree has moved ahead of the chain — the exact trap that F-1 and F-5 both
     set. That case is reported as a failure, not as a curiosity.

Addresses are read from `../deployments/bsc-testnet.json`, not hard-coded here.
They used to be hard-coded, and a redeploy silently turned the whole report into
a comparison of the old chain code against the new build — a confidently wrong
answer. Reading the deployment record removes that failure mode.

Usage
-----
    python verify_live_bytecode.py [--rpc URL] [--write]

`--write` refreshes bytecode-report.json. Needs web3.py and network access.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

try:
    from web3 import Web3
except ImportError:  # pragma: no cover
    sys.exit("web3.py is required: pip install web3")

HERE = Path(__file__).resolve().parent

# The build of the current source tree. This is what a redeploy would ship.
REVIEWED = "build-snapshot"

# Source revisions that are (or were) live on chain, newest last. Each entry is
# (directory, contract name, one-line description of the source state).
SNAPSHOT_HISTORY = [
    ("pre-fix-snapshot", "OMCTestToken", "the F-1 deployed revision"),
    ("pre-fix-snapshot", "OMCStaking", "the F-1 deployed revision"),
    ("pre-fix-snapshot", "OMCComputeMarket", "the F-1 deployed revision"),
    ("pre-f5-snapshot", "OMCTestToken", "F-1 fixed, F-5 not yet"),
    ("pre-f5-snapshot", "OMCStaking", "F-1 fixed, F-5 not yet"),
    ("pre-f5-snapshot", "OMCComputeMarket", "F-1 fixed, F-5 not yet"),
]

# Which deployment-record key holds each contract, and which snapshot a live
# deployment of it is expected to reproduce.
DEPLOY_KEYS = [
    ("OMCTestToken", "token"),
    ("OMCStaking", "staking"),
    ("OMCComputeMarket", "market"),
]

DEFAULT_RPCS = [
    "https://data-seed-prebsc-1-s1.bnbchain.org:8545",
    "https://bsc-testnet-rpc.publicnode.com",
    "https://data-seed-prebsc-2-s3.bnbchain.org:8545",
]


def diff_runs(a: str, b: str) -> list[tuple[int, int]]:
    """Contiguous nibble ranges where two hex strings differ."""
    runs: list[list[int]] = []
    for i in range(min(len(a), len(b))):
        if a[i] != b[i]:
            if runs and i - runs[-1][1] <= 1:
                runs[-1][1] = i
            else:
                runs.append([i, i])
    return [(x, y) for x, y in runs]


def only_immutables(reviewed: str, live: str) -> tuple[bool, int, int]:
    """True when the two runtimes differ only in 32-byte immutable slots, i.e.
    every differing byte on our side is zero and no run is longer than 32 bytes."""
    if len(reviewed) != len(live):
        return False, 0, 0
    runs = diff_runs(reviewed, live)
    for a, b in runs:
        if (b - a + 1) / 2 > 32:
            return False, len(runs), 0
        if set(reviewed[a : b + 1]) != {"0"}:
            return False, len(runs), 0
    return True, len(runs), len(live) // 2


def deploy_runtime(path: Path) -> str:
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)["deployedBytecode"][2:]


def load_deployments() -> dict[str, str]:
    path = HERE.parent / "deployments" / "bsc-testnet.json"
    record = json.loads(path.read_text(encoding="utf-8"))
    out = {}
    for name, key in DEPLOY_KEYS:
        if key not in record:
            sys.exit(f"deployments/bsc-testnet.json has no '{key}' entry")
        out[name] = record[key]
    return out


def classify(name: str, live: str, reviewed: str) -> tuple[str, bool, dict]:
    """Return (verdict, passed, detail)."""
    if live == reviewed:
        return "reviewed build reproduces the deployed code exactly", True, {
            "matchesReviewedExactly": True,
            "matchesReviewedModuloImmutables": True,
            "differingImmutableRegions": 0,
            "matchesSnapshots": [],
        }

    rev_ok, rev_regions, _ = only_immutables(reviewed, live)
    if rev_ok:
        n = rev_regions
        return (
            f"reviewed build reproduces the deployed code except at "
            f"{n} immutable region(s) (the expected difference)",
            True,
            {
                "matchesReviewedExactly": False,
                "matchesReviewedModuloImmutables": True,
                "differingImmutableRegions": n,
                "matchesSnapshots": [],
            },
        )

    hits = []
    for tag, whose, desc in SNAPSHOT_HISTORY:
        if whose != name:
            continue
        snap = deploy_runtime(HERE / tag / f"{name}.json")
        hit, regions, _ = only_immutables(snap, live)
        if hit:
            hits.append({"snapshot": tag, "describes": desc, "regions": regions})

    detail = {
        "matchesReviewedExactly": False,
        "matchesReviewedModuloImmutables": False,
        "differingImmutableRegions": rev_regions,
        "matchesSnapshots": hits,
    }

    if hits:
        newest = hits[-1]
        return (
            f"STALE DEPLOYMENT -- the live code is the {newest['snapshot']} build "
            f"({newest['describes']}); the reviewed source is newer and not deployed",
            False,
            detail,
        )
    return (
        "MISMATCH against the reviewed build and every snapshot -- investigate",
        False,
        detail,
    )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--rpc", default=None)
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    rpcs = [args.rpc] if args.rpc else DEFAULT_RPCS
    w3 = None
    for url in rpcs:
        try:
            candidate = Web3(Web3.HTTPProvider(url, request_kwargs={"timeout": 20}))
            if candidate.is_connected():
                w3, used = candidate, url
                break
        except Exception:
            continue
    if w3 is None:
        sys.exit("no BSC testnet RPC reachable")
    print(f"rpc: {used}  block {w3.eth.block_number}\n")

    deployments = load_deployments()
    report: dict = {
        "chainId": w3.eth.chain_id,
        "block": w3.eth.block_number,
        "rpc": used,
        "reviewedBuild": REVIEWED,
        "contracts": {},
    }

    ok = True
    print(f"{'contract':18} {'live':>7} {'reviewed':>9}  verdict")
    for name, address in deployments.items():
        live = w3.eth.get_code(Web3.to_checksum_address(address)).hex()
        if live.startswith("0x"):
            live = live[2:]
        reviewed = deploy_runtime(HERE / REVIEWED / f"{name}.json")

        verdict, passed, detail = classify(name, live, reviewed)
        ok = ok and passed

        entry = {
            "address": address,
            "liveBytes": len(live) // 2,
            "liveKeccak256": Web3.keccak(hexstr=live).hex(),
            "reviewedBytes": len(reviewed) // 2,
            "reviewedKeccak256": Web3.keccak(hexstr=reviewed).hex(),
            "verdict": verdict,
        }
        entry.update(detail)
        report["contracts"][name] = entry
        print(f"{name:18} {len(live)//2:7d} {len(reviewed)//2:9d}  {verdict}")

    if args.write:
        json.dump(
            report,
            open(HERE / "bytecode-report.json", "w", encoding="utf-8"),
            indent=2,
        )
        print("\nwrote bytecode-report.json")

    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
