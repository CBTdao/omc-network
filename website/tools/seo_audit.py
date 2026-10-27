"""Read-only SEO audit across the 13 site pages.

Extracts every head-level signal that Google or a Binance reviewer reads, and
prints it as one aligned table per field so drift between pages is visible at a
glance. Writes nothing.

Two markers appear next to a field that is not identical on all 13 pages:
  <-- varies by design   the field describes the page itself, so a difference
                         is correct (a shared title would be the bug)
  <-- DIVERGES           a site-wide convention drifted on some page — a fix
The last line lists every DIVERGES field, which is the only thing to act on.

Run with no arguments from anywhere; the target defaults to the website/
directory this tools/ folder lives in, or pass one as argv[1].
"""
import html
import json
import os
import re
import sys

PAGES = ["index", "news", "whitepaper", "tokenomics", "calculator", "compute",
         "ai-tools", "testnet", "stake", "airdrop", "about", "aup", "privacy"]
# /barbarian-age and /barbarian-age-play were retired from the web line
# (commit e912c6d): the RTS no longer ships here, the game subdomain now runs
# "Real or AI" instead. They are gone from disk, so auditing them would just
# crash the tool — verify-site.js walks every HTML file on disk anyway.
# /barbarian-age-play is deliberately not audited here: it is the standalone
# playable game build (own chrome, no i18n engine, lang="zh-CN"), so it falls
# outside this tool's "site-wide convention" comparison. It is still covered by
# verify-site.js, whose head/JSON-LD assertions walk every HTML file, and it is
# listed in sitemap.xml + llms.txt so the desktop build can be discovered.

# default: the website/ directory this tools/ folder lives in
ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(p):
    with open(os.path.join(ROOT, p), "r", encoding="utf-8") as f:
        return f.read()


def one(s, pat, flags=0):
    m = re.search(pat, s, flags)
    return html.unescape(m.group(1).strip()) if m else ""


def meta(s, name=None, prop=None):
    """Order-agnostic: find the <meta> tag carrying the key, read real content."""
    key = 'name="%s"' % name if name else 'property="%s"' % prop
    for tag in re.finditer(r"<meta\b[^>]*>", s):
        t = tag.group(0)
        if not re.search(re.escape(key), t):
            continue
        m = re.search(r'(?<![\w-])content="([^"]*)"', t)
        return html.unescape(m.group(1).strip()) if m else ""
    return ""


def head(s):
    m = re.search(r"<head>(.*?)</head>", s, re.S)
    return m.group(1) if m else ""


def jsonld(s):
    out = []
    for m in re.finditer(r'<script type="application/ld\+json">(.*?)</script>', s, re.S):
        try:
            out.append(json.loads(m.group(1)))
        except Exception as e:
            out.append({"__parse_error__": str(e)})
    return out


rows = {}
for p in PAGES:
    f = "index.html" if p == "index" else p + ".html"
    s = read(f)
    h = head(s)
    ld = jsonld(s)
    types = []
    for b in ld:
        if isinstance(b, dict):
            g = b.get("@graph")
            if isinstance(g, list):
                types += [x.get("@type") for x in g if isinstance(x, dict)]
            else:
                types.append(b.get("@type"))
    org = {}
    for b in ld:
        if not isinstance(b, dict):
            continue
        for cand in ([b] + (b.get("@graph") or [])):
            if isinstance(cand, dict) and cand.get("@type") == "Organization":
                org = cand
    bc = None
    for b in ld:
        if not isinstance(b, dict):
            continue
        for cand in ([b] + (b.get("@graph") or [])):
            if isinstance(cand, dict) and cand.get("@type") == "BreadcrumbList":
                bc = cand
    h1 = re.findall(r"<h1[^>]*>(.*?)</h1>", s, re.S)
    h1 = [re.sub(r"\s+", " ", re.sub(r"<br\s*/?>|</?[a-z][^>]*>", " ", x)).strip() for x in h1]
    h1_raw = re.findall(r"<h1[^>]*>", s)

    rows[p] = {
        "lang": one(s, r'<html[^>]*\blang="([^"]*)"'),
        "title": one(s, r"<title[^>]*>(.*?)</title>", re.S),
        "title_i18n": one(s, r'<title data-i18n="([^"]*)"'),
        "desc_i18n": one(s, r'<meta name="description" data-i18n="([^"]*)"'),
        "desc_len": len(meta(h, name="description")),
        "title_len": len(one(s, r"<title[^>]*>(.*?)</title>", re.S)),
        "hreflang": ", ".join(re.findall(r'hreflang="([^"]*)"', h)) or "(none)",
        "og_url_vs_canonical": "same" if meta(h, prop="og:url") == one(s, r'<link rel="canonical" href="([^"]*)"') else "DIFFERENT",
        "desc": meta(h, name="description"),
        "canonical": one(s, r'<link rel="canonical" href="([^"]*)"'),
        "og:title": meta(h, prop="og:title"),
        "og:desc": meta(h, prop="og:description"),
        "og:url": meta(h, prop="og:url"),
        "og:image": meta(h, prop="og:image"),
        "og:type": meta(h, prop="og:type"),
        "og:site": meta(h, prop="og:site_name"),
        "og:locale": meta(h, prop="og:locale"),
        "tw:card": meta(h, name="twitter:card"),
        "tw:title": meta(h, name="twitter:title"),
        "tw:desc": meta(h, name="twitter:description"),
        "tw:image": meta(h, name="twitter:image"),
        "tw:site": meta(h, name="twitter:site"),
        "robots": meta(h, name="robots"),
        "theme": meta(h, name="theme-color"),
        "viewport": meta(h, name="viewport"),
        "ld_types": ", ".join([t for t in types if t]),
        "ld_blocks": len(ld),
        "ld_parse_errors": sum(1 for b in ld if isinstance(b, dict) and "__parse_error__" in b),
        "org_name": org.get("name", ""),
        "org_url": org.get("url", ""),
        "org_logo": (org.get("logo") if isinstance(org.get("logo"), str)
                     else (org.get("logo") or {}).get("url", "") if isinstance(org.get("logo"), dict) else ""),
        "bc_first": ((bc or {}).get("itemListElement") or [{}])[0].get("name", "") if bc else "",
        "bc_last": ((bc or {}).get("itemListElement") or [{}])[-1].get("name", "") if bc else "",
        "bc_len": len((bc or {}).get("itemListElement") or []) if bc else 0,
        "h1_count": len(h1),
        "h1": h1[0] if h1 else "",
        "h1_tag": h1_raw[0] if h1_raw else "(none)",
        "imgs": len(re.findall(r"<img\b", s)),
        "imgs_noalt": len([m for m in re.findall(r"<img\b[^>]*>", s) if "alt=" not in m]),
    }

FIELDS = ["lang", "title", "title_len", "title_i18n", "desc", "desc_len", "desc_i18n",
          "canonical", "og:title", "og:desc", "og:url", "og:image",
          "og:type", "og:site", "og:locale", "tw:card", "tw:title", "tw:desc", "tw:image",
          "tw:site", "robots", "theme", "viewport", "hreflang", "og_url_vs_canonical",
          "ld_types", "ld_blocks", "ld_parse_errors",
          "org_name", "org_url", "org_logo", "bc_first", "bc_last", "bc_len",
          "h1_count", "h1", "h1_tag", "imgs", "imgs_noalt"]

# These describe the page itself, so they are SUPPOSED to differ — e.g. two
# pages that share a title are the bug, not the reverse. Everything outside this
# set is a site-wide convention, so a divergence there is a real find: it means
# the convention drifted on some page while the others kept it.
PAGE_SPECIFIC = {
    "title", "title_len", "title_i18n", "desc", "desc_len", "desc_i18n",
    "canonical", "og:title", "og:desc", "og:url", "tw:title", "tw:desc",
    "h1", "h1_tag", "imgs",
    "bc_first", "bc_last", "bc_len", "ld_types", "ld_blocks",
    # hreflang differs on purpose: only the batch-1 pages have a /zh/ mirror
    # (website/tools/build_zh.py) and therefore a zh alternate.
    "hreflang",
}

print("=" * 100)
print("SEO AUDIT — 13 pages, repo/website")
print("=" * 100)
diverged = []
for f in FIELDS:
    vals = {p: rows[p][f] for p in PAGES}
    uniq = sorted(set(str(v) for v in vals.values()))
    if len(uniq) == 1:
        flag = ""
    elif f in PAGE_SPECIFIC:
        flag = "  <-- varies by design (page-specific)"
    else:
        flag = "  <-- DIVERGES"
        diverged.append(f)
    print("\n### %s%s" % (f, flag))
    if len(uniq) == 1:
        print("    all: %s" % (uniq[0][:220] if uniq[0] else "(empty)"))
    else:
        for p in PAGES:
            print("    %-11s %s" % (p, str(vals[p])[:200]))

print("\n" + "=" * 100)
if diverged:
    print("DIVERGENCES NEEDING A FIX: %s" % ", ".join(diverged))
else:
    print("No divergence outside the page-specific set: every site-wide convention holds on all %d pages." % len(PAGES))
print("=" * 100)
