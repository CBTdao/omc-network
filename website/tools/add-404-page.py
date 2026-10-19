"""Build 404.html from about.html so the error page keeps the site chrome.

A missing page on a static host otherwise falls through to the platform's
bare error page: no navigation, no styles, and a dead end for both the visitor
and the crawler. This one keeps the nav and footer, offers the twelve real
entry points as links, and answers 404 so search engines drop the URL.

Content is written once; re-running only re-asserts the head block, so the file
can be regenerated after the shared chrome changes.
"""
import os
import re
import sys

WEB = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

TITLE = "404 — Page Not Found — Omniverse Compute (OMC)"
DESC = ("The page you asked for is not on omc.network. Jump straight to the whitepaper, "
        "tokenomics, the GPU cost calculator, AI tools, the testnet or the Barbarian Age game.")

LINKS = [("/", "Home"), ("/whitepaper", "Whitepaper"), ("/tokenomics", "Tokenomics"),
         ("/calculator", "GPU Cost Calculator"), ("/compute", "AI Compute Station"),
         ("/ai-tools", "AI Tools"), ("/testnet", "Testnet"), ("/stake", "Stake"),
         ("/airdrop", "Airdrop"), ("/news", "News"), ("/barbarian-age", "Barbarian Age"),
         ("/about", "About & Contact")]

with open(os.path.join(WEB, "about.html"), "r", encoding="utf-8") as f:
    src = f.read()

# --- head: point every self-reference at /404 and swap the copy --------------
head = re.search(r"<head>(.*?)</head>", src, re.S).group(1)
head = head.replace("https://omc.network/about", "https://omc.network/404")
head = re.sub(r'<title data-i18n="meta\.title_about">[^<]*</title>',
              '<title data-i18n="meta.title_404">%s</title>' % TITLE, head)
head = re.sub(r'data-i18n-content="meta\.title_about"', 'data-i18n-content="meta.title_404"', head)
head = re.sub(r'data-i18n-content="meta\.desc_about"', 'data-i18n-content="meta.desc_404"', head)
head = re.sub(r'(<meta\b[^>]*data-i18n-content="meta\.(?:title|desc)_404"[^>]*\bcontent=")[^"]*(")',
              lambda m: m.group(1) + (TITLE if "title" in m.group(0) else DESC).replace("&", "&amp;") + m.group(2), head)
head = head.replace('<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />',
                    '<meta name="robots" content="noindex, follow" />')
head = re.sub(r'<script type="application/ld\+json">\s*\{"@context":"https://schema\.org","@type":"WebPage".*?</script>',
              '<script type="application/ld+json">\n{"@context":"https://schema.org","@type":"WebPage","name":"404 — Page Not Found","url":"https://omc.network/404","description":"The requested page does not exist on omc.network.","isPartOf":{"@type":"WebSite","name":"Omniverse Compute","url":"https://omc.network"}}\n</script>',
              head, flags=re.S)
head = re.sub(r'<script type="application/ld\+json">\s*\{"@context":"https://schema\.org","@type":"BreadcrumbList".*?</script>',
              '<script type="application/ld+json">\n{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"https://omc.network/"},{"@type":"ListItem","position":2,"name":"404","item":"https://omc.network/404"}]}\n</script>',
              head, flags=re.S)

# --- body: replace the hero + article with the error page --------------------
nav = re.search(r"(  <!-- ===== NAV ===== -->.*?)(  <!-- ===== HEADER ===== -->)", src, re.S).group(1)
foot = re.search(r"(  <!-- ===== FOOTER ===== -->.*?</footer>)", src, re.S).group(1)
tail = re.search(r"(\n  <script src=\"assets/js/lang/en\.js\">.*?</body>\s*</html>\s*)$", src, re.S).group(1)

items = "\n".join('          <li><a href="%s">%s</a></li>' % (h, t.replace("&", "&amp;")) for h, t in LINKS)

body = """  <!-- ===== HEADER ===== -->
  <header class="hero" style="padding-bottom: 30px;">
    <div class="container">
      <div class="hero-badge"><span class="dot"></span><span data-i18n="e404.badge">404</span></div>
      <h1 data-i18n="e404.h">404 — Page Not Found</h1>
      <p class="sub" data-i18n="e404.lead">That page is not on omc.network. It may have moved, or the link may be mistyped.</p>
    </div>
  </header>

  <!-- ===== BODY ===== -->
  <section class="section" style="padding-top: 20px;">
    <div class="container">
      <div class="wp-body reveal" style="max-width: 820px; margin: 0 auto;">
        <h2 data-i18n="e404.popular">Where to go instead</h2>
        <ul>
%s
        </ul>
        <p><a href="/" data-i18n="e404.back">← Back to the home page</a></p>
      </div>
    </div>
  </section>

""" % items

out = ("<!DOCTYPE html>\n<html lang=\"en\">\n<head>%s</head>\n<body>\n\n%s\n%s\n\n%s\n%s"
       % (head, nav, body, foot, tail))

with open(os.path.join(WEB, "404.html"), "w", encoding="utf-8", newline="") as f:
    f.write(out)

# --- the four new strings, in both dictionaries ------------------------------
NEW = {
    "meta.title_404": (TITLE, "404 — 页面不存在 — Omniverse Compute (OMC)"),
    "meta.desc_404": (DESC, "你访问的页面不在 omc.network 上。可直接前往白皮书、代币经济、GPU 成本计算器、AI 工具、测试网或《蛮荒时代》游戏。"),
    "e404.badge": ("404", "404"),
    "e404.h": ("404 — Page Not Found", "404 — 页面不存在"),
    "e404.lead": ("That page is not on omc.network. It may have moved, or the link may be mistyped.",
                  "该页面不在 omc.network 上。它可能已经迁移，或者链接拼写有误。"),
    "e404.popular": ("Where to go instead", "你可以去这些页面"),
    "e404.back": ("← Back to the home page", "← 返回首页"),
}
for i, fn in enumerate(["assets/js/lang/en.js", "assets/js/lang/zh.js"]):
    p = os.path.join(WEB, fn)
    with open(p, "r", encoding="utf-8") as f:
        s = f.read()
    for k, v in NEW.items():
        line = '  "%s": "%s",' % (k, v[i])
        if '"%s":' % k in s:
            s = re.sub(r'  "%s": "[^"]*",' % re.escape(k), lambda m, line=line: line, s)
        else:
            s = re.sub(r'(  "meta\.title_about": "[^"]*",\n)', lambda m, line=line: m.group(1) + line + "\n", s, count=1)
    with open(p, "w", encoding="utf-8", newline="") as f:
        f.write(s)

print("404.html written, %d dictionary entries asserted" % len(NEW))
