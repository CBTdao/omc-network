#!/usr/bin/env python3
"""Add the wallet-support band to the three pages that connect a wallet.

Why: the Binance Web3 Wallet dApp Zone self-test has a hard case,
"Binance Logo Exposure - Success (Web & App)". A reviewer whitelists the dApp,
opens it inside the Binance App browser and looks for the wallet entry and the
Binance mark. Today the site connects a wallet but never names a wallet, so that
case cannot pass.

Targets /stake, /compute and /ai-tools only — the pages under /airdrop and the
marketing pages do not connect a wallet and gain nothing from the band.

The mark is a local asset (assets/img/wallets/binance-web3.svg). No third-party
request is introduced: verify-site.js asserts the only off-origin script on the
site is the AdSense verify tag.

Idempotent: re-running is a no-op, keyed on the `omc:wallet-support` marker.

    python add-wallet-support.py [--dir <website dir>]
"""
import argparse
import os
import sys

PAGES = ["stake.html", "compute.html", "ai-tools.html"]
MARKER = "omc:wallet-support"
ANCHOR = "  <footer>"
LINK_ANCHOR = '  <link rel="stylesheet" href="assets/css/style.css" />\n'
NEW_LINK = '  <link rel="stylesheet" href="assets/css/wallet-support.css" />\n'

BLOCK = """  <!-- omc:wallet-support — wallet entry points, including the Binance Web3
       Wallet mark. Satisfies the dApp Zone self-test case
       "Binance Logo Exposure - Success (Web & App)". -->
  <section class="wlt-band">
    <div class="wlt-inner">
      <div class="wlt-head">
        <h2 data-i18n="wlt.title">Supported wallets</h2>
        <p data-i18n="wlt.sub">Any EIP-1193 wallet works. Inside the Binance App this dApp connects through the Binance Web3 Wallet that Binance injects at <code>window.binancew3w.ethereum</code> &#8212; not at <code>window.ethereum</code>.</p>
      </div>
      <ul class="wlt-list">
        <li class="wlt-item wlt-primary">
          <img class="wlt-logo" src="assets/img/wallets/binance-web3.svg" alt="Binance Web3 Wallet" width="40" height="40" />
          <span>
            <span class="wlt-name" data-i18n="wlt.bnb">Binance Web3 Wallet</span>
            <span class="wlt-tag" data-i18n="wlt.bnb_tag">Detected automatically inside the Binance App &#8212; no extension needed</span>
          </span>
        </li>
        <li class="wlt-item">
          <span class="wlt-glyph" aria-hidden="true">&#128273;</span>
          <span>
            <span class="wlt-name" data-i18n="wlt.browser">Browser wallets</span>
            <span class="wlt-tag" data-i18n="wlt.browser_tag">MetaMask, Trust Wallet and any other EIP-1193 provider</span>
          </span>
        </li>
        <li class="wlt-item">
          <span class="wlt-glyph" aria-hidden="true">&#9939;</span>
          <span>
            <span class="wlt-name" data-i18n="wlt.chain">Network</span>
            <span class="wlt-tag" data-i18n="wlt.chain_v">BNB Smart Chain Testnet (chainId 97) &#8212; the page requests the switch for you</span>
          </span>
        </li>
      </ul>
    </div>
  </section>

"""


def patch(path):
    with open(path, "r", encoding="utf-8", newline="") as fh:
        src = fh.read()
    notes = []
    nl = "\r\n" if "\r\n" in src else "\n"

    if "assets/css/wallet-support.css" not in src:
        anchor = LINK_ANCHOR if nl == "\n" else LINK_ANCHOR.replace("\n", "\r\n")
        if src.count(anchor) != 1:
            return "SKIP: %d stylesheet anchors" % src.count(anchor)
        new = NEW_LINK if nl == "\n" else NEW_LINK.replace("\n", "\r\n")
        src = src.replace(anchor, anchor + new)
        notes.append("link")

    if MARKER not in src:
        if src.count(ANCHOR) != 1:
            return "SKIP: %d footer anchors" % src.count(ANCHOR)
        block = BLOCK if nl == "\n" else BLOCK.replace("\n", "\r\n")
        src = src.replace(ANCHOR, block + ANCHOR)
        notes.append("band")

    if not notes:
        return "already present"
    with open(path, "w", encoding="utf-8", newline="") as fh:
        fh.write(src)
    return "patched (" + "+".join(notes) + ")"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
    args = ap.parse_args()
    root = os.path.abspath(args.dir)

    for f in ["assets/css/wallet-support.css", "assets/img/wallets/binance-web3.svg"]:
        p = os.path.join(root, *f.split("/"))
        print("%-44s %s" % (f, "present" if os.path.exists(p) else "MISSING"))

    changed = 0
    for p in PAGES:
        path = os.path.join(root, p)
        if not os.path.exists(path):
            print("%-20s SKIP: not found" % p)
            continue
        status = patch(path)
        if status.startswith("patched"):
            changed += 1
        print("%-20s %s" % (p, status))
    print("\n%d file(s) patched" % changed)
    return 0


if __name__ == "__main__":
    sys.exit(main())
