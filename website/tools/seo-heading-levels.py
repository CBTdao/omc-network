"""Give every page exactly one <h1>, and let it follow the language switch.

Three pages had no H1 at all:
  whitepaper  the page title was an <h2 data-i18n="wp.title"> inside .section-head
  aup         the page title was an <h2 data-i18n="aup.title"> inside .section-head
  airdrop     the hero's largest element was a <div class="airdrop-hero-num">

And three pages had an H1 that never translated, unlike the other ten:
  about / privacy / tokenomics  (<h1> with no data-i18n, and no key existed)

Promoting an element to <h1> must not change how it looks, and /assets/* is
cached immutable for a year, so the two visual rules that would otherwise be
lost to the more specific `.hero h1` / gained from `.section-head h2` are
pinned in a NEW stylesheet (assets/css/headings.css) instead of being appended
to style.css.

Idempotent: each rewrite matches both the before and after shape.
"""
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.dirname(HERE)


def read(p):
    with open(p, "r", encoding="utf-8") as f:
        return f.read()


def write(p, s):
    with open(p, "w", encoding="utf-8", newline="") as f:
        f.write(s)


def sub1(s, pat, repl, label, flags=0):
    n = len(re.findall(pat, s, flags))
    assert n == 1, "expected exactly 1 match for %s, found %d" % (label, n)
    return re.sub(pat, lambda m: repl, s, count=1, flags=flags)


H1_KEYS = {
    "about":      ("pg.h_about",      "About & Contact", "关于与联系"),
    "privacy":    ("pg.h_privacy",    "Privacy Policy",  "隐私政策"),
    "tokenomics": ("pg.h_tokenomics", "Tokenomics",      "代币经济"),
}

HEADINGS_CSS = """/* ============================================================
   Omniverse Compute (OMC) — heading-level corrections

   Every page now has exactly one <h1>. Where that <h1 replaced an element
   that used to be an <h2> or a plain <div>, the typography it used to
   inherit has to be re-asserted at a specificity that beats `.hero h1`,
   otherwise the heading silently changes size for every visitor.

   This is a separate file because /assets/* is served with
   `Cache-Control: immutable` for a year: appending to style.css would never
   reach a returning visitor.
   ============================================================ */

/* whitepaper + aup: the page title used to be .section-head h2 */
.section-head h1 {
  font-size: clamp(28px, 4vw, 40px);
  font-weight: 800;
  line-height: 1.25;
  letter-spacing: -0.5px;
}

/* airdrop: the hero figure used to be a plain .airdrop-hero-num div, so the
   more specific .hero h1 would have shrunk it to clamp(38px, 6.4vw, 68px) */
.hero h1.airdrop-hero-num {
  font-size: clamp(44px, 7vw, 76px);
  font-weight: 900;
  letter-spacing: -2px;
  line-height: 1.1;
  max-width: none;
  margin: 0;
}
"""


def promote_to_h1(name, old_pat, new_lit, label):
    """new_lit is a LITERAL string, never a regex: the "already done" check is
    a plain substring test, because a literal like "(OMC)" would otherwise be
    read as a group and silently fail to match the parentheses in the file."""
    path = os.path.join(WEB, name + ".html")
    s = read(path)
    if new_lit in s:
        print("  %-12s already promoted (%s)" % (name, label))
        return
    if not re.search(old_pat, s):
        raise AssertionError("%s: neither the old nor the new shape found for %s" % (name, label))
    s = sub1(s, old_pat, new_lit, "%s %s" % (name, label))
    write(path, s)


def add_heading_css_link(name):
    path = os.path.join(WEB, name + ".html")
    s = read(path)
    if "assets/css/headings.css" in s:
        return
    anchor = '<link rel="stylesheet" href="assets/css/style.css" />'
    assert s.count(anchor) == 1, "%s: style.css link not unique" % name
    s = s.replace(anchor, anchor + '\n  <link rel="stylesheet" href="assets/css/headings.css" />', 1)
    write(path, s)


def patch_dicts():
    for lang in ("en", "zh"):
        path = os.path.join(WEB, "assets", "js", "lang", lang + ".js")
        s = read(path)
        added = []
        for page, (key, en, zh) in sorted(H1_KEYS.items()):
            if '"%s"' % key in s:
                continue
            val = en if lang == "en" else zh
            lit = '"' + val.replace("\\", "\\\\").replace('"', '\\"') + '"'
            for anchor in ('"meta.og_locale":', '"meta.title_index":'):
                if anchor in s:
                    s = s.replace(anchor, '"%s": %s,\n  %s' % (key, lit, anchor), 1)
                    added.append(key)
                    break
            else:
                raise AssertionError("no anchor in " + lang + ".js")
        write(path, s)
        print("  %s.js patched (%+d keys)%s" % (lang, len(added), ": " + ", ".join(added) if added else ""))


def main():
    css_path = os.path.join(WEB, "assets", "css", "headings.css")
    if not os.path.exists(css_path):
        write(css_path, HEADINGS_CSS)
        print("wrote assets/css/headings.css (%d bytes)" % len(HEADINGS_CSS))
    else:
        print("assets/css/headings.css already present")

    # 1. promote the page title to <h1> on the three pages that had none
    promote_to_h1("whitepaper",
                   r'<h2 data-i18n="wp\.title">Omniverse Compute \(OMC\)</h2>',
                   '<h1 data-i18n="wp.title">Omniverse Compute (OMC)</h1>',
                   "page title h2 -> h1")
    promote_to_h1("aup",
                   r'<h2 data-i18n="aup\.title">Acceptable Use Policy</h2>',
                   '<h1 data-i18n="aup.title">Acceptable Use Policy</h1>',
                   "page title h2 -> h1")
    promote_to_h1("airdrop",
                   r'<div class="airdrop-hero-num">20,000,000 OMC</div>',
                   '<h1 class="airdrop-hero-num">20,000,000 OMC</h1>',
                   "hero figure div -> h1")

    # 2. let the three silent H1s follow the language switch
    for page, (key, en, _zh) in sorted(H1_KEYS.items()):
        path = os.path.join(WEB, page + ".html")
        s = read(path)
        raw = en.replace("&", "&amp;")
        new = '<h1 data-i18n="%s">%s</h1>' % (key, raw)
        if new in s:
            continue
        pat = r'<h1>%s</h1>' % re.escape(raw)
        s = sub1(s, pat, new, "%s h1 data-i18n" % page)
        write(path, s)

    # 3. the corrected typography reaches only the pages that need it
    for page in ("whitepaper", "aup", "airdrop"):
        add_heading_css_link(page)

    # 4. the three new keys
    patch_dicts()

    print("done")


if __name__ == "__main__":
    main()
