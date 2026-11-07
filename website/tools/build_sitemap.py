#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Rebuild website/sitemap.xml from the pages that actually exist.

The old sitemap was a hand-written list. It was correct on the day it was
written and then quietly went stale: content posts arrived every day, the
`lastmod` values stayed in October, and a crawler reading the file concluded
that nothing had changed for a week. A sitemap is only a hint, but a hint that
is visibly wrong is worse than no hint at all.

This script discovers indexable pages from the filesystem, pairs each English
page with its Chinese mirror for hreflang, and takes `lastmod` from the
`dateModified` that inject_facts.py stamps into the page's WebPage JSON-LD
(falling back to the file's last git commit date). Run it at the END of the
build chain, after inject_facts.py, so the dates are the ones actually on the
pages.

    python website/tools/build_sitemap.py          # rewrite sitemap.xml
    python website/tools/build_sitemap.py --check  # exit 1 if stale

`--check` is what the guard test and CI use. It never writes.
"""

import re
import subprocess
import sys
from datetime import date
from pathlib import Path

WEB = Path(__file__).resolve().parent.parent
ROOT = WEB.parent
ORIGIN = "https://omc.network"
SITEMAP = WEB / "sitemap.xml"

DATE_RE = re.compile(r'"dateModified"\s*:\s*"(\d{4}-\d{2}-\d{2})')
LOC_RE = re.compile(r"<loc>([^<]+)</loc>\s*<lastmod>[^<]*</lastmod>\s*<priority>([^<]+)</priority>")


def url_for(rel: str) -> str:
    """Match seo-audit.mjs and Vercel's cleanUrls + trailingSlash:false."""
    rel = rel.replace("\\", "/")
    is_zh = rel.startswith("zh/")
    if is_zh:
        rel = rel[len("zh/"):]
    if rel == "index.html":
        return ORIGIN + ("/zh" if is_zh else "/")
    path = "/" + rel[:-len(".html")]
    if path.endswith("/index"):
        path = path[:-len("/index")]
    return ORIGIN + ("/zh" if is_zh else "") + path


def discover():
    """[(rel, url, is_zh)] for every indexable page on the apex host."""
    out = []
    groups = [
        ("", sorted(WEB.glob("*.html"))),
        ("news/", sorted((WEB / "news").glob("*.html"))),
        ("zh/", sorted((WEB / "zh").glob("*.html"))),
        ("zh/news/", sorted((WEB / "zh" / "news").glob("*.html"))),
    ]
    for prefix, files in groups:
        for p in files:
            rel = prefix + p.name
            if p.name == "404.html":
                continue
            text = p.read_text(encoding="utf-8", errors="replace")
            # A page that opts out of indexing must never be advertised here.
            if re.search(r'<meta[^>]+name="robots"[^>]+content="[^"]*noindex', text, re.I):
                continue
            out.append((rel, url_for(rel), rel.startswith("zh/"), text))
    return out


def zh_partner(rel: str):
    """Filesystem path of the Chinese mirror of an English page, if it exists."""
    if rel.startswith("zh/"):
        return None
    if rel == "index.html":
        return "zh/index.html"
    if rel.startswith("news/"):
        return "zh/" + rel
    return "zh/" + rel


def previous_priorities():
    """Keep the editorial priority values that were chosen by hand."""
    if not SITEMAP.exists():
        return {}
    text = SITEMAP.read_text(encoding="utf-8")
    return {m.group(1): m.group(2) for m in LOC_RE.finditer(text)}


def git_date(rel: str):
    try:
        r = subprocess.run(
            ["git", "log", "-1", "--format=%cs", "--", f"website/{rel}"],
            cwd=ROOT, capture_output=True, text=True, timeout=10,
        )
        value = r.stdout.strip()
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
            return value
    except (OSError, subprocess.SubprocessError):
        pass
    return None


def lastmod(text: str, rel: str) -> str:
    m = DATE_RE.search(text)
    if m:
        return m.group(1)
    return git_date(rel) or date.today().isoformat()


def build() -> str:
    pages = discover()
    by_rel = {rel: (url, text) for rel, url, _, text in pages}
    priorities = previous_priorities()

    # Home first, then the rest in a stable order: English pages, then mirrors.
    en = [p for p in pages if not p[2]]
    zh = [p for p in pages if p[2]]
    def sort_key(row):
        return (0 if row[0] == "index.html" else 1, row[1])
    ordered = sorted(en, key=sort_key) + sorted(zh, key=sort_key)

    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
        '       xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ]
    for rel, url, is_zh, text in ordered:
        partner = None if is_zh else zh_partner(rel)
        en_url = url if not is_zh else url.replace(ORIGIN + "/zh", ORIGIN, 1) or ORIGIN + "/"
        zh_url = None
        if partner and partner in by_rel:
            zh_url = by_rel[partner][0]
        if is_zh:
            en_url = url_for(rel[len("zh/"):])
            zh_url = url
        priority = priorities.get(url, "0.7")
        links = (
            f'<xhtml:link rel="alternate" hreflang="en" href="{en_url}"/>'
            f'<xhtml:link rel="alternate" hreflang="x-default" href="{en_url}"/>'
        )
        if zh_url:
            links += f'<xhtml:link rel="alternate" hreflang="zh" href="{zh_url}"/>'
        lines.append(
            f"  <url><loc>{url}</loc><lastmod>{lastmod(text, rel)}</lastmod>"
            f"<priority>{priority}</priority>{links}</url>"
        )
    lines.append("</urlset>")
    return "\n".join(lines) + "\n"


def main(argv):
    check = "--check" in argv
    content = build()
    old = SITEMAP.read_text(encoding="utf-8") if SITEMAP.exists() else None
    if old == content:
        print("sitemap.xml is current (%d urls)" % content.count("<loc>"))
        return 0
    if check:
        print("STALE (run: python website/tools/build_sitemap.py)")
        print("  website/sitemap.xml")
        return 1
    SITEMAP.write_text(content, encoding="utf-8")
    print("wrote website/sitemap.xml (%d urls)" % content.count("<loc>"))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
