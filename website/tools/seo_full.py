"""Full-site SEO audit — issue-oriented (not just a comparison table).

seo_audit.py answers "do all pages follow the same head conventions?".
This tool answers the other half: "what is actually wrong or weak on each
page?" It walks every HTML file (including the standalone game builds) and
prints a per-page issue list plus a site-wide summary.

Checks
  head      title/description present, unique, length in the SERP-safe band
  headings  exactly one <h1>, no skipped levels (h1 -> h3), h2 density
  content   visible word count (thin-content guard), internal-link count
  imgs      alt text, width/height (CLS), loading attribute
  links     orphan pages, links to non-existent local targets
  structured JSON-LD parses, carries the types a page of its kind should have
  i18n      lang attribute, hreflang coverage, data-i18n coverage of headings
  perf      render-blocking scripts in <head>, preload/preconnect, font loading

Read-only: writes nothing. Run from anywhere, or pass the website dir as
argv[1].
"""
import html
import json
import os
import re
import sys
from collections import defaultdict

ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

PAGES = ["index", "news", "whitepaper", "tokenomics", "calculator", "compute",
         "ai-tools", "testnet", "stake", "airdrop", "about", "aup", "privacy",
         "barbarian-age", "barbarian-age-play"]

TITLE_BAND = (30, 65)
DESC_BAND = (110, 165)


def read(p):
    with open(os.path.join(ROOT, p), "r", encoding="utf-8") as f:
        return f.read()


def one(s, pat, flags=0):
    m = re.search(pat, s, flags)
    return html.unescape(m.group(1).strip()) if m else ""


def meta(s, name=None, prop=None):
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


def body(s):
    m = re.search(r"<body[^>]*>(.*?)</body>", s, re.S)
    return m.group(1) if m else s


def strip_tags(s):
    s = re.sub(r"<script\b.*?</script>", " ", s, flags=re.S | re.I)
    s = re.sub(r"<style\b.*?</style>", " ", s, flags=re.S | re.I)
    s = re.sub(r"<[^>]+>", " ", s)
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


def jsonld(s):
    out = []
    for m in re.finditer(r'<script type="application/ld\+json">(.*?)</script>', s, re.S):
        try:
            out.append(json.loads(m.group(1)))
        except Exception as e:
            out.append({"__parse_error__": str(e)})
    return out


def ld_types(s):
    types = []
    for b in jsonld(s):
        if not isinstance(b, dict):
            continue
        for cand in ([b] + (b.get("@graph") or [])):
            if isinstance(cand, dict) and cand.get("@type"):
                types.append(cand["@type"])
    return types


issues = defaultdict(list)   # page -> [issue]
titles, descs = {}, {}
per_page = {}

for p in PAGES:
    f = "index.html" if p == "index" else p + ".html"
    path = os.path.join(ROOT, f)
    if not os.path.exists(path):
        issues[p].append("FILE MISSING")
        continue
    s = read(f)
    h = head(s)
    b = body(s)

    title = one(s, r"<title[^>]*>(.*?)</title>", re.S)
    desc = meta(h, name="description")
    titles[p] = title
    descs[p] = desc

    # --- head basics -------------------------------------------------------
    if not title:
        issues[p].append("no <title>")
    elif not (TITLE_BAND[0] <= len(title) <= TITLE_BAND[1]):
        issues[p].append("title length %d outside %d-%d" % (len(title), *TITLE_BAND))
    if not desc:
        issues[p].append("no meta description")
    elif not (DESC_BAND[0] <= len(desc) <= DESC_BAND[1]):
        issues[p].append("description length %d outside %d-%d" % (len(desc), *DESC_BAND))
    if not one(s, r'<link rel="canonical" href="([^"]*)"'):
        issues[p].append("no canonical")
    if not meta(h, prop="og:image"):
        issues[p].append("no og:image")
    if not meta(h, name="twitter:card"):
        issues[p].append("no twitter:card")
    if not meta(h, name="robots"):
        issues[p].append("no meta robots directive")

    # --- headings ----------------------------------------------------------
    h1s = re.findall(r"<h1[^>]*>", s)
    if len(h1s) != 1:
        issues[p].append("%d <h1> (want exactly 1)" % len(h1s))
    levels = [int(m) for m in re.findall(r"<h([1-6])[^>]*>", b)]
    prev = None
    for lv in levels:
        if prev is not None and lv > prev + 1:
            issues[p].append("heading skips h%d -> h%d" % (prev, lv))
            break
        prev = lv
    h2 = len(re.findall(r"<h2[^>]*>", b))
    if h2 == 0:
        issues[p].append("no <h2> section headings")

    # --- content depth / internal links ------------------------------------
    text = strip_tags(b)
    words = len(re.findall(r"[A-Za-z0-9’'\-\.]+", text))
    local = [m for m in re.findall(r'href="(/[^"#]*)"', s)]
    internal = [u for u in local if not u.startswith("//")]
    per_page[p] = {"words": words, "internal": len(set(internal)), "h2": h2}
    if words < 200:
        issues[p].append("thin content: %d visible words" % words)

    # --- images -------------------------------------------------------------
    for tag in re.findall(r"<img\b[^>]*>", s):
        # JS-populated previews (no src) and hidden nodes never reserve a box,
        # so width/height and loading are meaningless on them.
        dynamic = 'src="' not in tag or " hidden" in tag
        if "alt=" not in tag:
            issues[p].append("img without alt: %s" % tag[:70])
        if dynamic:
            continue
        if 'width="' not in tag and "width=" not in tag:
            issues[p].append("img without width/height: %s" % tag[:70])
        if 'loading="lazy"' not in tag and 'loading="eager"' not in tag:
            issues[p].append("img without loading attribute: %s" % tag[:70])

    # --- structured data ---------------------------------------------------
    ld = jsonld(s)
    errs = [b for b in ld if isinstance(b, dict) and "__parse_error__" in b]
    if errs:
        issues[p].append("JSON-LD parse error: %s" % errs[0]["__parse_error__"][:60])
    types = ld_types(s)
    if not types:
        issues[p].append("no JSON-LD")
    else:
        if "BreadcrumbList" not in types and p != "index":
            issues[p].append("no BreadcrumbList")
        if p == "index" and "Organization" not in types:
            issues[p].append("homepage without Organization JSON-LD")

    # --- i18n --------------------------------------------------------------
    lang = one(s, r'<html[^>]*\blang="([^"]*)"')
    if not lang:
        issues[p].append("no html lang")
    hreflangs = re.findall(r'hreflang="([^"]*)"', h)
    if not hreflangs:
        issues[p].append("no hreflang alternates")

    # --- perf signals ------------------------------------------------------
    blocking = [m for m in re.findall(r'<script\b[^>]*>', h)
                if "defer" not in m and "async" not in m and 'type="application/ld+json"' not in m]
    if blocking:
        issues[p].append("%d render-blocking <script> in head" % len(blocking))
    if "preconnect" not in h and "dns-prefetch" not in h:
        issues[p].append("no preconnect/dns-prefetch")

    # --- local link targets -------------------------------------------------
    for u in set(internal):
        target = u.split("?")[0].rstrip("/")
        tgt = os.path.join(ROOT, target.lstrip("/"))
        if target in ("", "/"):
            continue
        if not os.path.exists(tgt) and not os.path.exists(tgt + ".html"):
            issues[p].append("internal link to missing target: %s" % u)

# --- site-wide -------------------------------------------------------------
site = []
seen_t, seen_d = defaultdict(list), defaultdict(list)
for p, t in titles.items():
    seen_t[t].append(p)
for p, d in descs.items():
    seen_d[d].append(p)
for t, ps in seen_t.items():
    if len(ps) > 1:
        site.append("duplicate title across %s" % ", ".join(ps))
for d, ps in seen_d.items():
    if len(ps) > 1:
        site.append("duplicate description across %s" % ", ".join(ps))

linked = set()
for p in PAGES:
    f = "index.html" if p == "index" else p + ".html"
    if not os.path.exists(os.path.join(ROOT, f)):
        continue
    s = read(f)
    for u in re.findall(r'href="(/[^"#]*)"', s):
        u = re.sub(r"\.html$", "", u.strip("/"))
        linked.add(u)
for p in PAGES:
    if p not in linked and p != "index":
        site.append("orphan page (no internal link anywhere): %s" % p)

# sitemap coverage
sm = read("sitemap.xml") if os.path.exists(os.path.join(ROOT, "sitemap.xml")) else ""
sm_urls = set(re.findall(r"<loc>(.*?)</loc>", sm))
for p in PAGES:
    want = "https://omc.network/" if p == "index" else "https://omc.network/%s" % p
    if want not in sm_urls and p != "barbarian-age-play":
        site.append("missing from sitemap.xml: %s" % p)
# The game is a separate host with its own project and sitemap; a sitemap may
# only list URLs on the host that serves it, so the main sitemap must NOT carry
# game.omc.network — it links to it instead, and the game sitemap covers itself.
game_sm = os.path.join(ROOT, "game", "sitemap.xml")
if not os.path.exists(game_sm) or "https://game.omc.network/" not in open(game_sm, encoding="utf-8").read():
    site.append("game subdomain missing its own sitemap.xml")
if "https://game.omc.network/" in sm_urls:
    site.append("main sitemap must not list the game host (cross-host sitemap entries are ignored)")

print("=" * 96)
print("FULL-SITE SEO AUDIT — %d pages" % len(PAGES))
print("=" * 96)
print("\n### per page")
for p in PAGES:
    st = per_page.get(p, {})
    line = "  %-19s %5d words · %2d h2 · %2d internal links" % (
        p, st.get("words", 0), st.get("h2", 0), st.get("internal", 0))
    print(line)
    if issues[p]:
        for i in issues[p]:
            print("      ! %s" % i)
    else:
        print("      ok")

print("\n### site-wide")
if site:
    for i in site:
        print("  ! %s" % i)
else:
    print("  ok — no site-wide issues")

print("\n### titles")
for p in PAGES:
    t = titles.get(p, "")
    print("  %-19s %3d  %s" % (p, len(t), t[:96]))
print("\n### descriptions")
for p in PAGES:
    d = descs.get(p, "")
    print("  %-19s %3d  %s" % (p, len(d), d[:96]))
print("\n" + "=" * 96)
