"""Unify every page's <head> onto exactly two i18n sources of truth.

Before this script the same page stated its title and description four ways
(<title>, og:*, twitter:*, meta description) and four of them disagreed, three
pages could not translate their title at all, and no description translated.
After it:

    <title>              data-i18n="meta.title_<page>"
    og:title             data-i18n-content="meta.title_<page>"
    twitter:title        data-i18n-content="meta.title_<page>"
    meta description     data-i18n-content="meta.desc_<page>"
    og:description       data-i18n-content="meta.desc_<page>"
    twitter:description  data-i18n-content="meta.desc_<page>"

so a divergence between them is no longer something a reviewer has to notice —
it is structurally impossible.

Also, in the same pass (they are head-level and were audited together):
  - og:image:width / height / alt and twitter:image:alt  (the card is 1200x630)
  - twitter:site, matching the X handle already in Organization.sameAs
  - og:locale follows the language (en_US / zh_CN)
  - Organization JSON-LD gains logo (assets/img/logo.png is 512x512)
  - assets/js/i18n-meta.js is added and wired after i18n.js on every page.
    It is a NEW file on purpose: /assets/* is cached immutable for a year, so
    the i18n engine itself must not be edited in place.
  - the 17 new keys are inserted into en.js and zh.js from the same constants
    used for the static HTML, so the two can never drift again.

Idempotent: every replacement matches both the pre- and post-patch shape, so
running it twice is a no-op.
"""
import html
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


def esc(s):
    return html.escape(s, quote=True)


def sub1(s, pat, repl, label, flags=0):
    """Replace the single match of pat with the literal string repl.

    repl is passed to re.sub as a callable, so backslashes in it are data and
    never interpreted as group references."""
    n = len(re.findall(pat, s, flags))
    assert n == 1, "expected exactly 1 match for %s, found %d" % (label, n)
    return re.sub(pat, lambda m: repl, s, count=1, flags=flags)


# --------------------------------------------------------------------------
# The single source of truth for every head string, both languages.
# --------------------------------------------------------------------------

TITLES_EN = {
    "index":      "Omniverse Compute (OMC) — Decentralized GPU Network",
    "news":       "News — Omniverse Compute (OMC)",
    "whitepaper": "Whitepaper — Omniverse Compute (OMC)",
    "tokenomics": "Tokenomics: OMC Supply & Emission — Omniverse Compute (OMC)",
    "calculator": "GPU Cloud Cost Calculator — Omniverse Compute (OMC)",
    "compute":    "AI Compute Station — Omniverse Compute (OMC)",
    "ai-tools":   "AI Image Upscaler in Your Browser — Omniverse Compute (OMC)",
    "testnet":    "Testnet — Omniverse Compute (OMC)",
    "stake":      "Stake — Omniverse Compute (OMC)",
    "airdrop":    "Airdrop — Omniverse Compute (OMC)",
    "about":      "About & Contact — Omniverse Compute (OMC)",
    "aup":        "Acceptable Use Policy — Omniverse Compute (OMC)",
    "privacy":    "Privacy Policy — Omniverse Compute (OMC)",
}
TITLES_ZH = {
    "index":      "Omniverse Compute (OMC) — 去中心化 GPU 网络",
    "news":       "项目动态 — Omniverse Compute (OMC)",
    "whitepaper": "白皮书 — Omniverse Compute (OMC)",
    "tokenomics": "OMC 代币经济：供应、分配与排放 — Omniverse Compute (OMC)",
    "calculator": "GPU 云端成本计算器 — Omniverse Compute (OMC)",
    "compute":    "AI 算力服务站 — Omniverse Compute (OMC)",
    "ai-tools":   "浏览器内 AI 图像超分 — Omniverse Compute (OMC)",
    "testnet":    "测试网 — Omniverse Compute (OMC)",
    "stake":      "质押 — Omniverse Compute (OMC)",
    "airdrop":    "空投 — Omniverse Compute (OMC)",
    "about":      "关于与联系 — Omniverse Compute (OMC)",
    "aup":        "可接受使用政策 — Omniverse Compute (OMC)",
    "privacy":    "隐私政策 — Omniverse Compute (OMC)",
}
DESCS_EN = {
    "index":      "Omniverse Compute (OMC) is a decentralized GPU compute network on BNB Chain: per-job verification, hardware-tier staking and a fixed 1B BEP-20 supply.",
    "news":       "Official Omniverse Compute (OMC) project updates: testnet milestones, airdrop campaigns, engineering progress and governance announcements.",
    "whitepaper": "OMC Whitepaper v3.0 in full: architecture, verification, staking and slashing, tokenomics, governance, roadmap and risks.",
    "tokenomics": "OMC tokenomics: a fixed 1,000,000,000 supply, seven-way distribution, 6.55% circulating at TGE, no team unlock at TGE, and a ten-year emission schedule.",
    "calculator": "Estimate monthly GPU spend on AWS, Google Cloud and Azure from published on-demand list prices — with rates, sources and caveats most comparisons leave out.",
    "compute":    "Configure and escrow a GPU compute job on the OMC network. Pick a hardware tier, choose a verification policy, and pay only for work that passes verification.",
    "ai-tools":   "A free 4x image upscaler that runs entirely in your browser using Real-ESRGAN. Your image never leaves your device. No account, no wallet, no upload.",
    "testnet":    "Join the Omniverse Compute testnet: run a GPU node, get test OMC from the faucet, and help validate the DePIN compute grid before mainnet.",
    "stake":      "Stake tOMC on the OMC testnet: pick a hardware tier, register a GPU node, keep it live and earn testnet rewards.",
    "airdrop":    "OMC Community Airdrop: 20,000,000 OMC (2% of supply), 1,000,000 claim slots × 20 OMC. Follow X, retweet & comment, join Telegram.",
    "about":      "Who is behind Omniverse Compute (OMC): what we are building, what is live today, our editorial standards, and how to reach the team.",
    "aup":        "OMC Acceptable Use Policy — the rules for requesting jobs and providing GPU capacity: prohibited content, prohibited workloads, obligations and enforcement.",
    "privacy":    "Privacy Policy for omc.network: what data we collect, how we use cookies, our use of Google AdSense, and your rights under GDPR, UK GDPR and CCPA/CPRA.",
}
DESCS_ZH = {
    "index":      "Omniverse Compute (OMC) 是构建在 BNB Chain 上的去中心化 GPU 算力网络：逐任务验证、按硬件档位的质押阶梯，以及固定 10 亿枚的 BEP-20 供应。",
    "news":       "Omniverse Compute (OMC) 官方动态：测试网里程碑、空投活动、工程进展与治理公告。",
    "whitepaper": "OMC 白皮书 v3.0 全文：架构、验证机制、质押与罚没、代币经济、治理、路线图与风险。",
    "tokenomics": "OMC 代币经济：固定 10 亿枚供应、七类分配、TGE 流通 6.55%、团队 TGE 零解锁，以及十年期节点奖励排放表。",
    "calculator": "用 AWS、Google Cloud、Azure 公开的按需目录价估算每月 GPU 开支——并附上多数比价文章省略的费率、来源与前提。",
    "compute":    "在 OMC 网络上配置并托管一笔 GPU 算力任务：选择硬件档位与验证策略，只为通过验证的工作付费。",
    "ai-tools":   "免费的 4 倍图像超分工具，用 Real-ESRGAN 完全在你的浏览器里运行，图片不会离开你的设备。无需账号、无需钱包、无需上传。",
    "testnet":    "加入 Omniverse Compute 测试网：运行 GPU 节点、从水龙头领取测试 OMC，在主网上线前一起验证这个 DePIN 算力网格。",
    "stake":      "在 OMC 测试网上质押 tOMC：选择硬件档位、注册 GPU 节点、保持在线，获取测试网奖励。",
    "airdrop":    "OMC 社区空投：20,000,000 OMC（占总供应 2%），1,000,000 个领取名额 × 每人 20 OMC。关注 X、转发并评论、加入 Telegram。",
    "about":      "Omniverse Compute (OMC) 背后是谁：我们在做什么、今天已经上线了什么、我们的内容标准，以及如何联系团队。",
    "aup":        "OMC 可接受使用政策——发起任务与提供 GPU 算力时必须遵守的规则：禁止内容、禁止负载、义务与执行。",
    "privacy":    "omc.network 的隐私政策：我们收集哪些数据、如何使用 Cookie、Google AdSense 的使用方式，以及你在 GDPR、英国 GDPR 与 CCPA/CPRA 下的权利。",
}

# key suffix used by both the HTML attribute and the dictionary entry.
KEY = {
    "index": "index", "news": "news", "whitepaper": "wp", "tokenomics": "tokenomics",
    "calculator": "calc", "compute": "compute", "ai-tools": "ai", "testnet": "tn",
    "stake": "stake", "airdrop": "airdrop", "about": "about", "aup": "aup", "privacy": "privacy",
}
PAGES = list(TITLES_EN)

OG_IMAGE_ALT = ("Omniverse Compute — Decentralized GPU Infrastructure. "
                "Project card with the omc.network wordmark on a violet gradient.")
TW_SITE = "@Omniverse_Depin"
LOGO_URL = "https://omc.network/assets/img/logo.png"

# sanity: every string stays inside the range a SERP will actually show.
# 60 characters is where a desktop SERP starts cutting, and the brand sits at
# the END of the title, so an over-long title loses the brand first.
BRAND_TAIL = " — Omniverse Compute (OMC)"
for k, v in list(DESCS_EN.items()) + list(DESCS_ZH.items()):
    assert len(v) <= 158, "description too long (%d): %s" % (len(v), k)
for k, v in list(TITLES_EN.items()) + list(TITLES_ZH.items()):
    assert len(v) <= 60, "title too long (%d): %s" % (len(v), k)
    # one brand tail for the whole site. index leads with the brand instead.
    assert v.endswith(BRAND_TAIL) or v.startswith("Omniverse Compute (OMC) — "), \
        "title must close with the full brand (or lead with it on the home page): %s" % k
    assert "|" not in v, "the brand tail is an em dash, never a pipe: %s" % k

# --------------------------------------------------------------------------
# assets/js/i18n-meta.js — new file, handles [data-i18n-content]
# --------------------------------------------------------------------------

I18N_META_JS = """/* ============================================================
   Omniverse Compute (OMC) — head metadata i18n

   Why a separate file
   -------------------
   /assets/* is served with `Cache-Control: immutable` for a year, so the
   i18n engine itself must never be edited in place — a returning visitor
   would keep the old engine and silently lose the new behaviour. This is a
   NEW file, so it reaches everyone as soon as it deploys.

   What it does
   ------------
   i18n.js swaps text nodes via [data-i18n]. Head metadata cannot use that:
   <meta> carries its value in the `content` attribute. This file applies
   [data-i18n-content] to that attribute, then re-applies whenever the
   language changes (i18n.js dispatches `i18n:changed`).

   A crawler never runs this and never carries a stored language, so what
   Google and the social scrapers read is always the static English head —
   which is the point: the head a bot sees stays stable, while a visitor who
   explicitly picked Chinese gets a head that matches the page they are on.
   ============================================================ */

(function () {
  var DEFAULT_LANG = (typeof window.i18nDefault === "string" && window.i18nDefault) || "en";

  function dict(lang) {
    return (window.I18N && window.I18N[lang]) || (window.I18N && window.I18N[DEFAULT_LANG]) || {};
  }

  function apply() {
    var lang = window.i18nCurrent ? window.i18nCurrent() : DEFAULT_LANG;
    var d = dict(lang);
    var fallback = dict(DEFAULT_LANG);
    var nodes = document.querySelectorAll("[data-i18n-content]");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var k = el.getAttribute("data-i18n-content");
      var v = d[k] !== undefined ? d[k] : fallback[k];
      if (v !== undefined) el.setAttribute("content", v);
    }
  }

  window.i18nApplyMeta = apply;
  document.addEventListener("i18n:changed", apply);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", apply);
  else apply();
})();
"""

# --------------------------------------------------------------------------
# per-page head rewrite
# --------------------------------------------------------------------------

OG_IMAGE_TAG = '<meta property="og:image" content="https://omc.network/og-image.png">'
TW_IMAGE_TAG = '<meta name="twitter:image" content="https://omc.network/og-image.png">'
TW_CARD_TAG = '<meta name="twitter:card" content="summary_large_image">'
I18N_TAG = '<script src="assets/js/i18n.js"></script>'


def patch_page(name):
    path = os.path.join(WEB, name + ".html")
    s = read(path)
    k = KEY[name]
    t_en, d_en = TITLES_EN[name], DESCS_EN[name]

    # 1. <title>
    s = sub1(s, r'<title[^>]*>.*?</title>',
             '<title data-i18n="meta.title_%s">%s</title>' % (k, esc(t_en)),
             name + " <title>", re.S)

    # 2. og:title / twitter:title — one key, same value
    s = sub1(s, r'<meta property="og:title"(?: data-i18n-content="[^"]*")? content="[^"]*">',
             '<meta property="og:title" data-i18n-content="meta.title_%s" content="%s">' % (k, esc(t_en)),
             name + " og:title")
    s = sub1(s, r'<meta name="twitter:title"(?: data-i18n-content="[^"]*")? content="[^"]*">',
             '<meta name="twitter:title" data-i18n-content="meta.title_%s" content="%s">' % (k, esc(t_en)),
             name + " twitter:title")

    # 3. description / og:description / twitter:description — one key, same value
    s = sub1(s, r'<meta name="description"(?: data-i18n-content="[^"]*")? content="[^"]*"\s*/?>',
             '<meta name="description" data-i18n-content="meta.desc_%s" content="%s">' % (k, esc(d_en)),
             name + " meta description")
    s = sub1(s, r'<meta property="og:description"(?: data-i18n-content="[^"]*")? content="[^"]*">',
             '<meta property="og:description" data-i18n-content="meta.desc_%s" content="%s">' % (k, esc(d_en)),
             name + " og:description")
    s = sub1(s, r'<meta name="twitter:description"(?: data-i18n-content="[^"]*")? content="[^"]*">',
             '<meta name="twitter:description" data-i18n-content="meta.desc_%s" content="%s">' % (k, esc(d_en)),
             name + " twitter:description")

    # 4. og:locale follows the language too
    s = sub1(s, r'<meta property="og:locale"(?: data-i18n-content="[^"]*")? content="[^"]*">',
             '<meta property="og:locale" data-i18n-content="meta.og_locale" content="en_US">',
             name + " og:locale")

    # 5. card dimensions + alt, right after og:image
    if 'property="og:image:width"' not in s:
        assert s.count(OG_IMAGE_TAG) == 1, name + ": og:image tag not unique"
        s = s.replace(OG_IMAGE_TAG,
                      OG_IMAGE_TAG + '\n  <meta property="og:image:width" content="1200">'
                                    '\n  <meta property="og:image:height" content="630">'
                                    '\n  <meta property="og:image:alt" content="%s">' % esc(OG_IMAGE_ALT),
                      1)

    # 6. twitter:site + twitter:image:alt
    if 'name="twitter:site"' not in s:
        assert s.count(TW_CARD_TAG) == 1, name + ": twitter:card tag not unique"
        s = s.replace(TW_CARD_TAG, TW_CARD_TAG + '\n  <meta name="twitter:site" content="%s">' % TW_SITE, 1)
    if 'name="twitter:image:alt"' not in s:
        assert s.count(TW_IMAGE_TAG) == 1, name + ": twitter:image tag not unique"
        s = s.replace(TW_IMAGE_TAG,
                      TW_IMAGE_TAG + '\n  <meta name="twitter:image:alt" content="%s">' % esc(OG_IMAGE_ALT), 1)

    # 7. Organization logo. Scoped to the Organization block because index.html
    #    also carries a WebSite block with the same name/url pair.
    if not re.search(r'"@type":"Organization","name":"Omniverse Compute","url":"https://omc\.network","logo":', s):
        s = sub1(s, r'"@type":"Organization","name":"Omniverse Compute","url":"https://omc\.network"',
                 '"@type":"Organization","name":"Omniverse Compute","url":"https://omc.network","logo":"%s"' % LOGO_URL,
                 name + " Organization.logo")

    # 8. wire the meta translator in, after the i18n engine
    if "assets/js/i18n-meta.js" not in s:
        assert s.count(I18N_TAG) == 1, name + ": i18n.js tag not unique"
        s = s.replace(I18N_TAG, I18N_TAG + '\n  <script src="assets/js/i18n-meta.js"></script>', 1)

    write(path, s)


# --------------------------------------------------------------------------
# dictionary insertion — same constants, so HTML and dicts cannot drift
# --------------------------------------------------------------------------

def _js(s):
    """A JS string literal; non-ASCII is left as UTF-8 (the files are UTF-8)."""
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def patch_dict(lang):
    path = os.path.join(WEB, "assets", "js", "lang", lang + ".js")
    s = read(path)
    titles = TITLES_EN if lang == "en" else TITLES_ZH
    descs = DESCS_EN if lang == "en" else DESCS_ZH
    added, updated = [], []

    entries = [("meta.og_locale", "en_US" if lang == "en" else "zh_CN")]
    for p in PAGES:
        entries.append(("meta.title_" + KEY[p], titles[p]))
    for p in PAGES:
        entries.append(("meta.desc_" + KEY[p], descs[p]))

    anchor = '"meta.title_index":'
    assert anchor in s, "anchor missing in " + lang + ".js"
    for key, val in entries:
        new = '"%s": %s' % (key, _js(val))
        pat = r'"%s"\s*:\s*"(?:[^"\\]|\\.)*"' % re.escape(key)
        cur = re.search(pat, s)
        if cur:
            # An existing entry is REWRITTEN, never skipped: the dictionary has
            # to follow the constants, otherwise editing a title here would
            # leave the static head and the dictionary telling different
            # stories — the exact drift this script exists to prevent.
            if cur.group(0) != new:
                s = re.sub(pat, lambda m: new, s, count=1)
                updated.append(key)
            continue
        s = s.replace(anchor, '"%s": %s,\n  %s' % (key, _js(val), anchor), 1)
        added.append(key)

    write(path, s)
    return added, updated


def main():
    js_path = os.path.join(WEB, "assets", "js", "i18n-meta.js")
    if not os.path.exists(js_path):
        write(js_path, I18N_META_JS)
        print("wrote assets/js/i18n-meta.js (%d bytes)" % len(I18N_META_JS))
    else:
        print("assets/js/i18n-meta.js already present")

    for p in PAGES:
        patch_page(p)
    print("patched %d page head(s)" % len(PAGES))

    for lang in ("en", "zh"):
        added, updated = patch_dict(lang)
        print("%s.js patched (%+d keys, %d rewritten)%s%s" % (
            lang, len(added), len(updated),
            ": added " + ", ".join(added) if added else "",
            " · rewrote " + ", ".join(updated) if updated else ""))


if __name__ == "__main__":
    main()
