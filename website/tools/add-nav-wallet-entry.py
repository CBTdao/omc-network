#!/usr/bin/env python3
"""Restore the site-wide wallet sign-in entry in the top nav.

Context: on 2026-10-03 the nav sign-in slot (`#walletNav`) and the wallet.js
script were removed from every page, because the wallet risk banner on a fresh
domain was shown to visitors who were only browsing. On 2026-10-11 the owner
asked for the entry back: sign in once, and every page should show the signed-in
state. That is exactly what `wallet.js` already does — `readSession()` reads the
persistent localStorage session (`omc_session_v1`) and `renderNav()` renders
either a "Sign in" button or the account menu. So this script only restores the
two pieces the pages are missing; no new JS.

What it does, per page, idempotently:
  1. adds   <div class="nav-wallet" id="walletNav"></div>   before the language
     selector inside `.nav-links`  (the CSS for it never left style.css)
  2. adds   binance-w3w.js (if absent, and before wallet.js) and wallet.js
     right after main.js

Both insertions assert their anchors, so a page whose markup drifted fails
loudly instead of silently getting a half-applied nav.
"""
import pathlib
import sys

PAGES = [
    "index", "news", "whitepaper", "tokenomics", "calculator", "compute",
    "ai-tools", "testnet", "stake", "airdrop", "about", "aup", "privacy",
]

SLOT = '        <div class="nav-wallet" id="walletNav"></div>\n'
MAIN_ANCHOR = '<script src="assets/js/main.js"></script>'
W3W = '  <script src="assets/js/binance-w3w.js"></script>'
WALLET = '  <script src="assets/js/wallet.js"></script>'

root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
touched, skipped = [], []

for name in PAGES:
    page = root / (name + ".html")
    if not page.exists():
        print("FAIL: %s does not exist" % page)
        sys.exit(1)
    src = page.read_text(encoding="utf-8")
    original = src
    did = []

    if 'id="walletNav"' not in src:
        anchor = '<select class="lang-select"'
        if anchor not in src:
            print("FAIL: %s has no language selector anchor" % name)
            sys.exit(1)
        at = src.index(anchor)
        line_start = src.rfind("\n", 0, at) + 1
        src = src[:line_start] + SLOT + src[line_start:]
        did.append("slot")

    if "assets/js/wallet.js" not in src:
        if MAIN_ANCHOR not in src:
            print("FAIL: %s has no main.js anchor" % name)
            sys.exit(1)
        add = MAIN_ANCHOR + "\n" + WALLET
        if "assets/js/binance-w3w.js" not in src:
            add = MAIN_ANCHOR + "\n" + W3W + "\n" + WALLET
        src = src.replace(MAIN_ANCHOR, add, 1)
        did.append("scripts")

    # airdrop.html predates the Binance wallet support: it loads wallet.js but
    # not the w3w helpers. wallet.js resolves window.binancew3w on its own, but
    # the helper backs the deep-link entry and the "in the App" detection, so
    # every page that can sign should carry it.
    if "assets/js/binance-w3w.js" not in src and "assets/js/wallet.js" in src:
        src = src.replace(WALLET, W3W + "\n" + WALLET, 1)
        did.append("w3w")

    if src != original:
        page.write_text(src, encoding="utf-8")
        touched.append("%s (%s)" % (name, "+".join(did)))
    else:
        skipped.append(name)

    # re-read and assert the end state
    check = page.read_text(encoding="utf-8")
    assert check.count('id="walletNav"') == 1, name + ": slot count"
    assert check.count("assets/js/wallet.js") == 1, name + ": wallet.js count"
    w3w_at = check.find("assets/js/binance-w3w.js")
    wal_at = check.find("assets/js/wallet.js")
    assert w3w_at > -1, name + ": binance-w3w.js missing"
    assert w3w_at < wal_at, name + ": w3w must load before wallet.js"

print("updated %d page(s):" % len(touched))
for t in touched:
    print("  " + t)
if skipped:
    print("already current: " + ", ".join(skipped))
print("all 13 pages: slot present, wallet.js loaded after binance-w3w.js")
