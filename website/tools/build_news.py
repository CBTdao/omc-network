# -*- coding: utf-8 -*-
"""Render the news list into static HTML and publish RSS feeds.

  python website/tools/build_news.py           # rewrite the list + both feeds
  python website/tools/build_news.py --check   # exit 1 if anything is stale

Why this exists
---------------
`assets/js/news.js` builds the list from `assets/data/news.js` in the browser.
Search crawlers and answer engines mostly do not run it: without JavaScript the
page showed one pinned card and nothing else, so ten months of posts were
invisible to the exact readers we are trying to reach. The list is now rendered
at build time from the same data file, and news.js keeps working unchanged for
the filter chips (it replaces the same markup it would have produced).

Dates are text, not a format string, so they cannot be localised by the i18n
runtime (Intl only runs in the browser). That makes the Chinese page dependent
on this script running *after* build_zh.py, which is why --check verifies the
day/month strings as well as the posts.

Order matters, and it is the same order as the other stampers:

    build_zh.py -> build_announcement.py / build_press.py
                -> build_news.py -> build_llms_full.py -> inject_facts.py
"""

import html
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from email.utils import format_datetime
from pathlib import Path

WEB = Path(__file__).resolve().parent.parent
NEWS_DATA = WEB / "assets" / "data" / "news.js"
LANG_EN = WEB / "assets" / "js" / "lang" / "en.js"
LANG_ZH = WEB / "assets" / "js" / "lang" / "zh.js"
ORIGIN = "https://omc.network"

BEGIN = "<!-- NEWS_LIST:BEGIN -->"
END = "<!-- NEWS_LIST:END -->"
LATEST_BEGIN = "<!-- NEWS_LATEST:BEGIN -->"
LATEST_END = "<!-- NEWS_LATEST:END -->"

KIND_KEY = {"dev": "nw.dev", "airdrop": "nw.airdrop", "eco": "nw.eco", "gov": "nw.gov", "vo": "nw.vo"}
MONTH_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


# ---------------------------------------------------------------------------
# data
# ---------------------------------------------------------------------------

def load_dict(path, lang):
    """Read one language out of the browser dictionary.

    The files assign window.I18N.<lang>, so the object comes back wrapped —
    reading if off as if it were the flat dictionary silently yields one key.
    """
    out = subprocess.run(
        ["node", "-e",
         "global.window={};require(process.argv[1]);"
         "process.stdout.write(JSON.stringify(window.I18N[process.argv[2]]))",
         str(path), lang],
        capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def load_posts():
    """Parse assets/data/news.js.

    The file is a hand-edited JS array with comments, so it is read with a
    brace-depth scan and a key/value regex rather than json.loads. Requiring a
    JSON copy alongside it would create two sources of truth for the one file a
    human edits by hand.
    """
    src = NEWS_DATA.read_text(encoding="utf-8")
    start = src.index("[")
    body = src[start:]
    posts, depth, buf = [], 0, ""
    for ch in body:
        if ch == "{":
            depth += 1
            if depth == 1:
                buf = ""
                continue
        if ch == "}":
            depth -= 1
            if depth == 0:
                posts.append(parse_object(buf))
                continue
        if depth >= 1:
            buf += ch
    return posts


def parse_object(chunk):
    chunk = re.sub(r"/\*[\s\S]*?\*/", "", chunk)
    # (?<!:) keeps "https://…" alive. A plain // comment strip chews the value
    # of every external href and the item then parses without an href at all.
    chunk = re.sub(r"(?<!:)//[^\n]*", "", chunk)
    out = {}
    for m in re.finditer(r'(\w+)\s*:\s*"((?:[^"\\]|\\.)*)"', chunk):
        out[m.group(1)] = m.group(2).encode().decode("unicode_escape") if "\\" in m.group(2) else m.group(2)
    for m in re.finditer(r"(\w+)\s*:\s*(true|false)", chunk):
        out[m.group(1)] = m.group(2) == "true"
    return out


# ---------------------------------------------------------------------------
# urls
# ---------------------------------------------------------------------------

def resolve_href(href, lang):
    """Return (url, is_external) with the page's relative hrefs made absolute.

    Relative hrefs like "testnet.html" are fine in the browser and meaningless
    in an RSS reader, and the Chinese list has to point at /zh/ screens — but
    only where a Chinese mirror actually exists, otherwise the link would 404
    for exactly the readers this whole exercise is for.
    """
    if href.startswith("http"):
        return href, True
    path, _, frag = href.partition("#")
    path = "/" + path.lstrip("/")
    path = re.sub(r"/index\.html$", "/", path)
    path = re.sub(r"\.html$", "", path)
    if lang == "zh":
        slug = path.strip("/")
        candidate = WEB / "zh" / f"{slug}.html" if slug else WEB / "zh" / "index.html"
        if candidate.exists():
            root = "/zh" if not slug else f"/zh/{slug}"
            # Absolute even though the page needs it relative: build_feed writes
            # the URL straight into RSS, where a bare path is not a link at all.
            return ORIGIN + root + (f"#{frag}" if frag else ""), False
    url = ORIGIN + path
    return url + (f"#{frag}" if frag else ""), False


def local_href(url):
    """Origin-relative form for markup, absolute for feeds."""
    return url[len(ORIGIN):] if url.startswith(ORIGIN) else url


# ---------------------------------------------------------------------------
# formatting
# ---------------------------------------------------------------------------

def day_of(iso):
    return datetime.strptime(iso, "%Y-%m-%d").replace(tzinfo=timezone.utc)


def date_label(iso, lang):
    d = day_of(iso)
    if lang == "zh":
        # No spaces around 年月日: that is what Intl zh-CN produces, and the
        # page must not change shape when news.js takes over after load.
        return f"{d.year}年{d.month}月{d.day}日"
    return f"{MONTH_EN[d.month - 1]} {d.day}, {d.year}"


def month_label(iso, lang):
    d = day_of(iso)
    return f"{d.month}月" if lang == "zh" else MONTH_EN[d.month - 1]


def sort_for_list(posts):
    # pinned first, then newest — identical to news.js, so the static HTML and
    # the post-hydration DOM do not reorder under the visitor.
    return sorted(posts, key=lambda p: (0 if p.get("pin") else 1, -day_of(p["date"]).timestamp(), p["id"]))


def card(p, lang, d, esc=html.escape):
    url, ext = detail_target(p, lang)
    href = local_href(url)
    title = esc(d[p["t"]])
    desc = esc(d[p["d"]])
    kind_key = KIND_KEY.get(p["kind"], "nw.dev")
    lines = [
        f'            <article class="news-item{" pinned" if p.get("pin") else ""}" data-kind="{p["kind"]}" id="post-{p["id"]}">',
        f'              <div class="ni-date"><b>{day_of(p["date"]).day}</b><span>{month_label(p["date"], lang)}</span></div>',
        '              <div class="ni-body">',
        '                <div class="ni-meta">',
        f'                  <span class="ni-tag k-{p["kind"]}" data-i18n="{kind_key}">{esc(d[kind_key])}</span>',
        f'                  <time class="ni-time" datetime="{p["date"]}">{date_label(p["date"], lang)}</time>',
    ]
    if p.get("pin"):
        lines.append(f'                  <span class="ni-pin">📌 <span data-i18n="nw.pin">{esc(d["nw.pin"])}</span></span>')
    lines += [
        "                </div>",
        f'                <h3 data-i18n="{p["t"]}">{title}</h3>',
        f'                <p data-i18n="{p["d"]}">{desc}</p>',
        f'                <a class="ni-link" href="{href}" data-i18n="nw.open"'
        + (' target="_blank" rel="noopener"' if ext else "") + f'>{esc(d["nw.open"])}</a>',
        "              </div>",
        "            </article>",
    ]
    return "\n".join(lines)


def latest(p, lang, d, esc=html.escape):
    url, ext = detail_target(p, lang)
    return (
        f'            <a href="{local_href(url)}"'
        + (' target="_blank" rel="noopener"' if ext else "")
        + f'><span class="nl-date">{date_label(p["date"], lang)}</span>'
        + f'<b data-i18n="{p["t"]}">{esc(d[p["t"]])}</b></a>'
    )


def count_text(n, lang, d):
    return d["nw.count"].replace("{n}", str(n))


# ---------------------------------------------------------------------------
# feeds
# ---------------------------------------------------------------------------

FEED_DESC = {
    "en": "Official Omniverse Compute (OMC) updates: testnet milestones, airdrop campaigns, "
          "engineering progress and governance announcements.",
    "zh": "泛宇宙算力（OMC）官方动态：测试网里程碑、空投活动、工程进展与治理公告。",
}
FEED_TITLE = {
    "en": "Omniverse Compute (OMC) — News & Announcements",
    "zh": "泛宇宙算力（OMC）— 项目动态与公告",
}
KIND_LABEL = {"dev": "Engineering", "airdrop": "Airdrop", "eco": "Ecosystem", "gov": "Governance", "vo": "Industry Voices"}
KIND_LABEL_ZH = {"dev": "工程", "airdrop": "空投", "eco": "生态", "gov": "治理", "vo": "行业观点"}


def build_feed(posts, lang, d):
    # Chronological by publication date, not by the pinned-first order used on
    # the page: a reader wants the newest entry at the top, and pinning is a
    # layout decision that means nothing in a feed.
    ordered = sorted(posts, key=lambda p: (-day_of(p["date"]).timestamp(), p["id"]))
    newest = ordered[0]["date"]
    path = "/news/feed.xml" if lang == "en" else "/zh/news/feed.xml"
    page = "/news" if lang == "en" else "/zh/news"
    out = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
        "  <channel>",
        f"    <title>{html.escape(FEED_TITLE[lang])}</title>",
        f"    <link>{ORIGIN}{page}</link>",
        f"    <description>{html.escape(FEED_DESC[lang])}</description>",
        f"    <language>{'en' if lang == 'en' else 'zh-cn'}</language>",
        f'    <atom:link href="{ORIGIN}{path}" rel="self" type="application/rss+xml"/>',
        # Deliberately the newest post's date rather than "now": a feed that
        # stamps the build time looks updated every time the generator runs and
        # commits a meaningless diff, which trains everyone to ignore it.
        f"    <lastBuildDate>{pubdate(newest)}</lastBuildDate>",
        "    <generator>website/tools/build_news.py</generator>",
    ]
    for p in ordered:
        url, _ = detail_target(p, lang)
        label = KIND_LABEL[p["kind"]] if lang == "en" else KIND_LABEL_ZH[p["kind"]]
        out += [
            "    <item>",
            f"      <title>{html.escape(d[p['t']])}</title>",
            f"      <link>{html.escape(url)}</link>",
            f'      <guid isPermaLink="false">omc-news-{lang}-{p["id"]}</guid>',
            f"      <pubDate>{pubdate(p['date'])}</pubDate>",
            f"      <category>{html.escape(label)}</category>",
            f"      <description>{html.escape(d[p['d']])}</description>",
            "    </item>",
        ]
    out += ["  </channel>", "</rss>", ""]
    return "\n".join(out)


def pubdate(iso):
    return format_datetime(day_of(iso))


# ---------------------------------------------------------------------------
# per-article detail pages
# ---------------------------------------------------------------------------

ARTICLE_TEMPLATE = WEB / "news" / "article.template"

# Identity block shared by every page. inject_facts.py also stamps it, but the
# build chain runs this script before inject_facts, so a freshly generated page
# must already carry it or the identity guard would flag it. Copied verbatim
# from news.html so the two stay byte-identical.
ORG_NODE = {
    "@id": "https://omc.network/#organization",
    "alternateName": ["泛宇宙算力", "OMC"],
    "disambiguatingDescription": (
        "Omniverse Compute (OMC) is an independent BNB Chain DePIN project building "
        "a decentralised GPU compute network that rents out idle GPUs. The name is "
        "distinct from NVIDIA's Omniverse 3D platform, from the Federal Open Market "
        "Committee (FOMC) and from any central bank."
    ),
    "@type": "Organization",
    "name": "Omniverse Compute",
    "url": "https://omc.network",
    "logo": "https://omc.network/assets/img/logo.png",
    "sameAs": [
        "https://github.com/CBTdao",
        "https://x.com/Omniverse_Depin",
        "https://t.me/OmniverseCompute",
        "https://dev.to/omniverse_depin",
    ],
    "@context": "https://schema.org",
}


def detail_target(p, lang):
    """Where the /news card and the RSS feed point.

    A post carrying a `slug` gets a first-party detail page at /news/<slug>
    (or /zh/news/<slug>); everything else keeps its original href, whether that
    is an internal page or an external link. Routing the internal link through
    the detail page keeps the link equity on omc.network and gives every post a
    unique, crawlable URL instead of a shard of /news.

    Returns an absolute URL: the feed needs https links, and the card/latest
    pass it through local_href() which strips the origin back to a relative
    path, so the rendered HTML is unchanged.
    """
    if p.get("slug"):
        root = "/zh" if lang == "zh" else ""
        return ORIGIN + root + "/news/" + p["slug"], False
    return resolve_href(p["href"], lang)


def _audit_len(s):
    """Replicate the length seo-audit.mjs actually measures for a meta value.
    It html-escapes, then decodes &amp; &lt; &gt; &quot; &#39; &nbsp; back to
    single chars — but NOT &#x27;, which is exactly what Python's html.escape
    emits for an apostrophe. So each apostrophe counts as 5 chars in the
    audit. Simulating that here lets meta truncation hit the real 65/165
    thresholds instead of a raw-char guess."""
    e = html.escape(s)
    e = (
        e.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", '"')
        .replace("&#39;", "'")
        .replace("&nbsp;", " ")
    )
    return len(e)


def _truncate(s, max_len):
    """Trim s so the audit measures it <= max_len. Cuts at a word boundary when
    possible; the visible H1/lede and JSON-LD keep the full, untruncated text."""
    if _audit_len(s) <= max_len:
        return s
    budget = max_len - 1  # leave room for the trailing …
    cut = s[:budget]
    while " " in cut and _audit_len(cut) > budget:
        cut = cut[: cut.rfind(" ")]
    while _audit_len(cut) > budget and cut:
        cut = cut[:-1]
    return cut.rstrip() + "…"


def render_detail(p, lang, d, template):
    slug = p["slug"]
    title = d[p["t"]]
    desc = d[p["d"]]
    # Head meta is length-capped for the audit's soft thresholds; the H1, lede
    # and JSON-LD below keep the full, untruncated text.
    meta_title = _truncate(title, 65)
    meta_desc = _truncate(desc, 165)
    kind_key = KIND_KEY.get(p["kind"], "nw.dev")
    kind_label = d[kind_key]
    date_iso = p["date"]
    date_label_str = date_label(date_iso, lang)
    source = p["href"]
    canonical = ORIGIN + ("/zh" if lang == "zh" else "") + "/news/" + slug
    news_url = ORIGIN + "/news/" + slug
    zh_url = ORIGIN + "/zh/news/" + slug
    locale = "zh_CN" if lang == "zh" else "en_US"
    news_href = "/zh/news" if lang == "zh" else "/news"
    esc = html.escape

    webpage = {
        "@context": "https://schema.org",
        "@type": "WebPage",
        "name": title,
        "url": canonical,
        "description": desc,
        "isPartOf": {"@type": "WebSite", "name": "Omniverse Compute", "url": ORIGIN},
        "dateModified": date_iso,
    }
    breadcrumb = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": ORIGIN + "/"},
            {"@type": "ListItem", "position": 2, "name": d["nav.news"], "item": ORIGIN + news_href},
            {"@type": "ListItem", "position": 3, "name": title, "item": canonical},
        ],
    }
    article = {
        "@context": "https://schema.org",
        "@type": "NewsArticle",
        "headline": title,
        "datePublished": date_iso,
        "dateModified": date_iso,
        "articleSection": kind_label,
        "description": desc,
        "inLanguage": "zh" if lang == "zh" else "en",
        "publisher": {"@id": ORIGIN + "/#organization"},
        "mainEntityOfPage": {"@type": "WebPage", "@id": canonical},
        "isAccessibleForFree": True,
    }

    # Compact separators so the output matches what inject_facts.py re-serialises
    # these same blocks to after stamping (it rewrites the array values with
    # separators=(",", ":")); otherwise the --check comparison never reconciles.
    dumps = lambda o: json.dumps(o, ensure_ascii=False, separators=(",", ":"))
    blocks = [
        dumps(ORG_NODE),
        dumps(webpage),
        dumps(breadcrumb),
        dumps(article),
    ]
    jsonld = "\n".join(
        f'  <script type="application/ld+json">\n{b}\n  </script>' for b in blocks
    )

    # Head meta uses the length-capped variants (audit soft thresholds); the
    # JSON-LD name/headline/description and the visible H1/lede keep full text.
    meta = f'''  <title data-i18n="{p["t"]}">{esc(meta_title)}</title>
  <link rel="canonical" href="{canonical}" />
  <link rel="alternate" hreflang="en" href="{news_url}" />
  <link rel="alternate" hreflang="x-default" href="{news_url}" />
  <link rel="alternate" hreflang="zh" href="{zh_url}" />
  {jsonld}
  <meta property="og:site_name" content="Omniverse Compute">
  <meta property="og:type" content="article">
  <meta property="og:title" data-i18n-content="{p["t"]}" content="{esc(meta_title)}">
  <meta property="og:description" data-i18n-content="{p["d"]}" content="{esc(meta_desc)}">
  <meta property="og:url" content="{canonical}">
  <meta property="og:image" content="{ORIGIN}/og-image.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="Omniverse Compute — Decentralized GPU Infrastructure.">
  <meta property="og:locale" content="{locale}">
  <meta property="article:published_time" content="{date_iso}">
  <meta property="article:modified_time" content="{date_iso}">
  <meta property="article:section" content="{esc(kind_label)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@Omniverse_Depin">
  <meta name="twitter:title" data-i18n-content="{p["t"]}" content="{esc(meta_title)}">
  <meta name="twitter:description" data-i18n-content="{p["d"]}" content="{esc(meta_desc)}">
  <meta name="twitter:image" content="{ORIGIN}/og-image.png">
  <meta name="description" data-i18n-content="{p["d"]}" content="{esc(meta_desc)}">'''

    article_html = f'''  <section class="section" style="padding-top: 40px;">
    <div class="container">
      <nav class="breadcrumb" aria-label="Breadcrumb" style="margin: 0 0 18px; font-size: 14px; color: #8a8aa3;">
        <a href="{news_href}" data-i18n="nav.news">{esc(d["nav.news"])}</a>
        <span aria-hidden="true" style="margin: 0 8px;">›</span>
        <span class="current" data-i18n="{p["t"]}">{esc(title)}</span>
      </nav>
      <article class="news-item" style="border: 1px solid rgba(255,255,255,.08); border-radius: 16px; padding: 28px;">
        <div class="ni-meta">
          <span class="ni-tag k-{p["kind"]}" data-i18n="{kind_key}">{esc(kind_label)}</span>
          <time class="ni-time" datetime="{date_iso}">{date_label_str}</time>
        </div>
        <h1 data-i18n="{p["t"]}" style="margin: 14px 0 10px; font-size: 30px; line-height: 1.25;">{esc(title)}</h1>
        <p data-i18n="{p["d"]}" style="font-size: 17px; line-height: 1.7; color: #c8c8da;">{esc(desc)}</p>
        <a class="btn btn-primary" href="{esc(source)}" target="_blank" rel="noopener" data-i18n="nw.read_full" style="display: inline-block; margin-top: 18px;">{esc(d["nw.read_full"])}</a>
      </article>
    </div>
  </section>'''

    page = template
    page = page.replace("__LANG__", "zh" if lang == "zh" else "en")
    page = page.replace("<!-- __META__ -->", meta)
    page = page.replace("<!-- __ARTICLE__ -->", article_html)
    return page


# Volatile parts that inject_facts.py stamps in AFTER this script writes a page
# (dateModified, identity keys, the facts-version span). A detail page is born
# without them and gains them on the next stamping pass, so a re-render of the
# build-controlled content must ignore them when deciding "is this page current?"
# — the same normalisation inject_facts uses for its own idempotency check.
_STAMP_DATE = re.compile(r'"dateModified"\s*:\s*"[^"]*"')
_STAMP_IDENTITY = re.compile(
    r',?\s*"(?:@id|alternateName|disambiguatingDescription)"\s*:\s*'
    r'(?:"(?:[^"\\]|\\.)*"|\[[^\]]*\])'
)
_STAMP_FACTS = re.compile(r'<br\s*/?>\s*<span class="facts-v">[\s\S]*?</span>')


def strip_stamps(text):
    text = _STAMP_DATE.sub('"dateModified": ""', text)
    text = _STAMP_IDENTITY.sub("", text)
    text = _STAMP_FACTS.sub("", text)
    return text


# ---------------------------------------------------------------------------
# splicing
# ---------------------------------------------------------------------------

def splice(text, begin, end, block):
    i = text.find(begin)
    j = text.find(end)
    if i == -1 or j == -1 or j < i:
        raise SystemExit(f"marker not found: {begin} … {end}")
    return text[: i + len(begin)] + "\n" + block + "\n            " + text[j:]


def render_page(path, lang):
    d = load_dict(LANG_EN if lang == "en" else LANG_ZH, lang)
    posts = load_posts()
    ordered = sort_for_list(posts)
    src = path.read_text(encoding="utf-8")

    src = splice(src, BEGIN, END, "\n\n".join(card(p, lang, d) for p in ordered))
    src = splice(src, LATEST_BEGIN, LATEST_END, latest(ordered[0], lang, d))
    src = re.sub(
        r'(<div class="news-count" id="newsCount">)([^<]*)(</div>)',
        lambda m: m.group(1) + count_text(len(posts), lang, d) + m.group(3),
        src,
        count=1,
    )
    return src, posts, d


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

TARGETS = [("en", WEB / "news.html", WEB / "news" / "feed.xml"),
           ("zh", WEB / "zh" / "news.html", WEB / "zh" / "news" / "feed.xml")]


def main(argv):
    check = "--check" in argv
    stale = []

    for lang, page, feed_path in TARGETS:
        if not page.exists():
            print(f"skip {page.relative_to(WEB.parent)} — not built yet (run build_zh.py)")
            continue
        new_html, posts, d = render_page(page, lang)
        new_feed = build_feed(posts, lang, d)

        for label, path, content in (("page", page, new_html), ("feed", feed_path, new_feed)):
            old = path.read_text(encoding="utf-8") if path.exists() else None
            if old == content:
                continue
            if check:
                stale.append(f"{path.relative_to(WEB)} ({label})")
                continue
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")
            print(f"wrote {path.relative_to(WEB.parent)}")

    # Per-article detail pages (both languages) for posts that carry a slug.
    # These give every external-linked post a unique first-party URL instead of
    # a shard of /news, and concentrate internal link equity on omc.network.
    if ARTICLE_TEMPLATE.exists():
        tpl = ARTICLE_TEMPLATE.read_text(encoding="utf-8")
        for lang in ("en", "zh"):
            d_lang = load_dict(LANG_EN if lang == "en" else LANG_ZH, lang)
            for p in load_posts():
                if not p.get("slug"):
                    continue
                out_path = WEB / ("zh" if lang == "zh" else "") / "news" / (p["slug"] + ".html")
                new_html = render_detail(p, lang, d_lang, tpl)
                if check:
                    if not out_path.exists():
                        stale.append(f"{out_path.relative_to(WEB)} (detail)")
                    elif strip_stamps(out_path.read_text(encoding="utf-8")) != strip_stamps(new_html):
                        stale.append(f"{out_path.relative_to(WEB)} (detail)")
                    continue
                out_path.parent.mkdir(parents=True, exist_ok=True)
                if not out_path.exists() or out_path.read_text(encoding="utf-8") != new_html:
                    out_path.write_text(new_html, encoding="utf-8")
                    print(f"wrote {out_path.relative_to(WEB.parent)}")

    if check:
        if stale:
            print("STALE (run: python website/tools/build_news.py)")
            for s in stale:
                print("  " + s)
            return 1
        print("news pages and feeds are current")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
