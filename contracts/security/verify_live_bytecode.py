#!/usr/bin/env python3
"""
Compare what is deployed on BSC testnet with what this repository builds.

Two questions are answered, and they are different:

  1. Does the reviewed build reproduce the deployed code?
     Immutables are patched into the runtime bytecode at construction time, so
     the comparison is exact only for a contract with no immutables. `tOMC` has
     none, so it must match byte for byte — that is the control that proves the
     toolchain (solc 0.8.26, optimizer 200, viaIR, evmVersion paris) is faithful.

  2. Is the code that was reviewed the same code that is running?
     `contracts/security/pre-fix-snapshot/` is the build of the sources as they
     stood at the commit that was deployed. It must match the live runtime code
     once the immutable slots are masked out.

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

DEPLOYMENTS = {
    "OMCTestToken": "0xBEB21E40FB50A0F4ba9287C2058DC7851e450671",
    "OMCStaking": "0x3226dffED51e28CEF526F8c078B2EC9a092E36e6",
    "OMCComputeMarket": "0x3B81E6edfbA775B4E53694F531C3b0236D77FEF1",
}

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

    report: dict = {
        "chainId": w3.eth.chain_id,
        "block": w3.eth.block_number,
        "rpc": used,
        "contracts": {},
    }

    ok = True
    print(f"{'contract':18} {'live':>7} {'reviewed':>9} {'head':>7}  verdict")
    for name, address in DEPLOYMENTS.items():
        live = w3.eth.get_code(Web3.to_checksum_address(address)).hex()
        if live.startswith("0x"):
            live = live[2:]
        reviewed = deploy_runtime(HERE / "build-snapshot" / f"{name}.json")
        head = deploy_runtime(HERE / "pre-fix-snapshot" / f"{name}.json")

        exact = live == reviewed
        head_ok, regions, size = only_immutables(head, live)

        if exact:
            verdict = "reviewed build reproduces the deployed code exactly"
        elif head_ok:
            verdict = (f"deployed code == pre-fix build, differing only at "
                       f"{regions} zero-filled region(s) (reviewed build differs)")
        else:
            verdict = "MISMATCH against both builds -- investigate"
            ok = False

        report["contracts"][name] = {
            "address": address,
            "liveBytes": len(live) // 2,
            "liveKeccak256": Web3.keccak(hexstr=live).hex(),
            "reviewedBytes": len(reviewed) // 2,
            "reviewedKeccak256": Web3.keccak(hexstr=reviewed).hex(),
            "headBytes": len(head) // 2,
            "headKeccak256": Web3.keccak(hexstr=head).hex(),
            "reviewedMatchesLive": exact,
            "headMatchesLiveModuloImmutables": head_ok,
            "differingRegions": regions,
            "verdict": verdict,
        }
        print(f"{name:18} {len(live)//2:7d} {len(reviewed)//2:9d} {len(head)//2:7d}  {verdict}")

    if args.write:
        json.dump(report, open(HERE / "bytecode-report.json", "w", encoding="utf-8"),
                  indent=2)
        print("\nwrote bytecode-report.json")

    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
