"""Site-wide head hardening: robots directive, self-referencing hreflang, richer titles.

Three changes, all idempotent (safe to re-run):

1. meta robots — every page carried canonical + OG + Twitter but no robots
   directive, so crawlers got no explicit max-image-preview / max-snippet grant.
   Added right after the viewport tag.

2. hreflang — the site ships English HTML with a client-side zh toggle, which is
   the definition of a self-referencing single-language page: hreflang="en" plus
   hreflang="x-default", both pointing at the page's own canonical URL. No
   hreflang="zh" is emitted because no zh URL exists; declaring one would point
   at a page Google cannot fetch in Chinese.

3. titles — five titles were 30-36 characters, which leaves most of the SERP
   line unused. They now name what the page actually contains (GPU node, 20M
   airdrop, v3.0) while staying inside the 65-character truncation band.

Run from anywhere; defaults to the website/ directory this tools/ folder lives in.
"""
import os
import re
import sys

WEB = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

PAGES = ["index.html", "news.html", "whitepaper.html", "tokenomics.html", "calculator.html",
         "compute.html", "ai-tools.html", "testnet.html", "stake.html", "airdrop.html",
         "about.html", "aup.html", "privacy.html", "barbarian-age.html",
         "barbarian-age-play.html", "game/index.html"]

ROBOTS = ('<meta name="robots" content="index, follow, max-image-preview:large, '
          'max-snippet:-1, max-video-preview:-1" />')

# key -> (en, zh). Five titles were 30-36 characters, which leaves most of the
# SERP line empty. They now name what the page actually contains while obeying
# the site's title contract: <= 60 chars, em-dash brand tail, never a pipe.
TITLES = {
    "meta.title_news": ("OMC News — Testnet & Airdrops — Omniverse Compute (OMC)",
                        "OMC 动态 — 测试网与空投 — Omniverse Compute (OMC)"),
    "meta.title_wp": ("Whitepaper v3.0 — Architecture — Omniverse Compute (OMC)",
                      "白皮书 v3.0 — 架构 — Omniverse Compute (OMC)"),
    "meta.title_tn": ("OMC Testnet — Run a GPU Node — Omniverse Compute (OMC)",
                      "OMC 测试网 — 运行 GPU 节点 — Omniverse Compute (OMC)"),
    "meta.title_stake": ("Stake tOMC — GPU Node Rewards — Omniverse Compute (OMC)",
                         "质押 tOMC — GPU 节点奖励 — Omniverse Compute (OMC)"),
    "meta.title_airdrop": ("OMC Airdrop — 20M OMC, 1M Slots — Omniverse Compute (OMC)",
                           "OMC 空投 — 2000 万 OMC、100 万名额 — Omniverse Compute (OMC)"),
}

for k, v in TITLES.items():
    if len(v[0]) > 60:
        raise SystemExit("title too long for a SERP: %s (%d)" % (v[0], len(v[0])))

changed = []


def rw(rel, fn):
    p = os.path.join(WEB, rel)
    if not os.path.exists(p):
        return
    with open(p, "r", encoding="utf-8") as f:
        src = f.read()
    out = fn(src)
    if out != src:
        with open(p, "w", encoding="utf-8", newline="") as f:
            f.write(out)
        changed.append(rel)


def add_head(src):
    """robots meta + hreflang pair."""
    if 'name="robots"' not in src:
        m = re.search(r'[ \t]*<meta name="viewport"[^>]*>\r?\n', src)
        if not m:
            raise SystemExit("viewport meta not found — refusing to guess placement")
        ind = re.match(r"[ \t]*", m.group(0)).group(0)
        src = src[:m.end()] + "%s%s\n" % (ind, ROBOTS) + src[m.end():]

    if "hreflang=" not in src:
        m = re.search(r'[ \t]*<link rel="canonical"[^>]*>\r?\n', src)
        if not m:
            raise SystemExit("canonical not found — refusing to guess placement")
        canon = re.search(r'href="([^"]*)"', m.group(0)).group(1)
        ind = re.match(r"[ \t]*", m.group(0)).group(0)
        lang = re.search(r'<html[^>]*\blang="([^"]*)"', src)
        lang = lang.group(1) if lang else "en"
        block = ('%s<link rel="alternate" hreflang="%s" href="%s" />\n'
                 '%s<link rel="alternate" hreflang="x-default" href="%s" />\n'
                 % (ind, lang, canon, ind, canon))
        src = src[:m.end()] + block + src[m.end():]
    return src


for rel in PAGES:
    rw(rel, add_head)

# --- titles: dictionaries first, then the static fallback text in each page ---
for fn, key in (("assets/js/lang/en.js", 0), ("assets/js/lang/zh.js", 1)):
    def patch(s, key=key):
        for k, v in TITLES.items():
            s = re.sub(r'("%s":\s*)"[^"]*"' % re.escape(k),
                       lambda m, v=v[key]: m.group(1) + '"%s"' % v, s)
        return s
    rw(fn, patch)

# The HTML carries a no-JS copy of the title in <title>, og:title and
# twitter:title. Driven by the i18n key rather than by the previous literal, so
# the script stays correct after the first run.
for rel in PAGES:
    def patch(s):
        for k, v in TITLES.items():
            en = v[0].replace("&", "&amp;")
            s = re.sub(r'(<title\b[^>]*data-i18n="%s"[^>]*>)[^<]*(</title>)' % re.escape(k),
                       lambda m, en=en: m.group(1) + en + m.group(2), s)
            s = re.sub(r'(<meta\b[^>]*data-i18n-content="%s"[^>]*\bcontent=")[^"]*(")' % re.escape(k),
                       lambda m, en=en: m.group(1) + en + m.group(2), s)
        return s
    rw(rel, patch)

print("changed %d files" % len(changed))
for c in changed:
    print("  " + c)
