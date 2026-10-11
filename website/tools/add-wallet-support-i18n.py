#!/usr/bin/env python3
"""Add the wlt.* strings for the wallet-support band to en.js and zh.js.

Same conventions as the other add-*-i18n.py scripts: the dictionaries are
inserted with the file's own line terminator, and the run is idempotent.

    python add-wallet-support-i18n.py [--dir <website dir>]
"""
import argparse
import os
import sys

ANCHOR = '"footer.chain_note":'

BLOCKS = {
    "en": [
        '"wlt.title": "Supported wallets",',
        '"wlt.sub": "Any EIP-1193 wallet works. Inside the Binance App this dApp connects through the Binance Web3 Wallet that Binance injects at <code>window.binancew3w.ethereum</code> — not at <code>window.ethereum</code>.",',
        '"wlt.bnb": "Binance Web3 Wallet",',
        '"wlt.bnb_tag": "Detected automatically inside the Binance App — no extension needed",',
        '"wlt.browser": "Browser wallets",',
        '"wlt.browser_tag": "MetaMask, Trust Wallet and any other EIP-1193 provider",',
        '"wlt.chain": "Network",',
        '"wlt.chain_v": "BNB Smart Chain Testnet (chainId 97) — the page requests the switch for you",',
    ],
    "zh": [
        '"wlt.title": "支持的钱包",',
        '"wlt.sub": "任何 EIP-1193 钱包均可连接。在币安 App 内，本 dApp 通过币安注入在 <code>window.binancew3w.ethereum</code>（而非 <code>window.ethereum</code>）的 Binance Web3 Wallet 建立连接。",',
        '"wlt.bnb": "Binance Web3 Wallet",',
        '"wlt.bnb_tag": "在币安 App 内自动识别，无需安装插件",',
        '"wlt.browser": "浏览器钱包",',
        '"wlt.browser_tag": "MetaMask、Trust Wallet 及其他 EIP-1193 提供方",',
        '"wlt.chain": "网络",',
        '"wlt.chain_v": "BNB 智能链测试网（chainId 97）—— 页面会自动发起切链请求",',
    ],
}

INDENT = "  "


def run(path, lang):
    with open(path, "r", encoding="utf-8", newline="") as fh:
        src = fh.read()
    if '"wlt.title"' in src:
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
        status = run(os.path.join(langdir, lang + ".js"), lang)
        print("%-8s %s" % (lang + ".js", status))
        if status.startswith("SKIP"):
            rc = 1
    return rc


if __name__ == "__main__":
    sys.exit(main())
