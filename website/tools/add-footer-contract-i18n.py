#!/usr/bin/env python3
"""Add the footer contract-block strings to en.js and zh.js.

The dictionaries are CRLF; hand-editing them line by line is how mixed line
endings creep in, so the insert is done here with the file's own terminator.
Idempotent: re-running skips a dictionary that already carries the keys.

    python add-footer-contract-i18n.py [--dir <website dir>]
"""
import argparse
import os
import sys

ANCHOR = '"footer.disc_testnet":'

BLOCKS = {
    "en": [
        '"footer.chain_t": "On-chain contracts",',
        '"footer.chain_verified": "BscScan verified",',
        '"footer.chain_net": "Network",',
        '"footer.chain_netv": "BNB Smart Chain · Testnet (chainId 97)",',
        '"footer.chain_token": "OMC token (tOMC)",',
        '"footer.chain_staking": "Staking (OMCStaking)",',
        '"footer.chain_market": "Compute Market (OMCComputeMarket)",',
        '"footer.chain_sec": "Security",',
        '"footer.chain_seclink": "Automated security testing — not an audit →",',
        '"footer.chain_note": "Testnet contracts, published for verification. Testnet tokens have no monetary value and are not sold or listed anywhere.",',
    ],
    "zh": [
        '"footer.chain_t": "链上合约",',
        '"footer.chain_verified": "BscScan 已验证",',
        '"footer.chain_net": "网络",',
        '"footer.chain_netv": "BNB 智能链 · 测试网（chainId 97）",',
        '"footer.chain_token": "OMC 代币（tOMC）",',
        '"footer.chain_staking": "质押合约（OMCStaking）",',
        '"footer.chain_market": "算力市场（OMCComputeMarket）",',
        '"footer.chain_sec": "安全",',
        '"footer.chain_seclink": "已做自动化安全测试 —— 未经审计 →",',
        '"footer.chain_note": "测试网合约，公开供核验。测试网代币无任何货币价值，也不在任何地方出售或上线。",',
    ],
}

INDENT = "  "


def run(path, lang):
    with open(path, "r", encoding="utf-8", newline="") as fh:
        src = fh.read()
    if "footer.chain_t" in src:
        return "already present"
    nl = "\r\n" if "\r\n" in src else "\n"
    lines = src.split(nl)
    hits = [i for i, l in enumerate(lines) if l.startswith(INDENT + ANCHOR)]
    if len(hits) != 1:
        return "SKIP: %d anchor lines" % len(hits)
    at = hits[0] + 1
    block = [INDENT + k for k in BLOCKS[lang]]
    lines[at:at] = [""] + block
    with open(path, "w", encoding="utf-8", newline="") as fh:
        fh.write(nl.join(lines))
    return "patched (+%d keys)" % len(block)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
    args = ap.parse_args()
    langdir = os.path.join(os.path.abspath(args.dir), "assets", "js", "lang")
    rc = 0
    for lang in ("en", "zh"):
        p = os.path.join(langdir, lang + ".js")
        status = run(p, lang)
        print("%-8s %s" % (lang + ".js", status))
        if status.startswith("SKIP"):
            rc = 1
    return rc


if __name__ == "__main__":
    sys.exit(main())
