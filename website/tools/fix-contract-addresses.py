# -*- coding: utf-8 -*-
"""Point the site at the current testnet staking + market contracts, and drop
the "buyback" wording that the contracts never implemented.

Two changes, both driven by chain-verified facts:

1. F-5 cascade redeploy (2026-10-11). OMCStaking and OMCComputeMarket were
   redeployed so that the burn slices call token.burn() instead of transferring
   to 0x…dEaD. tOMC did not move. Every reference to the superseded pair has to
   follow, or the site advertises contracts that are no longer wired to the
   market.

2. F-6 wording. The whitepaper and the site said the fee slice was used to
   "buy back OMC on the market". No buyback exists or can exist: jobs are
   escrowed and settled in OMC, so the fee is already denominated in the token.
   The honest description is that the slice is burned outright.

Idempotent: every replacement is guarded by a plain substring test, and the
script reports what it changed rather than assuming. Run from the session root:

    python omc-network-repo/website/tools/fix-contract-addresses.py [--check]

--check reports drift without writing.
"""
import io
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")

OLD_STAKING = "0x3226dffED51e28CEf526F8c078B2EC9a092E36e6"
NEW_STAKING = "0xa70B8506a1a614Fd83D0C70d73Da1E21fdcf1fB6"
OLD_MARKET = "0x3B81E6edfbA775B4E53694F531C3b0236D77FEF1"
NEW_MARKET = "0x7664f1e73c2CBCbaFE636a653C173378C369C40A"

# Only files that can carry contract addresses or the fee-split copy.
ADDRESS_FILES = [
    "about.html", "ai-tools.html", "airdrop.html", "aup.html", "calculator.html",
    "compute.html", "index.html", "news.html", "privacy.html", "stake.html",
    "testnet.html", "tokenomics.html", "whitepaper.html",
    "assets/js/compute-core.js", "assets/js/stake-core.js",
    "tools/add-footer-contracts.py",
]

# (path, old, new) — wording only, no addresses involved.
COPY_FIXES = [
    ("assets/js/lang/en.js", '"util4.t": "Buyback & Burn",', '"util4.t": "Burn",'),
    ("assets/js/lang/en.js",
     '"util4.d": "30% of every 3% protocol fee is bought back and burned. Slashing burns 20%.",',
     '"util4.d": "30% of every 3% protocol fee is burned outright. Slashing burns a further 20%.",'),
    ("assets/js/lang/zh.js", '"util4.t": "回购销毁",', '"util4.t": "销毁",'),
    ("assets/js/lang/zh.js",
     '"util4.d": "每笔任务 3% 协议费中的 30% 自动回购并销毁，罚没亦销毁 20%。",',
     '"util4.d": "每笔任务 3% 协议费中的 30% 直接销毁，罚没另销毁 20%。",'),
    ("index.html",
     '<h3 data-i18n="util4.t">Buyback &amp; Burn</h3>',
     '<h3 data-i18n="util4.t">Burn</h3>'),
    ("index.html",
     '<p data-i18n="util4.d">30% of every 3% protocol fee is bought back and burned. Slashing burns 20%.</p>',
     '<p data-i18n="util4.d">30% of every 3% protocol fee is burned outright. Slashing burns a further 20%.</p>'),
    ("tokenomics.html",
     "<li><strong>Fee buyback and burn.</strong> Every settled job pays a 3% protocol fee; 30% of that fee buys OMC on the market and burns it automatically. That is <strong>0.9% of settled job volume</strong>.</li>",
     "<li><strong>Fee burn.</strong> Every settled job pays a 3% protocol fee; 30% of that fee is destroyed by the contract at settlement, which reduces total supply directly. That is <strong>0.9% of settled job volume</strong>.</li>"),
]


def read(p):
    with io.open(p, encoding="utf-8") as f:
        return f.read()


def write(p, s):
    with io.open(p, "w", encoding="utf-8", newline="") as f:
        f.write(s)


def main():
    check = "--check" in sys.argv
    changed = []
    stale = []

    for rel in ADDRESS_FILES:
        p = os.path.join(ROOT, rel)
        if not os.path.exists(p):
            continue
        s = read(p)
        before = s
        n_stk = s.count(OLD_STAKING)
        n_mkt = s.count(OLD_MARKET)
        if n_stk:
            s = s.replace(OLD_STAKING, NEW_STAKING)
        if n_mkt:
            s = s.replace(OLD_MARKET, NEW_MARKET)
        if s != before:
            if check:
                stale.append("%s  (%d staking, %d market)" % (rel, n_stk, n_mkt))
            else:
                write(p, s)
                changed.append("%s  (%d staking, %d market)" % (rel, n_stk, n_mkt))

    for rel, old, new in COPY_FIXES:
        p = os.path.join(ROOT, rel)
        if not os.path.exists(p):
            print("MISSING", rel)
            continue
        s = read(p)
        if old in s:
            if check:
                stale.append("%s  (wording)" % rel)
            else:
                write(p, s.replace(old, new))
                changed.append("%s  (wording)" % rel)

    if check:
        if stale:
            print("STALE — %d file(s) still carry the superseded text:" % len(stale))
            for x in stale:
                print("  " + x)
            sys.exit(1)
        print("clean — every reference is current")
        return

    if changed:
        print("updated %d file(s):" % len(changed))
        for x in changed:
            print("  " + x)
    else:
        print("nothing to do — already current")

    # Belt and braces: nothing anywhere may still name the superseded pair.
    # This file is the one legitimate exception — it has to name them to find them.
    me = os.path.abspath(__file__)
    leftovers = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        if "docs" in dirpath.replace("\\", "/").split("/"):
            continue
        for fn in filenames:
            if not fn.endswith((".html", ".js", ".py", ".json")):
                continue
            p = os.path.join(dirpath, fn)
            if os.path.abspath(p) == me:
                continue
            try:
                s = read(p)
            except Exception:
                continue
            if OLD_STAKING in s or OLD_MARKET in s:
                leftovers.append(os.path.relpath(p, ROOT))
    if leftovers:
        print("\nSTILL STALE (not in the handled list — check by hand):")
        for x in leftovers:
            print("  " + x)
        sys.exit(2)


if __name__ == "__main__":
    main()
