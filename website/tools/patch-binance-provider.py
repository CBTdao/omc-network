#!/usr/bin/env python3
"""Patch the wallet provider resolution so the site also recognises
Binance Web3 Wallet, which injects at window.binancew3w.ethereum inside the
Binance App browser (per the official Binance Web3 Provider API docs).

Also keeps window.BinanceChain (the legacy extension) as a fallback.

Line endings are detected per file, so this works whether a file is LF or CRLF.
Every replacement asserts exactly one match, so a silent miss is impossible.
"""
import io, os

BASE = r"C:\Users\Administrator\WorkBuddy\2026-10-01-14-20-05\omc-network-repo\website\assets\js"


def read(p):
    with io.open(p, "r", encoding="utf-8", newline="") as f:
        s = f.read()
    eol = "\r\n" if "\r\n" in s else "\n"
    return s, eol


def write(p, s):
    with io.open(p, "w", encoding="utf-8", newline="") as f:
        f.write(s)


def patch(p, old, new, tag):
    s, eol = read(p)
    old_e = old.replace("\n", eol)
    new_e = new.replace("\n", eol)
    n = s.count(old_e)
    assert n == 1, "%s: expected exactly 1 site for %s, found %d" % (
        os.path.basename(p), tag, n)
    write(p, s.replace(old_e, new_e))
    print("patched %-22s [%s]  eol=%s" % (os.path.basename(p), tag,
                                          "CRLF" if eol == "\r\n" else "LF"))


OLD_RESOLVER = """    var eth = window.ethereum;
    if (!eth) return null;"""

NEW_RESOLVER = """    var eth = null;
    /* Binance Web3 Wallet injects at window.binancew3w.ethereum inside the
       Binance App browser; the legacy extension used window.BinanceChain.
       Check those first, then fall back to the standard window.ethereum. */
    try {
      if (window.binancew3w && window.binancew3w.ethereum) eth = window.binancew3w.ethereum;
    } catch (e) { eth = null; }
    if (!eth) eth = window.ethereum || window.BinanceChain || null;
    if (!eth) return null;"""

for name in ("wallet.js", "compute-core.js", "stake-core.js"):
    patch(os.path.join(BASE, name), OLD_RESOLVER, NEW_RESOLVER, "provider")

OLD_HAS = """  function hasWallet() {
    return !!(window.ethereum && window.ethereum.request);
  }"""
NEW_HAS = """  function hasWallet() {
    /* Same resolution order as wallet.js: the Binance App provider first,
       then the standard injected provider. */
    var p = null;
    try {
      if (window.binancew3w && window.binancew3w.ethereum) p = window.binancew3w.ethereum;
    } catch (e) { p = null; }
    if (!p) p = window.ethereum || window.BinanceChain || null;
    return !!(p && p.request);
  }"""
patch(os.path.join(BASE, "ai-tools-job.js"), OLD_HAS, NEW_HAS, "hasWallet")

# wallet.js also gets the resolver exposed and a refreshed header comment.
W = os.path.join(BASE, "wallet.js")
patch(W,
      "    short: short,\n    connect: connect,",
      "    short: short,\n    provider: provider,\n    connect: connect,",
      "exports")

patch(W,
      "   - Detects an injected EIP-1193 provider (MetaMask / OKX / Binance /\n"
      "     Bitget / Rabby\u2026), including the multi-provider array.",
      "   - Detects an injected EIP-1193 provider: window.binancew3w.ethereum\n"
      "     (the Web3 Wallet inside the Binance App), window.BinanceChain (the\n"
      "     legacy extension) and the standard window.ethereum (MetaMask / OKX\n"
      "     / Binance / Bitget / Rabby\u2026), including the multi-provider array.",
      "header")

print("OK - all 4 files patched")
