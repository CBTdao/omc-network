#!/usr/bin/env python3
"""Add the wlt.open_app strings (Binance App deep-link entry) to en.js and zh.js.

    python add-binance-sdk-i18n.py [--dir <website dir>]
"""
import argparse
import os
import sys

ANCHOR = '"wlt.chain_v":'

BLOCKS = {
    "en": [
        '"wlt.open_app": "Open in the Binance App →",',
        '"wlt.open_app_note": "The Binance Web3 Wallet lives inside the Binance App, not as a browser extension. This reopens the current page there, on BNB Smart Chain Testnet.",',
    ],
    "zh": [
        '"wlt.open_app": "在币安 App 中打开 →",',
        '"wlt.open_app_note": "Binance Web3 Wallet 内置在币安 App 里，不是浏览器插件。这个链接会在币安 App 中重新打开当前页面，并切到 BNB 智能链测试网。",',
    ],
}

INDENT = "  "


def run(path, lang):
    with open(path, "r", encoding="utf-8", newline="") as fh:
        src = fh.read()
    if '"wlt.open_app"' in src:
        return "already present"
    nl = "\r\n" if "\r\n" in src else "\n"
    lines = src.split(nl)
    hits = [i for i, l in enumerate(lines) if l.startswith(INDENT + ANCHOR)]
    if len(hits) != 1:
        return "SKIP: %d anchor lines" % len(hits)
    at = hits[0] + 1
    block = [INDENT + k for k in BLOCKS[lang]]
    lines[at:at] = block
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
        status = run(os.path.join(langdir, lang + ".js"), lang)
        print("%-8s %s" % (lang + ".js", status))
        if status.startswith("SKIP"):
            rc = 1
    return rc


if __name__ == "__main__":
    sys.exit(main())
