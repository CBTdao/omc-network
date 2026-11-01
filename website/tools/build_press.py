# -*- coding: utf-8 -*-
"""Generator for the press / media kit page.

Writes /press and /zh/press. Nav and footer are sliced out of the existing
airdrop pages so the chrome never drifts, exactly like build_announcement.py.

Run from the repo root:  python website/tools/build_press.py
"""
from pathlib import Path

WEB = Path("website")
URL_EN = "https://omc.network/press"
URL_ZH = "https://omc.network/zh/press"
UPDATED = "2026-11-01"


def slice_between(text, start, end):
    i = text.index(start)
    j = text.index(end, i) + len(end)
    return text[i:j]


def chrome(template_path):
    src = Path(template_path).read_text(encoding="utf-8")
    return slice_between(src, '<nav class="nav">', "</nav>"), slice_between(src, "<footer>", "</footer>")


NAV_EN, FOOTER_EN = chrome(WEB / "airdrop.html")
NAV_ZH, FOOTER_ZH = chrome(WEB / "zh" / "airdrop.html")

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

# Shared inline style so the three boilerplate blocks and the asset cards read
# as one system without adding a stylesheet rule for a single page.
BOILER = ("margin:14px 0;padding:16px 18px;border:1px solid rgba(128,128,128,.25);"
          "border-radius:12px;font-size:15px;line-height:1.75;background:rgba(128,128,128,.05);")
CARD = ("display:block;text-decoration:none;color:inherit;border:1px solid rgba(128,128,128,.25);"
        "border-radius:14px;overflow:hidden;background:rgba(128,128,128,.04);")
GRID = "display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;margin:22px 0;"


def table(rows):
    cells = "".join(
        '<tr><th scope="row" style="text-align:left;padding:11px 14px 11px 0;'
        'border-bottom:1px solid rgba(128,128,128,.22);font-weight:600;'
        'vertical-align:top;white-space:nowrap;">%s</th>'
        '<td style="padding:11px 0;border-bottom:1px solid rgba(128,128,128,.22);">%s</td></tr>' % (k, v)
        for k, v in rows
    )
    return ('<table style="width:100%;border-collapse:collapse;font-size:15px;line-height:1.6;'
            'margin:18px 0 26px;"><tbody>' + cells + "</tbody></table>")


def asset(href, img, name, meta, alt, fit="cover", ratio="16/9", bg="#111"):
    # Square marks get contain + a square frame; cards get cover in 16:9. Cropping
    # a logo to 16:9 cuts the wordmark in half, which is the one thing a press kit
    # must not do.
    return ('<a style="' + CARD + '" href="' + href + '" download>\n'
            '          <img src="' + img + '" alt="' + alt + '" loading="lazy" decoding="async" '
            'style="display:block;width:100%;height:auto;aspect-ratio:' + ratio + ';object-fit:' + fit +
            ';background:' + bg + ';" />\n'
            '          <span style="display:block;padding:12px 14px;">'
            '<b style="display:block;font-size:15px;">' + name + '</b>'
            '<small style="opacity:.68;font-size:13px;">' + meta + '</small></span>\n'
            "        </a>")


# ----------------------------------------------------------------- EN copy
EN_FACTS = table([
    ("Project", "Omniverse Compute — a decentralized GPU compute network"),
    ("Ticker", "OMC &middot; BEP-20 on BNB Smart Chain"),
    ("Total supply", "1,000,000,000 OMC — fixed; no inflation parameter exists"),
    ("Emission", "400,000,000 OMC over ten years from 1 January 2027, gated by trailing "
                 "30-day fee revenue. A further 100,000,000 is a DAO reserve locked until 2037."),
    ("Protocol fee", "8% of settled job volume, charged to the requester: 50% burned, "
                     "30% to staked node operators, 20% to the treasury"),
    ("What a node does", "Stakes OMC, registers hardware, executes compute jobs, proves "
                         "completion, earns fees and emission"),
    ("Airdrop", "20,000,000 OMC — 1,000,000 slots of 20 OMC. Free to join; first come, "
                "first served. Claiming opens 1 January 2027 with a 0.01 BNB processing "
                "charge per entry."),
    ("Mainnet / TGE", '<time datetime="2027-01-01">1 January 2027</time> — scheduled, not shipped'),
    ("Live today", "Public testnet (chainId 97), node client, staking and compute-market "
                   "contracts, airdrop registration"),
    ("Not live", "Mainnet, OMC token contract, third-party audit, exchange listing, "
                 "token price. Any contract naming OMC today is fraudulent."),
    ("Source", '<a href="https://github.com/CBTdao/omc-network" target="_blank" rel="noopener">'
               "github.com/CBTdao/omc-network</a> — public, including every number on this page"),
])

EN_ASSETS = asset("/assets/img/logo.png", "/assets/img/logo.png",
                  "Wordmark / app icon", "PNG &middot; 512&times;512 &middot; transparent",
                  "Omniverse Compute logo", fit="contain", ratio="1/1", bg="transparent") + "\n        " + asset(
    "/assets/img/press/omc-airdrop-en-1200x630.png", "/assets/img/press/omc-airdrop-en-1200x630.png",
    "Airdrop card — English", "PNG &middot; 1200&times;630 &middot; X / OG / article header",
    "English airdrop share card") + "\n        " + asset(
    "/assets/img/press/omc-airdrop-zh-1200x630.png", "/assets/img/press/omc-airdrop-zh-1200x630.png",
    "Airdrop card — 中文", "PNG &middot; 1200&times;630 &middot; 微博 / 公众号 / OG",
    "Chinese airdrop share card, landscape") + "\n        " + asset(
    "/assets/img/press/omc-airdrop-zh-1080x1080.png", "/assets/img/press/omc-airdrop-zh-1080x1080.png",
    "Airdrop card — 中文方图", "PNG &middot; 1080&times;1080 &middot; 小红书 / 朋友圈",
    "Chinese airdrop share card, square") + "\n        " + asset(
    "/og-image.png", "/og-image.png",
    "Project card — OG image", "PNG &middot; 1200&times;630",
    "Omniverse Compute project card") + "\n        " + asset(
    "/assets/docs/OMC-Whitepaper-EN.pdf", "/og-image.png",
    "Whitepaper (PDF)", "PDF &middot; English &middot; 1.3 MB",
    "Whitepaper PDF")

EN_BODY = f"""
  <!-- ===== HEADER ===== -->
  <header class="hero" style="padding-bottom: 24px;">
    <div class="container">
      <div class="hero-badge"><span class="dot"></span><span>Press &amp; Media</span></div>
      <h1 style="max-width: 22ch;">Press Kit</h1>
      <p class="sub">Logos, boilerplate, share cards, and the source file behind every number on this site — so anything you publish about Omniverse Compute can be checked rather than trusted.</p>
      <p class="claim-note" style="margin-top: 14px;">Updated <time datetime="{UPDATED}">1 November 2026</time> &middot; maintained by the project team</p>
    </div>
  </header>

  <section class="section" style="padding-top: 6px;">
    <div class="container" style="max-width: 820px;">

      <p style="font-size: 17px; line-height: 1.75;">This page exists because most of what
      gets written about a pre-launch token is copied from another article that copied it
      from a listing site. Every figure below is generated from
      <a href="https://github.com/CBTdao/omc-network/blob/main/contracts/params.json" target="_blank" rel="noopener">contracts/params.json</a>,
      the file the contracts are deployed from, and republished machine-readable at
      <a href="/airdrop.json">omc.network/airdrop.json</a>. If you cite this page, you are
      citing the source rather than a summary of it.</p>

      <h2>Boilerplate</h2>
      <p style="line-height: 1.75;">Three lengths, ready to paste. They say the same thing;
      pick the one that fits the space.</p>

      <h3 style="font-size: 16px; margin-bottom: 4px;">One line &middot; 24 words</h3>
      <blockquote style="{BOILER}">Omniverse Compute is a decentralized GPU network on BNB Chain. Requesters pay for compute in OMC; node operators stake OMC, serve jobs, and earn an 8% protocol fee.</blockquote>

      <h3 style="font-size: 16px; margin-bottom: 4px;">Short &middot; 55 words</h3>
      <blockquote style="{BOILER}">Omniverse Compute (OMC) is a decentralized compute network on BNB Smart Chain. GPU operators stake OMC and register hardware; requesters pay for AI compute jobs in OMC. The protocol charges 8% of settled job volume — half burned, 30% to staked nodes, 20% to the treasury. Supply is fixed at one billion; emission is gated by real fee revenue.</blockquote>

      <h3 style="font-size: 16px; margin-bottom: 4px;">Full &middot; 120 words</h3>
      <blockquote style="{BOILER}">Omniverse Compute (OMC) is a decentralized compute network on BNB Smart Chain that matches GPU operators with the people who need compute. Operators stake OMC as collateral — a bond sized in dollars, not in tokens, so it keeps its weight when the price moves — register their hardware, and execute jobs. Requesters pay in OMC, with a 10% discount for paying in OMC rather than in stablecoins. The protocol takes 8% of settled volume: 50% burned, 30% to staked operators, 20% to the treasury. Total supply is fixed at 1,000,000,000 with no inflation parameter, and new issuance is capped by trailing 30-day fee revenue, so a network that earns nothing issues nothing. Mainnet and token generation are scheduled for 1 January 2027.</blockquote>

      <h2>Fast facts</h2>
      {EN_FACTS}

      <h2>Brand assets</h2>
      <p style="line-height: 1.75;">Right-click to save, or click a card to download. Free to
      use in editorial coverage of Omniverse Compute. Please do not recolour the mark, stretch
      it, add effects, or place it where it looks like an endorsement — and do not use it to
      promote anything sold as an OMC investment, because nothing is.</p>
      <div style="{GRID}">
        {EN_ASSETS}
      </div>

      <h2>How to write about it without being wrong</h2>
      <p style="line-height: 1.75;">A short list, offered because these are the errors that
      show up most often in coverage of this category:</p>
      <ul style="line-height: 1.9; font-size: 15px;">
        <li><b>It is a network, not a coin.</b> OMC is the unit that settles work on it. The
            interesting claim is the fee flow, not the ticker.</li>
        <li><b>BEP-20, not ERC-20.</b> OMC is issued on BNB Smart Chain.</li>
        <li><b>There is no price.</b> OMC is not listed anywhere and is not sold by the
            project. Any figure quoted as "the OMC price" is invented.</li>
        <li><b>The airdrop is free to join.</b> Three social actions and a wallet signature.
            A separate 0.01 BNB per entry is charged at claim time, inside the claim
            transaction — a processing charge, not a purchase, and not a discount on OMC.</li>
        <li><b>Say "testnet" when describing what runs today.</b> Mainnet, the token contract,
            the audit and any listing are scheduled for 1 January 2027 or later.</li>
        <li><b>Staking APR is a division, not a promise.</b> It is annual emission divided by
            total staked, capped at 100%, and it is zero until the network earns fees. Do not
            quote an APR as a yield.</li>
      </ul>

      <h2>Airdrop, stated correctly</h2>
      <p style="line-height: 1.75;">20,000,000 OMC — 2% of supply — in 1,000,000 slots of
      20 OMC each, first come first served. Registration is open now and free: follow, retweet
      and comment, join Telegram, then connect a BNB Smart Chain wallet and register up to five
      base entries (plus one per invited wallet that registers, up to five more). Claiming opens
      with mainnet on 1 January 2027 and closes 31 March 2027; unclaimed slots return to the
      protocol. Machine-readable terms:
      <a href="/airdrop.json">/airdrop.json</a>. Full announcement:
      <a href="/news/omc-airdrop-is-open">/news/omc-airdrop-is-open</a>.</p>

      <h2>Attributable statements</h2>
      <p style="line-height: 1.75;">Two paragraphs that can be quoted directly and attributed
      to the Omniverse Compute team. They are positions, not marketing lines.</p>
      <blockquote style="{BOILER}">"We priced the emission schedule against fee revenue rather
      than against a calendar, because a schedule can only answer how fast a pool may be spent.
      It cannot answer whether the network is earning anything while it spends. If there is no
      revenue, there is no emission — a network that never finds demand simply never inflates."</blockquote>
      <blockquote style="{BOILER}">"The airdrop is free and we say so on the page, in the
      announcement and in the machine-readable feed. The 0.01 BNB per entry is a processing
      charge at claim time and it is published before anyone connects a wallet, because the
      alternative — a number discovered at the wallet prompt — is how airdrops earn a
      reputation they never recover from."</blockquote>

      <h2>Corrections</h2>
      <p style="line-height: 1.75;">If something here is wrong, it is wrong everywhere it was
      generated from, so the fix happens once. Open an issue at
      <a href="https://github.com/CBTdao/omc-network/issues" target="_blank" rel="noopener">github.com/CBTdao/omc-network/issues</a>
      or message us on X; corrections are republished in
      <a href="/news">News</a> with the date they were made. If a third-party listing disagrees
      with this page, the listing is stale — the repository is the source.</p>

      <h2>Contact</h2>
      {table([
        ("X", '<a href="https://x.com/Omniverse_Depin" target="_blank" rel="noopener">@Omniverse_Depin</a> — direct messages open'),
        ("Telegram", '<a href="https://t.me/OmniverseCompute" target="_blank" rel="noopener">t.me/OmniverseCompute</a>'),
        ("Code &amp; issues", '<a href="https://github.com/CBTdao/omc-network" target="_blank" rel="noopener">github.com/CBTdao/omc-network</a>'),
        ("Site", '<a href="/about">About &amp; contact</a> &middot; <a href="/whitepaper">Whitepaper</a> &middot; <a href="/tokenomics">Tokenomics</a>'),
      ])}
      <p style="line-height: 1.75; opacity: .75; font-size: 14px;">Suggested citation:
      Omniverse Compute (OMC). <i>Press Kit</i>. omc.network/press. Accessed 1 November 2026.</p>

      <p style="margin-top: 34px;"><a class="btn btn-primary btn-lg" href="/airdrop">See the airdrop →</a></p>
    </div>
  </section>
"""

# ----------------------------------------------------------------- ZH copy
ZH_FACTS = table([
    ("项目", "Omniverse Compute（泛宇宙算力）——去中心化 GPU 算力网络"),
    ("代币", "OMC &middot; BNB Smart Chain 上的 BEP-20 代币"),
    ("总量", "1,000,000,000 OMC —— 固定，合约中不存在通胀参数"),
    ("释放", "自 2027 年 1 月 1 日起十年释放 400,000,000 OMC，由近 30 天协议费收入闸门控制；"
             "另有 100,000,000 OMC 为 DAO 储备，2037 年前不可动用"),
    ("协议费", "按结算金额的 8% 向需求方收取：50% 销毁、30% 分给质押节点、20% 进入国库"),
    ("节点做什么", "质押 OMC、登记硬件、执行算力任务、提交完成证明，赚取协议费与释放"),
    ("空投", "20,000,000 OMC —— 1,000,000 份、每份 20 OMC。免费参与，先到先得。"
             "2027 年 1 月 1 日起可领取，每份收取 0.01 BNB 领取手续费。"),
    ("主网 / TGE", '<time datetime="2027-01-01">2027 年 1 月 1 日</time> —— 计划中，尚未上线'),
    ("今天已上线", "公开测试网（chainId 97）、节点客户端、质押与算力市场合约、空投报名"),
    ("尚未上线", "主网、OMC 代币合约、第三方审计、交易所上线、代币价格。"
                 "今天任何以 OMC 为名的合约都是诈骗。"),
    ("源码", '<a href="https://github.com/CBTdao/omc-network" target="_blank" rel="noopener">'
             "github.com/CBTdao/omc-network</a> —— 公开，包含本页每一个数字的来源"),
])

ZH_ASSETS = asset("/assets/img/logo.png", "/assets/img/logo.png",
                  "字标 / 应用图标", "PNG &middot; 512&times;512 &middot; 透明背景",
                  "Omniverse Compute 标志", fit="contain", ratio="1/1", bg="transparent") + "\n        " + asset(
    "/assets/img/press/omc-airdrop-zh-1200x630.png", "/assets/img/press/omc-airdrop-zh-1200x630.png",
    "空投横版卡（中文）", "PNG &middot; 1200&times;630 &middot; 公众号头图 / OG",
    "中文空投横版分享卡") + "\n        " + asset(
    "/assets/img/press/omc-airdrop-zh-1080x1080.png", "/assets/img/press/omc-airdrop-zh-1080x1080.png",
    "空投方图（中文）", "PNG &middot; 1080&times;1080 &middot; 小红书 / 朋友圈",
    "中文空投方版分享卡") + "\n        " + asset(
    "/assets/img/press/omc-airdrop-en-1200x630.png", "/assets/img/press/omc-airdrop-en-1200x630.png",
    "空投卡（英文）", "PNG &middot; 1200&times;630 &middot; X / 海外渠道",
    "English airdrop share card") + "\n        " + asset(
    "/og-image.png", "/og-image.png",
    "项目卡（OG 图）", "PNG &middot; 1200&times;630",
    "Omniverse Compute 项目卡") + "\n        " + asset(
    "/assets/docs/OMC-Whitepaper-EN.pdf", "/og-image.png",
    "白皮书（PDF）", "PDF &middot; 英文 &middot; 1.3 MB",
    "白皮书 PDF")

ZH_BODY = f"""
  <!-- ===== HEADER ===== -->
  <header class="hero" style="padding-bottom: 24px;">
    <div class="container">
      <div class="hero-badge"><span class="dot"></span><span>媒体 &middot; 资料包</span></div>
      <h1 style="max-width: 22ch;">媒体资料包</h1>
      <p class="sub">标志、标准介绍、分享卡，以及站内每个数字背后的源文件——让关于泛宇宙算力的报道可以被核对，而不是只能被相信。</p>
      <p class="claim-note" style="margin-top: 14px;">更新于 <time datetime="{UPDATED}">2026 年 11 月 1 日</time> &middot; 由项目团队维护</p>
    </div>
  </header>

  <section class="section" style="padding-top: 6px;">
    <div class="container" style="max-width: 820px;">

      <p style="font-size: 17px; line-height: 1.8;">这一页之所以存在，是因为关于一个未上线代币的报道，
      多数是从另一篇抄自某个榜单的文章里抄来的。下面每一个数字都由
      <a href="https://github.com/CBTdao/omc-network/blob/main/contracts/params.json" target="_blank" rel="noopener">contracts/params.json</a>
      生成——合约正是依据这个文件部署的——并以机器可读形式发布于
      <a href="/airdrop.json">omc.network/airdrop.json</a>。引用本页，等于引用源头，而不是源头的摘要。</p>

      <h2>标准介绍</h2>
      <p style="line-height: 1.8;">三种长度，可直接粘贴。说的是同一件事，按版面选一个。</p>

      <h3 style="font-size: 16px; margin-bottom: 4px;">一句话 &middot; 约 50 字</h3>
      <blockquote style="{BOILER}">泛宇宙算力（Omniverse Compute，OMC）是 BNB Chain 上的去中心化 GPU 算力网络：需求方用 OMC 支付算力，节点质押 OMC 后接入硬件、执行任务，并分得 8% 的协议费。</blockquote>

      <h3 style="font-size: 16px; margin-bottom: 4px;">短版 &middot; 约 110 字</h3>
      <blockquote style="{BOILER}">泛宇宙算力（OMC）是 BNB Smart Chain 上的去中心化算力网络。GPU 运营方质押 OMC 并登记硬件，需求方用 OMC 支付 AI 算力任务。协议按结算金额收取 8%：一半销毁、30% 分给质押节点、20% 进入国库。总量固定为 10 亿枚，新增释放由真实协议费收入闸门控制。</blockquote>

      <h3 style="font-size: 16px; margin-bottom: 4px;">完整版 &middot; 约 240 字</h3>
      <blockquote style="{BOILER}">泛宇宙算力（Omniverse Compute，OMC）是 BNB Smart Chain 上的去中心化算力网络，把 GPU 运营方与需要算力的人对接起来。运营方质押 OMC 作为保证金——金额以美元计价而非以代币枚数固定，价格下跌时保证金的分量不变——登记硬件后执行任务。需求方用 OMC 支付，用 OMC 结算比用稳定币便宜 10%。协议抽取结算金额的 8%：50% 销毁、30% 分给质押节点、20% 进入国库。总量固定为 1,000,000,000 枚，合约中没有通胀参数；新增释放受近 30 天协议费收入约束，没有收入就没有释放。主网与 TGE 计划于 2027 年 1 月 1 日进行。</blockquote>

      <h2>关键数据</h2>
      {ZH_FACTS}

      <h2>品牌素材</h2>
      <p style="line-height: 1.8;">右键保存，或点击卡片下载。可用于关于泛宇宙算力的编辑报道。
      请不要改色、拉伸、加特效，也不要放在看起来像背书的位置；更不要用它推广任何以「投资 OMC」
      为名的东西——因为并不存在这样的东西。</p>
      <div style="{GRID}">
        {ZH_ASSETS}
      </div>

      <h2>怎么写才不会写错</h2>
      <p style="line-height: 1.8;">一份短清单，因为下面这些是这个赛道的报道里最常出现的错误：</p>
      <ul style="line-height: 1.9; font-size: 15px;">
        <li><b>它是一个网络，不是一枚币。</b>OMC 是网络上结算算力的单位。值得写的是协议费流向，不是代码。</li>
        <li><b>BEP-20，不是 ERC-20。</b>OMC 发行在 BNB Smart Chain 上。</li>
        <li><b>目前没有价格。</b>OMC 未在任何地方上线，项目方也不出售。任何被称为「OMC 价格」的数字都是编的。</li>
        <li><b>空投是免费参与的。</b>三个社交动作加一次钱包签名。每份 0.01 BNB 在领取时、在领取交易内收取，
            是处理手续费，不是购买，也不是对 OMC 的折价。</li>
        <li><b>描述「今天在跑的」请说测试网。</b>主网、代币合约、审计与上线，都在 2027 年 1 月 1 日或之后。</li>
        <li><b>质押年化是一次除法，不是承诺。</b>等于年释放量除以全网质押量，上限 100%，网络没有费收时为零。
            请不要把年化当作收益率引用。</li>
      </ul>

      <h2>关于空投，正确的说法</h2>
      <p style="line-height: 1.8;">20,000,000 OMC——总量的 2%——分为 1,000,000 份、每份 20 OMC，先到先得。
      报名现已开放且免费：关注、转发并留言、加入 Telegram，然后连接 BNB Smart Chain 钱包登记最多 5 份基础名额
      （每有一个受邀钱包完成首次登记再加 1 份，最多 5 份）。领取随主网于 2027 年 1 月 1 日开启，
      2027 年 3 月 31 日关闭；未领取的份额回归协议。机器可读条款：
      <a href="/airdrop.json">/airdrop.json</a>。完整公告：
      <a href="/zh/news/omc-airdrop-is-open">/zh/news/omc-airdrop-is-open</a>。</p>

      <h2>可直接引用的表态</h2>
      <p style="line-height: 1.8;">以下两段可直接引用，署名「泛宇宙算力团队」。它们是立场，不是营销句。</p>
      <blockquote style="{BOILER}">「我们把释放节奏挂在实际协议费收入上，而不是挂在一张日历上。日历只能回答奖池可以多快花出去，
      回答不了「花钱的同时网络有没有在挣钱」。没有收入就没有释放——一个始终找不到需求的网络，其代币就始终不通胀。」</blockquote>
      <blockquote style="{BOILER}">「空投是免费的，这句话我们写在活动页、写在公告里，也写在给机器读的 feed 里。
      每份 0.01 BNB 是领取时的处理手续费，在任何人连接钱包之前就已公开——因为另一种做法，
      让用户在钱包弹窗上第一次看到这个数字，正是空投项目口碑崩掉、且再也修不回来的方式。」</blockquote>

      <h2>更正</h2>
      <p style="line-height: 1.8;">如果这里某处写错了，那它在所有由它生成的地方都错了，所以只需要改一次。
      可以在
      <a href="https://github.com/CBTdao/omc-network/issues" target="_blank" rel="noopener">GitHub 提交 issue</a>
      或在 X 上联系我们；更正会连同日期发布在<a href="/zh/news">新闻</a>页。
      如果某个第三方榜单与本页不一致，是榜单过期了——仓库才是源头。</p>

      <h2>联系方式</h2>
      {table([
        ("X", '<a href="https://x.com/Omniverse_Depin" target="_blank" rel="noopener">@Omniverse_Depin</a> —— 私信开放'),
        ("Telegram", '<a href="https://t.me/OmniverseCompute" target="_blank" rel="noopener">t.me/OmniverseCompute</a>'),
        ("代码与 issue", '<a href="https://github.com/CBTdao/omc-network" target="_blank" rel="noopener">github.com/CBTdao/omc-network</a>'),
        ("站内", '<a href="/zh/about">关于与联系</a> &middot; <a href="/whitepaper">白皮书</a> &middot; <a href="/zh/tokenomics">代币经济学</a>'),
      ])}
      <p style="line-height: 1.8; opacity: .75; font-size: 14px;">建议引用格式：
      泛宇宙算力（Omniverse Compute，OMC）。《媒体资料包》。omc.network/zh/press。2026 年 11 月 1 日访问。</p>

      <p style="margin-top: 34px;"><a class="btn btn-primary btn-lg" href="/zh/airdrop">查看空投 →</a></p>
    </div>
  </section>
"""

ORG_LD = ('{"@context":"https://schema.org","@type":"Organization","name":"Omniverse Compute",'
          '"alternateName":"泛宇宙算力","url":"https://omc.network","logo":"https://omc.network/assets/img/logo.png",'
          '"sameAs":["https://github.com/CBTdao","https://x.com/Omniverse_Depin","https://t.me/OmniverseCompute"]}')

EN_LD = """{
  "@context": "https://schema.org",
  "@type": "WebPage",
  "name": "Press Kit — Omniverse Compute (OMC)",
  "description": "Logos, boilerplate, share cards and verifiable figures for Omniverse Compute (OMC).",
  "url": "%s",
  "inLanguage": "en",
  "dateModified": "%s",
  "isAccessibleForFree": true,
  "about": {
    "@type": "Organization",
    "name": "Omniverse Compute",
    "url": "https://omc.network",
    "logo": "https://omc.network/assets/img/logo.png",
    "sameAs": ["https://github.com/CBTdao", "https://x.com/Omniverse_Depin", "https://t.me/OmniverseCompute"]
  },
  "primaryImageOfPage": {"@type": "ImageObject", "url": "https://omc.network/assets/img/press/omc-airdrop-en-1200x630.png", "width": 1200, "height": 630}
}""" % (URL_EN, UPDATED)

ZH_LD = """{
  "@context": "https://schema.org",
  "@type": "WebPage",
  "name": "媒体资料包 — 泛宇宙算力（OMC）",
  "description": "泛宇宙算力（OMC）的标志、标准介绍、分享卡与可核对的数字。",
  "url": "%s",
  "inLanguage": "zh-Hans",
  "dateModified": "%s",
  "isAccessibleForFree": true,
  "about": {
    "@type": "Organization",
    "name": "Omniverse Compute",
    "alternateName": "泛宇宙算力",
    "url": "https://omc.network",
    "logo": "https://omc.network/assets/img/logo.png",
    "sameAs": ["https://github.com/CBTdao", "https://x.com/Omniverse_Depin", "https://t.me/OmniverseCompute"]
  },
  "primaryImageOfPage": {"@type": "ImageObject", "url": "https://omc.network/assets/img/press/omc-airdrop-zh-1200x630.png", "width": 1200, "height": 630}
}""" % (URL_ZH, UPDATED)

EN_HEAD = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
  <title>Press Kit — Logos, Boilerplate &amp; Verifiable Facts | OMC</title>
  <link rel="canonical" href="{URL_EN}">
  <link rel="alternate" hreflang="en" href="{URL_EN}" />
  <link rel="alternate" hreflang="x-default" href="{URL_EN}" />
  <link rel="alternate" hreflang="zh" href="{URL_ZH}" />
  <script type="application/ld+json">
{ORG_LD}
  </script>
  <script type="application/ld+json">
{EN_LD}
  </script>
  <script type="application/ld+json">
{{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{{"@type":"ListItem","position":1,"name":"Home","item":"https://omc.network/"}},{{"@type":"ListItem","position":2,"name":"Press Kit","item":"{URL_EN}"}}]}}
  </script>
  <meta name="description" content="Press kit for Omniverse Compute (OMC): 512px logo, 1200x630 share cards, three boilerplate lengths, fast facts, and the repository file behind every number." />
  <meta property="og:site_name" content="Omniverse Compute">
  <meta property="og:type" content="website">
  <meta property="og:title" content="Press Kit — Omniverse Compute (OMC)">
  <meta property="og:description" content="Logos, share cards, boilerplate and verifiable figures. Every number links to the file it comes from." />
  <meta property="og:url" content="{URL_EN}">
  <meta property="og:image" content="https://omc.network/assets/img/press/omc-airdrop-en-1200x630.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="OMC airdrop share card — 20,000,000 OMC in 1,000,000 free slots.">
  <meta property="og:locale" content="en_US">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@Omniverse_Depin">
  <meta name="twitter:title" content="Press Kit — Omniverse Compute (OMC)">
  <meta name="twitter:description" content="Logos, share cards, boilerplate and verifiable figures for Omniverse Compute." />
  <meta name="twitter:image" content="https://omc.network/assets/img/press/omc-airdrop-en-1200x630.png">
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
  <title>媒体资料包 — 标志、标准介绍与可核对数据 | 泛宇宙算力</title>
  <link rel="canonical" href="{URL_ZH}">
  <link rel="alternate" hreflang="en" href="{URL_EN}" />
  <link rel="alternate" hreflang="x-default" href="{URL_EN}" />
  <link rel="alternate" hreflang="zh" href="{URL_ZH}" />
  <script type="application/ld+json">
{ORG_LD}
  </script>
  <script type="application/ld+json">
{ZH_LD}
  </script>
  <script type="application/ld+json">
{{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{{"@type":"ListItem","position":1,"name":"首页","item":"https://omc.network/zh"}},{{"@type":"ListItem","position":2,"name":"媒体资料包","item":"{URL_ZH}"}}]}}
  </script>
  <meta name="description" content="泛宇宙算力（OMC）媒体资料包：512px 标志、1200x630 分享卡、三档标准介绍、关键数据，以及每个数字在仓库中的源文件。" />
  <meta property="og:site_name" content="Omniverse Compute">
  <meta property="og:type" content="website">
  <meta property="og:title" content="媒体资料包 — 泛宇宙算力（OMC）">
  <meta property="og:description" content="标志、分享卡、标准介绍与可核对的数据。每个数字都指向它的来源文件。" />
  <meta property="og:url" content="{URL_ZH}">
  <meta property="og:image" content="https://omc.network/assets/img/press/omc-airdrop-zh-1200x630.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="OMC 空投分享卡——20,000,000 OMC，1,000,000 份免费名额。">
  <meta property="og:locale" content="zh_CN">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@Omniverse_Depin">
  <meta name="twitter:title" content="媒体资料包 — 泛宇宙算力（OMC）">
  <meta name="twitter:description" content="泛宇宙算力（OMC）的标志、分享卡、标准介绍与可核对数据。" />
  <meta name="twitter:image" content="https://omc.network/assets/img/press/omc-airdrop-zh-1200x630.png">
{CSS}
</head>
<body>

  <!-- ===== NAV ===== -->
  {NAV_ZH}

"""

out_en = WEB / "press.html"
out_zh = WEB / "zh" / "press.html"
out_zh.parent.mkdir(parents=True, exist_ok=True)

out_en.write_text(EN_HEAD + EN_BODY + "\n  <!-- ===== FOOTER ===== -->\n  " + FOOTER_EN + "\n\n" + SCRIPTS, encoding="utf-8")
out_zh.write_text(ZH_HEAD + ZH_BODY + "\n  <!-- ===== FOOTER ===== -->\n  " + FOOTER_ZH + "\n\n" + SCRIPTS, encoding="utf-8")

print("wrote", out_en)
print("wrote", out_zh)
