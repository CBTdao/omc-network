"""The SEO fixes that are not per-page head tags.

1. /barbarian-age-play had no internal link anywhere, so the crawler could only
   find it through the sitemap. The game page now also links it as the
   no-subdomain fallback.
2. robots.txt allowed every agent by default but said nothing about the answer
   engines that read llms.txt. They are named explicitly so an allow-list
   reader (or a human reviewer) can see the intent.
3. vercel.json gains the response headers a static site should send: nosniff,
   a referrer policy, frame guard, HSTS and a null permission policy, plus the
   immutable cache on /assets that the file names already imply.
4. The two tools pages describe software but only carried WebPage +
   BreadcrumbList. They gain WebApplication so the free browser tool is eligible
   for a rich result.
"""
import json
import os
import re
import sys

WEB = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
changed = []


def rw(rel, fn):
    p = os.path.join(WEB, rel)
    with open(p, "r", encoding="utf-8") as f:
        s = f.read()
    out = fn(s)
    if out != s:
        with open(p, "w", encoding="utf-8", newline="") as f:
            f.write(out)
        changed.append(rel)


# 1. link the in-site build from the game page --------------------------------
def link_play(s):
    old = '<p class="stage-open"><a href="https://game.omc.network/" target="_blank" rel="noopener" data-i18n="ba.open">'
    if old not in s or 'href="/barbarian-age-play.html"' in s:
        return s
    m = re.search(r"(<p class=\"stage-open\">.*?</p>\r?\n)", s, re.S)
    add = ('<p class="stage-note"><a href="/barbarian-age-play.html" data-i18n="ba.open2">'
           '在本站打开竖屏完整版（不跳转子域名）</a></p>\n')
    return s[:m.end()] + add + s[m.end():]


rw("barbarian-age.html", link_play)

for i, fn in enumerate(["assets/js/lang/en.js", "assets/js/lang/zh.js"]):
    def add_key(s, i=i):
        v = ("Open the full build on this site (no subdomain redirect)",
             "在本站打开竖屏完整版（不跳转子域名）")[i]
        if '"ba.open2":' in s:
            return s
        return re.sub(r'(  "ba\.open": "[^"]*",\n)', lambda m, v=v: m.group(1) + '  "ba.open2": "%s",\n' % v, s, count=1)
    rw(fn, add_key)

# 2. robots.txt ---------------------------------------------------------------
ROBOTS = """User-agent: *
Allow: /

# Answer engines and AI crawlers: allowed explicitly. The same descriptions
# they would summarise are published in /llms.txt.
User-agent: GPTBot
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: Applebot-Extended
Allow: /

Sitemap: https://omc.network/sitemap.xml
"""
rw("robots.txt", lambda s: ROBOTS)

# 3. vercel.json -------------------------------------------------------------
HEADERS = [
    {"source": "/(.*)", "headers": [
        {"key": "X-Content-Type-Options", "value": "nosniff"},
        {"key": "Referrer-Policy", "value": "strict-origin-when-cross-origin"},
        {"key": "X-Frame-Options", "value": "SAMEORIGIN"},
        {"key": "Strict-Transport-Security", "value": "max-age=31536000"},
        {"key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()"},
    ]},
    {"source": "/assets/(.*)", "headers": [
        {"key": "Cache-Control", "value": "public, max-age=31536000, immutable"},
    ]},
]


def add_headers(s):
    d = json.loads(s)
    if "headers" in d:
        return s
    d["headers"] = HEADERS
    return json.dumps(d, indent=2, ensure_ascii=False) + "\n"


rw("vercel.json", add_headers)

# 4. WebApplication on the two tool pages ------------------------------------
ORG = {"@type": "Organization", "name": "Omniverse Compute", "url": "https://omc.network"}
APPS = {
    "ai-tools.html": {
        "@type": "WebApplication",
        "name": "OMC AI Image Upscaler",
        "url": "https://omc.network/ai-tools",
        "applicationCategory": "BrowserApplication",
        "applicationSubCategory": "Image Upscaler",
        "operatingSystem": "Any (modern web browser with WebAssembly)",
        "browserRequirements": "Requires WebAssembly",
        "isAccessibleForFree": True,
        "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"},
        "featureList": ["4x image upscaling", "Runs locally in the browser — the image is never uploaded",
                        "No account, no wallet, no sign-up"],
        "author": ORG,
    },
    "calculator.html": {
        "@type": "WebApplication",
        "name": "OMC GPU Cloud Cost Calculator",
        "url": "https://omc.network/calculator",
        "applicationCategory": "UtilitiesApplication",
        "applicationSubCategory": "Cost Calculator",
        "operatingSystem": "Any (modern web browser)",
        "isAccessibleForFree": True,
        "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"},
        "featureList": ["Monthly GPU spend estimate for H100 and H200",
                        "Published on-demand list prices from AWS, Google Cloud and Azure",
                        "Rates, sources and caveats shown alongside the result"],
        "author": ORG,
    },
}
for rel, app in APPS.items():
    def add_app(s, app=app):
        if '"WebApplication"' in s:
            return s
        payload = json.dumps(dict([("@context", "https://schema.org")] + list(app.items())),
                              ensure_ascii=False)
        block = '  <script type="application/ld+json">\n' + payload + '\n</script>\n'
        return s.replace('  <meta property="og:site_name"', block + '  <meta property="og:site_name"', 1)
    rw(rel, add_app)

print("changed %d files" % len(changed))
for c in changed:
    print("  " + c)
