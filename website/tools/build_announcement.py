# -*- coding: utf-8 -*-
"""One-off generator for the airdrop announcement pages.

Rebuilds nav/footer from the existing pages so the chrome never drifts, and
writes /news/omc-airdrop-is-open plus its Chinese mirror under /zh/news/.
Run from the repo root:  python _gen_announcement.py
"""
import re
from pathlib import Path

WEB = Path("website")
SLUG = "omc-airdrop-is-open"
URL_EN = f"https://omc.network/news/{SLUG}"
URL_ZH = f"https://omc.network/zh/news/{SLUG}"


def slice_between(text, start, end):
    i = text.index(start)
    j = text.index(end, i) + len(end)
    return text[i:j]


def chrome(template_path, assets_prefix):
    src = Path(template_path).read_text(encoding="utf-8")
    nav = slice_between(src, '<nav class="nav">', "</nav>")
    footer = slice_between(src, "<footer>", "</footer>")
    return nav, footer


NAV_EN, FOOTER_EN = chrome(WEB / "airdrop.html", "/")
NAV_ZH, FOOTER_ZH = chrome(WEB / "zh" / "airdrop.html", "/")

CSS = """  <link rel="stylesheet" href="/assets/css/app.css?v=20261027a" />
  <link rel="stylesheet" href="/assets/css/headings.css?v=20261027a" />
  <link rel="stylesheet" href="/assets/css/footer-chain.css?v=20261027a" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="icon" type="image/x-icon" href="/favicon.ico" sizes="any" />
  <link rel="icon" type="image/png" href="/assets/img/logo.png" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />"""

SCRIPTS = """  <script src="/assets/js/lang/en.js?v=20261027a"></script>
  <script src="/assets/js/lang/zh.js?v=20261027a"></script>
  <script src="/assets/js/i18n.js?v=20261027a"></script>
  <script src="/assets/js/i18n-meta.js?v=20261027a"></script>
  <script src="/assets/js/main.js?v=20261027a"></script>
</body>
</html>"""

ROW = ('<tr><th scope="row" style="text-align:left;padding:11px 14px 11px 0;'
       'border-bottom:1px solid rgba(128,128,128,.22);font-weight:600;'
       'vertical-align:top;white-space:nowrap;">{k}</th>'
       '<td style="padding:11px 0;border-bottom:1px solid rgba(128,128,128,.22);">'
       '{v}</td></tr>')

def table(rows):
    body = "".join(ROW.format(k=k, v=v) for k, v in rows)
    return ('<table style="width:100%;border-collapse:collapse;font-size:15px;'
            'line-height:1.6;margin:18px 0 26px;"><tbody>' + body + "</tbody></table>")


# ----------------------------------------------------------------- EN body
EN_FACTS = table([
    ("Token", "OMC — BEP-20 on BNB Smart Chain"),
    ("Total pool", "20,000,000 OMC — 2% of a fixed 1,000,000,000 supply"),
    ("Per entry", "20 OMC, delivered in full in the claim transaction"),
    ("Slots", "1,000,000 — first come, first served, no lottery"),
    ("Cost to join", "<b>Free</b> — no purchase, no presale, no deposit"),
    ("Entry cap", "5 base entries + up to 5 referral entries = 10 entries (200 OMC) per wallet"),
    ("Daily limit", "1 entry per calendar day"),
    ("Claim processing fee", "0.01 BNB per entry, not refunded (0.05 BNB for a base claim)"),
    ("Registration", 'Open now — since <time datetime="2026-10-27">27 October 2026</time>'),
    ("Claim window", '<time datetime="2027-01-01">1 January 2027</time> — <time datetime="2027-03-31">31 March 2027</time> (UTC+8)'),
])

EN_TIMELINE = table([
    ('<time datetime="2026-10-27">27 October 2026</time>', "Registration opens. Three social tasks, one wallet, no payment."),
    ('<time datetime="2027-01-01">1 January 2027</time>', "Mainnet and TGE. The claim window opens; the first entries are claimed."),
    ('<time datetime="2027-03-31">31 March 2027</time>', "Claim window closes. Unclaimed slots return to the protocol."),
])

EN_BODY = f"""
  <!-- ===== HEADER ===== -->
  <header class="hero" style="padding-bottom: 24px;">
    <div class="container">
      <div class="hero-badge"><span class="dot"></span><span>Announcement &middot; Airdrop</span></div>
      <h1 style="max-width: 20ch;">OMC Airdrop Is Open</h1>
      <p class="sub">20,000,000 OMC across 1,000,000 slots of 20 OMC each. Free to join — no purchase, no presale. Claiming opens 1 January 2027.</p>
      <p class="claim-note" style="margin-top: 14px;">Published 27 October 2026 &middot; updated 30 October 2026</p>
    </div>
  </header>

  <section class="section" style="padding-top: 6px;">
    <div class="container" style="max-width: 780px;">

      <p style="font-size: 17px; line-height: 1.75;">Omniverse Compute has opened its
      community airdrop. <b>20,000,000 OMC</b> — two percent of the fixed 1,000,000,000
      supply — is reserved for <b>1,000,000 slots of 20 OMC each</b>, distributed first
      come, first served. Joining is free: three social actions, no payment, no token
      purchase, no deposit. Claiming opens with mainnet on <b>1 January 2027</b>, and each
      entry carries a flat <b>0.01 BNB</b> processing fee at that point.</p>

      <h2>Key facts</h2>
      {EN_FACTS}

      <h2>How to take part</h2>
      <ol style="line-height: 1.9; font-size: 16px;">
        <li>Follow <a href="https://x.com/Omniverse_Depin" target="_blank" rel="noopener">@Omniverse_Depin</a> on X.</li>
        <li>Retweet and comment on the pinned post. Both are verified on the airdrop page, not on X.</li>
        <li>Join the <a href="https://t.me/OmniverseCompute" target="_blank" rel="noopener">Telegram group</a>.</li>
        <li>Connect a BNB Smart Chain wallet on <a href="/airdrop">omc.network/airdrop</a> and register
            up to 5 base entries. Registering is a signature, not a transaction — it costs no gas.
            Each invited wallet that registers its first entry adds one entry, up to 5 more.</li>
      </ol>

      <h2>What is free, and what the 0.01 BNB covers</h2>
      <p style="line-height: 1.75;">Free is the whole participation layer. The three tasks
      are ordinary social actions, registering is a wallet signature that costs no gas, and
      no OMC is sold at any point — there is no presale, no private round, and nothing to buy
      to become eligible.</p>
      <p style="line-height: 1.75;">The 0.01 BNB per entry is charged once, when you claim,
      inside the claim transaction. It is a processing charge for that transaction in the way
      the network charges gas, and it is deliberately not indexed to the token price: the same
      0.01 BNB applies whether OMC trades at $0.01 or at $1. It is not refunded, because it
      funds work that has already happened — 60% to ecosystem development (audits, testnet
      incentives, RPC and indexer costs, the node client) and 40% to team operations. Every
      one of the 20 OMC in an entry still arrives in full.</p>
      <p style="line-height: 1.75;">This is stated in the announcement rather than in a
      footnote because the alternative — a number discovered at the wallet prompt — is how
      airdrops earn a reputation they do not recover from.</p>

      <h2>Timeline</h2>
      {EN_TIMELINE}

      <h2>The token behind it</h2>
      <p style="line-height: 1.75;">OMC settles compute jobs on BNB Chain. The protocol fee is
      8% of settled job volume, charged to the requester: 50% burned, 30% to staked nodes,
      20% to the treasury. Supply is fixed at 1,000,000,000 with no inflation parameter, and
      emission is gated by trailing 30-day fee revenue so issuance tracks real usage rather
      than a calendar. Circulating supply at TGE is 65,500,000 OMC. The airdrop is the only
      allocation delivered in full at claim; the lock-ups sit on the investor allocations.
      Full detail: <a href="/tokenomics">Tokenomics</a> and
      <a href="/whitepaper">Whitepaper</a>.</p>

      <h2>What is not live yet</h2>
      <p style="line-height: 1.75;">Stated plainly, because a launch post that omits this is
      not worth reading: there is no mainnet deployment, no token contract, no audit, and no
      exchange listing. Those arrive on 1 January 2027 or later. Today there is a public
      testnet, a working node client, and a registration flow. Treat everything else as
      scheduled, not shipped.</p>

      <h2>Scam warning</h2>
      <p style="line-height: 1.75;">No OMC token exists before TGE. Any contract, presale,
      or "claim portal" naming OMC today is fraudulent, including any that asks you to send
      BNB to a wallet for gas. The team will never ask for a seed phrase or a private key.
      The only addresses that matter are published on omc.network and in the
      <a href="https://github.com/CBTdao/omc-network" target="_blank" rel="noopener">repository</a>.</p>

      <h2>Where to check any number in this post</h2>
      <p style="line-height: 1.75;">Every figure here is generated from
      <a href="https://github.com/CBTdao/omc-network/blob/main/contracts/params.json" target="_blank" rel="noopener">contracts/params.json</a>,
      the single source of truth the contracts are deployed from. The same figures are
      published machine-readable at <a href="/airdrop.json">omc.network/airdrop.json</a> for
      listing sites and answer engines, and summarised at
      <a href="/llms.txt">omc.network/llms.txt</a>. If a third-party listing disagrees with
      this post, the listing is stale.</p>

      <p style="margin-top: 34px;"><a class="btn btn-primary btn-lg" href="/airdrop">Register free →</a></p>
    </div>
  </section>
"""

# ----------------------------------------------------------------- ZH body
ZH_FACTS = table([
    ("代币", "OMC — BNB Smart Chain 上的 BEP-20 代币"),
    ("奖池总量", "20,000,000 OMC — 占固定总量 10 亿的 2%"),
    ("每份", "20 OMC，在领取交易中一次性全额到账"),
    ("份数", "1,000,000 份 — 先到先得，不抽签"),
    ("参与成本", "<b>免费</b> — 无需购买、无需预付、无押金"),
    ("每人上限", "5 份基础名额 + 最多 5 份邀请名额 = 10 份（200 OMC）"),
    ("每日上限", "每个自然日 1 份"),
    ("领取手续费", "每份 0.01 BNB，不退还（基础 5 份为 0.05 BNB）"),
    ("报名状态", '现已开放——自 <time datetime="2026-10-27">2026 年 10 月 27 日</time> 起'),
    ("领取窗口", '<time datetime="2027-01-01">2027 年 1 月 1 日</time> — <time datetime="2027-03-31">2027 年 3 月 31 日</time>（UTC+8）'),
])

ZH_TIMELINE = table([
    ('<time datetime="2026-10-27">2026 年 10 月 27 日</time>', "报名开放。三步社交任务、一个钱包，无需支付。"),
    ('<time datetime="2027-01-01">2027 年 1 月 1 日</time>', "主网上线与 TGE。领取窗口开启，开始处理第一批领取。"),
    ('<time datetime="2027-03-31">2027 年 3 月 31 日</time>', "领取窗口关闭，未领取的份额回归协议。"),
])

ZH_BODY = f"""
  <!-- ===== HEADER ===== -->
  <header class="hero" style="padding-bottom: 24px;">
    <div class="container">
      <div class="hero-badge"><span class="dot"></span><span>公告 &middot; 空投</span></div>
      <h1 style="max-width: 24ch;">OMC 空投已开放</h1>
      <p class="sub">20,000,000 OMC，共 1,000,000 份、每份 20 OMC。免费参与——无需购买，无预售。2027 年 1 月 1 日起可领取。</p>
      <p class="claim-note" style="margin-top: 14px;">发布于 2026 年 10 月 27 日 &middot; 更新于 2026 年 10 月 30 日</p>
    </div>
  </header>

  <section class="section" style="padding-top: 6px;">
    <div class="container" style="max-width: 780px;">

      <p style="font-size: 17px; line-height: 1.8;">Omniverse Compute 的社区空投已经开放。
      <b>20,000,000 OMC</b>——占固定总量 10 亿的 2%——分为 <b>1,000,000 份、每份 20 OMC</b>，
      先到先得。参与是免费的：三个社交动作，无需付款、无需买币、无需押金。
      领取随主网于 <b>2027 年 1 月 1 日</b>开启，届时每份收取固定的 <b>0.01 BNB</b> 领取手续费。</p>

      <h2>关键数据</h2>
      {ZH_FACTS}

      <h2>如何参与</h2>
      <ol style="line-height: 1.9; font-size: 16px;">
        <li>在 X 上关注 <a href="https://x.com/Omniverse_Depin" target="_blank" rel="noopener">@Omniverse_Depin</a>。</li>
        <li>转发置顶推文并留言。这两项在空投页内验证，不在 X 上验证。</li>
        <li>加入 <a href="https://t.me/OmniverseCompute" target="_blank" rel="noopener">Telegram 群</a>。</li>
        <li>在 <a href="/zh/airdrop">omc.network/zh/airdrop</a> 连接 BNB Smart Chain 钱包，登记最多 5 份基础名额。
            登记是钱包签名、不是交易，不消耗 gas。每有一个受邀钱包完成首次登记，邀请人多得 1 份，最多 5 份。</li>
      </ol>

      <h2>哪些是免费的，0.01 BNB 又是什么</h2>
      <p style="line-height: 1.8;">免费覆盖的是整个参与环节。三个任务都是普通的社交动作，
      登记是钱包签名、不消耗 gas，全程不出售任何 OMC——没有预售、没有私募，
      也不需要买任何东西才具备资格。</p>
      <p style="line-height: 1.8;">每份 0.01 BNB 只在领取时收取一次，包含在领取交易里。
      它是这笔交易的处理手续费，性质与网络收取的 gas 相同，并且刻意不与币价挂钩：
      无论 OMC 是 $0.01 还是 $1，都是同样的 0.01 BNB。它不退还，因为它支付的是已经发生的工作——
      60% 用于生态开发（审计、测试网激励、RPC 与索引服务、节点客户端），40% 用于团队运营。
      每份里的 20 OMC 仍然全额到账。</p>
      <p style="line-height: 1.8;">这些话写在公告正文里，而不是塞进脚注，是因为另一种做法——
      让用户在钱包弹窗上第一次看到这个数字——正是空投项目口碑崩掉的方式。</p>

      <h2>时间表</h2>
      {ZH_TIMELINE}

      <h2>背后的代币</h2>
      <p style="line-height: 1.8;">OMC 用于在 BNB Chain 上结算算力任务。协议费为结算金额的 8%，
      向需求方收取：50% 销毁、30% 分给质押节点、20% 进入国库。总量固定为 1,000,000,000，
      没有通胀参数；释放量由近 30 天的实际协议费收入闸门控制，跟随真实使用而非日历。
      TGE 时流通量为 65,500,000 OMC。空投是唯一一笔领取即全额到账的份额，
      锁仓安排在投资人份额上。详见 <a href="/zh/tokenomics">代币经济学</a> 与
      <a href="/whitepaper">白皮书</a>。</p>

      <h2>目前还没有上线的部分</h2>
      <p style="line-height: 1.8;">直说，因为一篇隐去这些的发布稿不值得读：
      主网尚未部署、代币合约尚未创建、代码尚未审计、也尚未上任何交易所。
      这些会在 2027 年 1 月 1 日或之后陆续发生。今天有的是公开测试网、可用的节点客户端，
      以及一套报名流程。其余请当作计划，而不是既成事实。</p>

      <h2>防骗提示</h2>
      <p style="line-height: 1.8;">TGE 之前不存在 OMC 代币。今天任何以 OMC 为名的合约、预售、
      「领取门户」都是诈骗，包括要求你为 gas 向某钱包转 BNB 的。团队不会索要助记词或私钥。
      只有 omc.network 与
      <a href="https://github.com/CBTdao/omc-network" target="_blank" rel="noopener">代码仓库</a>
      公布的地址才算数。</p>

      <h2>这篇里的数字去哪核对</h2>
      <p style="line-height: 1.8;">文中每个数字都来自
      <a href="https://github.com/CBTdao/omc-network/blob/main/contracts/params.json" target="_blank" rel="noopener">contracts/params.json</a>——
      合约部署所依据的唯一来源。同样一组数字以机器可读形式发布在
      <a href="/airdrop.json">omc.network/airdrop.json</a>，供聚合站与 AI 引擎读取，
      另有摘要版 <a href="/llms.txt">omc.network/llms.txt</a>。
      若第三方榜单与本文不一致，是榜单过期了。</p>

      <p style="margin-top: 34px;"><a class="btn btn-primary btn-lg" href="/zh/airdrop">免费登记 →</a></p>
    </div>
  </section>
"""

ORG_LD = ('{"@context":"https://schema.org","@type":"Organization","name":"Omniverse Compute",'
          '"url":"https://omc.network","logo":"https://omc.network/assets/img/logo.png",'
          '"sameAs":["https://github.com/CBTdao","https://x.com/Omniverse_Depin"]}')


def article_ld(url, lang, headline, desc, section):
    return f'''{{
  "@context": "https://schema.org",
  "@type": "NewsArticle",
  "headline": {headline},
  "description": {desc},
  "datePublished": "2026-10-27T09:00:00+08:00",
  "dateModified": "2026-10-30T18:00:00+08:00",
  "inLanguage": "{lang}",
  "articleSection": {section},
  "author": {{"@type": "Organization", "name": "Omniverse Compute", "url": "https://omc.network"}},
  "publisher": {{
    "@type": "Organization",
    "name": "Omniverse Compute",
    "logo": {{"@type": "ImageObject", "url": "https://omc.network/assets/img/logo.png", "width": 512, "height": 512}}
  }},
  "image": ["https://omc.network/og-image.png"],
  "mainEntityOfPage": {{"@type": "WebPage", "@id": "{url}"}},
  "isAccessibleForFree": true
}}'''


en_ld = article_ld(
    URL_EN, "en",
    '"OMC Airdrop Is Open: 20,000,000 OMC Across 1,000,000 Free Slots"',
    '"Omniverse Compute has opened its community airdrop: 20,000,000 OMC in 1,000,000 slots of 20 OMC each, free to join, first come first served. Claiming opens 1 January 2027 with a 0.01 BNB processing fee per entry."',
    '"Airdrop"')

zh_ld = article_ld(
    URL_ZH, "zh-Hans",
    '"OMC 空投已开放：20,000,000 OMC，1,000,000 份免费名额"',
    '"Omniverse Compute 社区空投已开放：20,000,000 OMC 分为 1,000,000 份、每份 20 OMC，免费参与、先到先得。2027 年 1 月 1 日起可领取，每份收取 0.01 BNB 领取手续费。"',
    '"空投"')

EN_HEAD = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
  <title>OMC Airdrop Is Open — 20M OMC, Free to Join | Omniverse Compute</title>
  <link rel="canonical" href="{URL_EN}">
  <link rel="alternate" hreflang="en" href="{URL_EN}" />
  <link rel="alternate" hreflang="x-default" href="{URL_EN}" />
  <link rel="alternate" hreflang="zh" href="{URL_ZH}" />
  <script type="application/ld+json">
{ORG_LD}
  </script>
  <script type="application/ld+json">
{en_ld}
  </script>
  <script type="application/ld+json">
{{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{{"@type":"ListItem","position":1,"name":"Home","item":"https://omc.network/"}},{{"@type":"ListItem","position":2,"name":"News","item":"https://omc.network/news"}},{{"@type":"ListItem","position":3,"name":"OMC Airdrop Is Open","item":"{URL_EN}"}}]}}
  </script>
  <meta name="description" content="Omniverse Compute has opened its community airdrop: 20,000,000 OMC in 1,000,000 slots of 20 OMC each. Free to join, no purchase. Claiming opens 1 January 2027." />
  <meta property="og:site_name" content="Omniverse Compute">
  <meta property="og:type" content="article">
  <meta property="og:title" content="OMC Airdrop Is Open — 20,000,000 OMC, Free to Join">
  <meta property="og:description" content="20,000,000 OMC across 1,000,000 slots of 20 OMC each. Free to join, no purchase, no presale. Claiming opens 1 January 2027." />
  <meta property="og:url" content="{URL_EN}">
  <meta property="og:image" content="https://omc.network/og-image.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="Omniverse Compute — Decentralized GPU Infrastructure. Project card with the omc.network wordmark on a violet gradient.">
  <meta property="og:locale" content="en_US">
  <meta property="article:published_time" content="2026-10-27T09:00:00+08:00">
  <meta property="article:modified_time" content="2026-10-30T18:00:00+08:00">
  <meta property="article:section" content="Airdrop">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@Omniverse_Depin">
  <meta name="twitter:title" content="OMC Airdrop Is Open — 20,000,000 OMC, Free to Join">
  <meta name="twitter:description" content="20,000,000 OMC across 1,000,000 slots of 20 OMC each. Free to join, no purchase. Claiming opens 1 January 2027." />
  <meta name="twitter:image" content="https://omc.network/og-image.png">
{CSS}
</head>
<body>

  <!-- ===== NAV ===== -->
  {NAV_EN}

"""

ZH_HEAD = f"""<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
  <title>OMC 空投已开放 — 2000 万 OMC，免费参与 | Omniverse Compute</title>
  <link rel="canonical" href="{URL_ZH}">
  <link rel="alternate" hreflang="en" href="{URL_EN}" />
  <link rel="alternate" hreflang="x-default" href="{URL_EN}" />
  <link rel="alternate" hreflang="zh" href="{URL_ZH}" />
  <script type="application/ld+json">
{ORG_LD}
  </script>
  <script type="application/ld+json">
{zh_ld}
  </script>
  <script type="application/ld+json">
{{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{{"@type":"ListItem","position":1,"name":"首页","item":"https://omc.network/zh"}},{{"@type":"ListItem","position":2,"name":"新闻","item":"https://omc.network/zh/news"}},{{"@type":"ListItem","position":3,"name":"OMC 空投已开放","item":"{URL_ZH}"}}]}}
  </script>
  <meta name="description" content="Omniverse Compute 社区空投已开放：20,000,000 OMC 分为 1,000,000 份、每份 20 OMC。免费参与、无需购买，2027 年 1 月 1 日起可领取。" />
  <meta property="og:site_name" content="Omniverse Compute">
  <meta property="og:type" content="article">
  <meta property="og:title" content="OMC 空投已开放 — 2000 万 OMC，免费参与">
  <meta property="og:description" content="20,000,000 OMC 分为 1,000,000 份、每份 20 OMC。免费参与、无需购买、无预售，2027 年 1 月 1 日起可领取。" />
  <meta property="og:url" content="{URL_ZH}">
  <meta property="og:image" content="https://omc.network/og-image.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="Omniverse Compute — 去中心化 GPU 基础设施。紫色渐变背景上的 omc.network 字标项目卡。">
  <meta property="og:locale" content="zh_CN">
  <meta property="article:published_time" content="2026-10-27T09:00:00+08:00">
  <meta property="article:modified_time" content="2026-10-30T18:00:00+08:00">
  <meta property="article:section" content="空投">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@Omniverse_Depin">
  <meta name="twitter:title" content="OMC 空投已开放 — 2000 万 OMC，免费参与">
  <meta name="twitter:description" content="20,000,000 OMC 分为 1,000,000 份、每份 20 OMC。免费参与，2027 年 1 月 1 日起可领取。" />
  <meta name="twitter:image" content="https://omc.network/og-image.png">
{CSS}
</head>
<body>

  <!-- ===== NAV ===== -->
  {NAV_ZH}

"""

out_en = WEB / "news" / f"{SLUG}.html"
out_zh = WEB / "zh" / "news" / f"{SLUG}.html"
out_en.parent.mkdir(parents=True, exist_ok=True)
out_zh.parent.mkdir(parents=True, exist_ok=True)

out_en.write_text(EN_HEAD + EN_BODY + "\n  <!-- ===== FOOTER ===== -->\n  " + FOOTER_EN + "\n\n" + SCRIPTS, encoding="utf-8")
out_zh.write_text(ZH_HEAD + ZH_BODY + "\n  <!-- ===== FOOTER ===== -->\n  " + FOOTER_ZH + "\n\n" + SCRIPTS, encoding="utf-8")

print("wrote", out_en)
print("wrote", out_zh)
