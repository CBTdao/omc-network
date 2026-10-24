"""Cross-field consistency check: the same value stated several times in one
head must not disagree. Prints only the mismatches. Read-only."""
import html
import os
import re
import sys

PAGES = ["index", "news", "whitepaper", "tokenomics", "calculator", "compute",
         "ai-tools", "testnet", "stake", "airdrop", "about", "aup", "privacy"]
# barbarian-age / barbarian-age-play were retired from the web line (e912c6d)
# and no longer exist on disk — keeping them here only crashes the tool.
# default: the website/ directory this tools/ folder lives in
ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(p):
    return open(os.path.join(ROOT, p), "r", encoding="utf-8").read()


def one(s, pat, flags=0):
    m = re.search(pat, s, flags)
    return html.unescape(m.group(1).strip()) if m else ""


def meta(s, k):
    """Order-agnostic: find the <meta> tag carrying k, then read its content."""
    for tag in re.finditer(r"<meta\b[^>]*>", s):
        t = tag.group(0)
        if not re.search(r'(?:name|property)="%s"' % re.escape(k), t):
            continue
        m = re.search(r'(?<![\w-])content="([^"]*)"', t)
        return html.unescape(m.group(1).strip()) if m else ""
    return ""


def head(s):
    m = re.search(r"<head>(.*?)</head>", s, re.S)
    return m.group(1) if m else ""


REF = "https://omc.network"
print("=" * 96)
print("CROSS-FIELD CONSISTENCY (only mismatches printed)")
print("=" * 96)

for p in PAGES:
    f = "index.html" if p == "index" else p + ".html"
    s = read(f)
    h = head(s)
    t = one(s, r"<title[^>]*>(.*?)</title>", re.S)
    d = meta(h, "description")
    ogt = meta(h, "og:title")
    ogd = meta(h, "og:description")
    twt = meta(h, "twitter:title")
    twd = meta(h, "twitter:description")
    can = one(s, r'<link rel="canonical" href="([^"]*)"')
    ogu = meta(h, "og:url")
    ogg = meta(h, "og:image")
    twi = meta(h, "twitter:image")
    problems = []

    if ogt != t:
        problems.append("og:title != <title>\n        title : %s\n        og    : %s" % (t, ogt))
    if twt != ogt:
        problems.append("twitter:title != og:title\n        og    : %s\n        twitter: %s" % (ogt, twt))
    if ogd != d:
        problems.append("og:description != meta description\n        meta  : %s\n        og    : %s" % (d, ogd))
    if twd != ogd:
        problems.append("twitter:description != og:description\n        og    : %s\n        twitter: %s" % (ogd, twd))
    if ogu != can:
        problems.append("og:url != canonical (%s vs %s)" % (ogu, can))
    if twi != ogg:
        problems.append("twitter:image != og:image (%s vs %s)" % (twi, ogg))
    if can and can != REF + "/" and can.endswith("/"):
        problems.append("canonical has a trailing slash: %s" % can)
    if can and can.endswith(".html"):
        problems.append("canonical carries .html: %s" % can)
    if not can:
        problems.append("no canonical")

    # absolute-URL sanity for the image
    if ogg and not ogg.startswith("https://"):
        problems.append("og:image is not absolute: %s" % ogg)

    if problems:
        print("\n%-12s" % p)
        for x in problems:
            print("    - %s" % x)

print("\n" + "=" * 96)
print("SITEMAP vs PAGES")
print("=" * 96)
sm = read("sitemap.xml")
locs = re.findall(r"<loc>([^<]+)</loc>", sm)
lastmods = re.findall(r"<lastmod>([^<]+)</lastmod>", sm)
pris = re.findall(r"<priority>([^<]+)</priority>", sm)
want = set([REF + "/"] + [REF + "/" + p for p in PAGES if p != "index"])
got = set(locs)
print("in sitemap, not a page :", sorted(got - want) or "(none)")
print("a page, not in sitemap :", sorted(want - got) or "(none)")
print("lastmod values         :", sorted(set(lastmods)))
print("priority values        :", sorted(set(pris)))
print("count                  :", len(locs), "urls /", len(PAGES), "pages")

print("\n" + "=" * 96)
print("LLMS.TXT vs PAGES")
print("=" * 96)
ll = read("llms.txt")
for p in PAGES:
    u = REF + "/" if p == "index" else REF + "/" + p
    if u not in ll:
        print("  missing from llms.txt:", u)
print("  (done)")

print("\n" + "=" * 96)
print("H1 + LENGTH OUTLIERS")
print("=" * 96)
for p in PAGES:
    f = "index.html" if p == "index" else p + ".html"
    s = read(f)
    h1 = re.findall(r"<h1[^>]*>(.*?)</h1>", s, re.S)
    t = one(s, r"<title[^>]*>(.*?)</title>", re.S)
    d = meta(head(s), "description")
    notes = []
    if len(h1) != 1:
        notes.append("h1 count = %d" % len(h1))
    if len(t) > 60:
        notes.append("title %d chars (>60, may truncate)" % len(t))
    if len(t) < 30:
        notes.append("title %d chars (<30, thin)" % len(t))
    if len(d) > 160:
        notes.append("desc %d chars (>160, may truncate)" % len(d))
    if len(d) < 110:
        notes.append("desc %d chars (<110, thin)" % len(d))
    if notes:
        print("  %-12s %s" % (p, "; ".join(notes)))
