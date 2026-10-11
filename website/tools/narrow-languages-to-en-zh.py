#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Narrow the main site to English + Chinese only.

Before: en, zh, ja, es, ko, pt, fr (7 dictionaries, 7 switcher options)
After:  en, zh                     (2 dictionaries, 2 switcher options)

The two sibling sites (top.omc.network, forum.omc.network) were already
bilingual, so this brings the main site in line with them and roughly halves
the translation surface that has to stay in sync on every copy change.

Touches, in both the deployment tree and the mirror tree:
  - assets/js/i18n.js              SUPPORTED list + header comment
  - *.html (12 files)              the <select id="langSelect"> options
  - assets/js/airdrop-stats.js     language -> BCP-47 locale map
  - assets/js/news.js              language -> BCP-47 locale map
  - assets/js/lang/{ja,es,ko,pt,fr}.js   deleted from the working tree

Idempotent and line-ending preserving.
"""

import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TREES = [
    ROOT,
    os.path.normpath(os.path.join(ROOT, "..", "..", "omc-website")),
]

DROP = ["ja", "es", "ko", "pt", "fr"]
KEEP = ["en", "zh"]

HTMLS = [
    "index.html", "whitepaper.html", "testnet.html", "airdrop.html",
    "news.html", "about.html", "privacy.html", "aup.html",
    "calculator.html", "stake.html", "compute.html", "ai-tools.html",
]


def load(path):
    with open(path, "rb") as fh:
        raw = fh.read()
    crlf = b"\r\n" in raw
    return raw.decode("utf-8").replace("\r\n", "\n"), crlf


def save(path, text, crlf):
    out = text.replace("\n", "\r\n") if crlf else text
    with open(path, "wb") as fh:
        fh.write(out.encode("utf-8"))


def patch_i18n(path):
    text, crlf = load(path)
    orig = text
    text = text.replace(
        "Dictionaries: assets/js/lang/{en,zh,ja,es,ko,pt,fr}.js",
        "Dictionaries: assets/js/lang/{en,zh}.js")
    text = text.replace(
        'var SUPPORTED = ["en", "zh", "ja", "es", "ko", "pt", "fr"];',
        'var SUPPORTED = ["en", "zh"];')
    if text == orig:
        return 0
    save(path, text, crlf)
    return 1


OPT_RE = re.compile(
    r'^[ \t]*<option value="(?:ja|es|ko|pt|fr)">[^<]*</option>[ \t]*\r?\n',
    re.M)

# the dictionaries are loaded with plain <script src> tags, so the dropped
# ones have to be removed from the markup too or every page 404s on them
SCRIPT_RE = re.compile(
    r'^[ \t]*<script src="assets/js/lang/(?:ja|es|ko|pt|fr)\.js"></script>[ \t]*\r?\n',
    re.M)


def patch_html(path):
    text, crlf = load(path)
    new, n = OPT_RE.subn("", text)
    new, m = SCRIPT_RE.subn("", new)
    if n == 0 and m == 0:
        return 0
    save(path, new, crlf)
    return n + m


LOCALE_TAIL = re.compile(
    r',\s*ja:\s*"[^"]*"'
    r',\s*es:\s*"[^"]*"'
    r',\s*ko:\s*"[^"]*"'
    r',\s*pt:\s*"[^"]*"'
    r',\s*fr:\s*"[^"]*"')


def patch_locale_map(path):
    text, crlf = load(path)
    new, n = LOCALE_TAIL.subn("", text)
    if n == 0:
        return 0
    save(path, new, crlf)
    return n


def main():
    changes = 0
    for tree in TREES:
        if not os.path.isdir(tree):
            print("skip (missing): %s" % tree)
            continue
        print("tree: %s" % tree)

        p = os.path.join(tree, "assets", "js", "i18n.js")
        n = patch_i18n(p)
        changes += n
        print("  i18n.js                %s" % ("updated" if n else "ok"))

        for h in HTMLS:
            p = os.path.join(tree, h)
            if not os.path.exists(p):
                print("  ! missing %s" % h)
                continue
            n = patch_html(p)
            changes += n
            print("  %-22s %s" % (h, ("%d tags removed" % n) if n else "ok"))

        for rel in ["assets/js/airdrop-stats.js", "assets/js/news.js"]:
            p = os.path.join(tree, rel)
            n = patch_locale_map(p)
            changes += n
            print("  %-22s %s" % (os.path.basename(rel), "trimmed" if n else "ok"))

        for lang in DROP:
            p = os.path.join(tree, "assets", "js", "lang", "%s.js" % lang)
            if os.path.exists(p):
                os.remove(p)
                print("  removed lang/%s.js" % lang)

    print("changes applied: %d" % changes)
    return 0


if __name__ == "__main__":
    sys.exit(main())
