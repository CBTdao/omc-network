#!/usr/bin/env python3
"""Wire the Binance Web3 Wallet SDK utilities into the wallet pages.

Two edits per page, both idempotent:

  1. Load assets/js/binance-w3w.js before wallet.js. That file is the web-side
     port of @binance/w3w-utils (isInBinance / isExtensionInstalled /
     getDeeplink). It adds no third-party request.
  2. Add the "Open in the Binance App" entry to the wallet band. It ships with
     the `hidden` attribute and is revealed only by the script, when the page
     is NOT already running inside the Binance App.

Targets /stake, /compute and /ai-tools — the pages that already carry the band.

    python add-binance-sdk.py [--dir <website dir>]
"""
import argparse
import os
import sys

PAGES = ["stake.html", "compute.html", "ai-tools.html"]

SCRIPT_MARKER = "assets/js/binance-w3w.js"
SCRIPT_ANCHOR = '  <script src="assets/js/wallet.js"></script>\n'
SCRIPT_LINE = '  <script src="assets/js/binance-w3w.js"></script>\n'

DEEPLINK_MARKER = "wltOpenInApp"
DEEPLINK_ANCHOR = '      </ul>\n    </div>\n  </section>\n'
DEEPLINK_BLOCK = """      </ul>
      <div class="wlt-open" id="wltOpenInApp" hidden>
        <a class="btn btn-primary" href="#" data-i18n="wlt.open_app">Open in the Binance App &rarr;</a>
        <span class="wlt-open-note" data-i18n="wlt.open_app_note">The Binance Web3 Wallet lives inside the Binance App, not as a browser extension. This reopens the current page there, on BNB Smart Chain Testnet.</span>
      </div>
    </div>
  </section>
"""


def patch(path):
    with open(path, "r", encoding="utf-8", newline="") as fh:
        src = fh.read()
    notes = []
    nl = "\r\n" if "\r\n" in src else "\n"

    if SCRIPT_MARKER not in src:
        anchor = SCRIPT_ANCHOR if nl == "\n" else SCRIPT_ANCHOR.replace("\n", "\r\n")
        if src.count(anchor) != 1:
            return "SKIP: %d wallet.js anchors" % src.count(anchor)
        line = SCRIPT_LINE if nl == "\n" else SCRIPT_LINE.replace("\n", "\r\n")
        src = src.replace(anchor, line + anchor)
        notes.append("script")

    if DEEPLINK_MARKER not in src:
        anchor = DEEPLINK_ANCHOR if nl == "\n" else DEEPLINK_ANCHOR.replace("\n", "\r\n")
        if src.count(anchor) != 1:
            return "SKIP: %d band-close anchors" % src.count(anchor)
        block = DEEPLINK_BLOCK if nl == "\n" else DEEPLINK_BLOCK.replace("\n", "\r\n")
        src = src.replace(anchor, block)
        notes.append("deeplink")

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

    p = os.path.join(root, "assets", "js", "binance-w3w.js")
    print("%-34s %s" % ("assets/js/binance-w3w.js", "present" if os.path.exists(p) else "MISSING"))

    changed = 0
    for name in PAGES:
        path = os.path.join(root, name)
        if not os.path.exists(path):
            print("%-20s SKIP: not found" % name)
            continue
        status = patch(path)
        if status.startswith("patched"):
            changed += 1
        print("%-20s %s" % (name, status))
    print("\n%d file(s) patched" % changed)
    return 0


if __name__ == "__main__":
    sys.exit(main())
