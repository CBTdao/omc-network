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
    url, ext = resolve_href(p["href"], lang)
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
    url, ext = resolve_href(p["href"], lang)
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
        url, _ = resolve_href(p["href"], lang)
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
