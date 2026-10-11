#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Fix two factual inconsistencies found on 2026-10-11 while preparing
exchange/tracker listing applications.

1. `stk.faucet_ready` (all 7 languages) claimed "100 tOMC per claim, one
   claim per hour". The deployed OMCTestToken faucet actually pays 20 tOMC
   per claim, once per day, five times per address. The same site already
   states the correct rule on /compute (`cst.faucet_air`) and on /stake
   (`stk.faucet_air`), so the ready-state line contradicted its neighbours.

2. `about.html` advertised "Whitepaper v2.0" while every other page
   (whitepaper.html, aup.html, calculator.html) says v3.0.

Idempotent: re-running is a no-op. Preserves each file's original line
endings. Applied to both the deployment tree and the mirror tree.
"""

import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TREES = [
    ROOT,
    os.path.normpath(os.path.join(ROOT, "..", "..", "omc-website")),
]

# language -> corrected text for `stk.faucet_ready`
FAUCET_READY = {
    "en": "Faucet ready \u2014 20 tOMC per claim, one claim per day.",
    "zh": "\u6c34\u9f99\u5934\u53ef\u7528 \u2014 \u6bcf\u6b21 20 tOMC\uff0c\u6bcf\u5929 1 \u6b21\u3002",
    "es": "Faucet disponible: 20 tOMC por solicitud, una vez al d\u00eda.",
    "fr": "Faucet disponible \u2014 20 tOMC par demande, une fois par jour.",
    "ja": "\u30d5\u30a9\u30fc\u30bb\u30c3\u30c8\u5229\u7528\u53ef \u2014 1\u56de 20 tOMC\u30011\u65e51\u56de\u3002",
    "ko": "\ud30c\uc6b0\uc14b \uc0ac\uc6a9 \uac00\ub2a5 \u2014 1\ud68c 20 tOMC, \ud558\ub8e8 1\ud68c.",
    "pt": "Faucet dispon\u00edvel \u2014 20 tOMC por solicita\u00e7\u00e3o, uma vez por dia.",
}

ABOUT_OLD = "<strong>Whitepaper v2.0</strong>"
ABOUT_NEW = "<strong>Whitepaper v3.0</strong>"


def load(path):
    with open(path, "rb") as fh:
        raw = fh.read()
    crlf = b"\r\n" in raw
    return raw.decode("utf-8").replace("\r\n", "\n"), crlf


def save(path, text, crlf):
    out = text.replace("\n", "\r\n") if crlf else text
    with open(path, "wb") as fh:
        fh.write(out.encode("utf-8"))


def patch_lang(path, lang):
    text, crlf = load(path)
    new = FAUCET_READY[lang]
    key = '"stk.faucet_ready"'
    if new in text:
        return 0  # already fixed
    idx = text.find(key)
    if idx < 0:
        raise SystemExit("key not found in %s" % path)
    colon = text.index(":", idx)
    q1 = text.index('"', colon)
    q2 = text.index('"', q1 + 1)
    text = text[:q1 + 1] + new + text[q2:]
    save(path, text, crlf)
    return 1


def patch_about(path):
    text, crlf = load(path)
    if ABOUT_NEW in text:
        return 0
    n = text.count(ABOUT_OLD)
    if n != 1:
        raise SystemExit("expected 1 occurrence of %r in %s, found %d"
                         % (ABOUT_OLD, path, n))
    save(path, text.replace(ABOUT_OLD, ABOUT_NEW), crlf)
    return 1


def main():
    total = 0
    for tree in TREES:
        if not os.path.isdir(tree):
            print("skip (missing): %s" % tree)
            continue
        print("tree: %s" % tree)
        for lang in sorted(FAUCET_READY):
            p = os.path.join(tree, "assets", "js", "lang", "%s.js" % lang)
            if not os.path.exists(p):
                print("  ! missing %s" % p)
                continue
            n = patch_lang(p, lang)
            total += n
            print("  %-2s stk.faucet_ready  %s" % (lang, "fixed" if n else "ok"))
        p = os.path.join(tree, "about.html")
        if os.path.exists(p):
            n = patch_about(p)
            total += n
            print("  about.html            %s" % ("fixed" if n else "ok"))
    print("changes applied: %d" % total)
    return 0


if __name__ == "__main__":
    sys.exit(main())
