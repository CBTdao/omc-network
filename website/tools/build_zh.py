# -*- coding: utf-8 -*-
"""Build static /zh/ copies of the main-site pages that the zh dictionary
already covers, so crawlers get Chinese HTML at a distinct URL instead of
having to execute the client-side language switcher.

  python website/tools/build_zh.py            # (re)generate website/zh/*.html
  python website/tools/build_zh.py --patch-en # add hreflang="zh" to the en pages

Pages are chosen by dictionary coverage, measured with the untagged-text scan:
index/airdrop/tokenomics/stake/compute/testnet/ai-tools/news leave under 15%
untagged, and every string worth translating on them is in MANUAL below.
whitepaper/about/privacy/aup/calculator are 51-92% inline English and are
deliberately NOT generated yet — a half-translated legal/whitepaper page is
worse than none. Batch 2 is a translation task, not a build task.
"""

import copy
import json
import re
import subprocess
import sys
from pathlib import Path

from lxml import html as LH

WEB = Path(__file__).resolve().parent.parent
LANG_ZH = WEB / "assets" / "js" / "lang" / "zh.js"

# slug "" is the home page: file index.html, URL https://omc.network/
BATCH = {
    "index": "",
    "airdrop": "airdrop",
    "tokenomics": "tokenomics",
    "stake": "stake",
    "compute": "compute",
    "testnet": "testnet",
    "ai-tools": "ai-tools",
    "news": "news",
}

ORIGIN = "https://omc.network"


def zh_url(slug):
    # no trailing slash: vercel.json sets trailingSlash:false, so /zh/ 308s to /zh
    return f"{ORIGIN}/zh/{slug}" if slug else f"{ORIGIN}/zh"


def en_url(slug):
    return f"{ORIGIN}/{slug}" if slug else f"{ORIGIN}/"


def load_zh_dict():
    out = subprocess.run(
        ["node", "-e",
         "global.window={};require(process.argv[1]);"
         "process.stdout.write(JSON.stringify(window.I18N.zh))",
         str(LANG_ZH)],
        capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


# ---------------------------------------------------------------------------
# Hand-authored replacements for visible text that carries no data-i18n key.
# Matched on whitespace-normalised exact text of a text node (el.text or a
# child's tail) that is NOT inside a data-i18n element. Numbers, addresses,
# contract names, code identifiers and brand marks are matched implicitly and
# left alone by not having an entry.
# ---------------------------------------------------------------------------

GLOBAL_MANUAL = {
    # wallet / shared UI
    "Connect wallet": "连接钱包",
    "Not connected": "未连接",
    "Unregistered": "未登记",
    "Copy": "复制",
    "Contract": "合约",
    "Address": "地址",
    "BNB Smart Chain Testnet": "BNB 智能链测试网",
    # airdrop page
    "Verify": "验证",
    "Progress": "进度",
    "Rules": "规则",
    "Anti-scam": "防骗提示",
    "Wallet + Participate": "钱包 + 参与任务",
    "Task 1": "任务 1",
    "Task 2": "任务 2",
    "Task 3": "任务 3",
    "Referral — invite friends, earn extra entries (no tokens move)":
        "邀请好友，获得额外份数（不转移任何代币）",
    # index page
    "Live": "实时",
    "Verification policy": "验证政策",
    # tokenomics tables
    "Tokenomics": "代币经济",
    "🪙 Token": "🪙 代币",
    "🔥 Maximum supply": "🔥 最大供应量",
    "📈 At TGE": "📈 TGE 时",
    "At TGE": "TGE 时",
    "⛓ Chain": "⛓ 公链",
    "6.55% circulating": "流通 6.55%",
    "Category": "类别",
    "Share": "份额",
    "Amount (OMC)": "数量（OMC）",
    "Total": "合计",
    "Unlocked (OMC)": "解锁（OMC）",
    "Circulating at TGE": "TGE 流通量",
    "Cliff": "锁定期",
    "Then": "之后",
    "Community airdrop": "社区空投",
    "Compute mining and node rewards": "算力挖矿与节点奖励",
    "Ecosystem and grants": "生态与资助",
    "Institutional investors": "机构投资者",
    "Team and core contributors": "团队与核心贡献者",
    "Private investors": "私募投资者",
    "Treasury and liquidity": "国库与流动性",
    "3 months": "3 个月",
    "6 months": "6 个月",
    "12 months": "12 个月",
    "6 months lock": "锁定 6 个月",
    "Monthly linear over 18 months": "18 个月按月线性释放",
    "Monthly linear over 24 months": "24 个月按月线性释放",
    "Monthly linear over 36 months": "36 个月按月线性释放",
    "Paid in full at claim; 0.01 BNB per entry, not refundable":
        "领取时全额到账；每份 0.01 BNB，不退还",
    "Remainder managed by the DAO Treasury": "其余由 DAO 国库管理",
    "Emission schedule, section 5": "释放曲线见第 5 节",
    "0.01 BNB claim fee per entry that is not refunded":
        "每份 0.01 BNB 的领取手续费，不退还",
    "Airdrop page": "空投页",
    "Tier": "档位",
    "Hardware class": "硬件类别",
    "Target bond (USD)": "目标质押额（USD）",
    "OMC on the testnet today": "测试网当前数量（tOMC）",
    "20 (placeholder)": "20（占位）",
    "100 (placeholder)": "100（占位）",
    "500 (placeholder)": "500（占位）",
    "1,000 (placeholder)": "1,000（占位）",
    "5,000 (placeholder)": "5,000（占位）",
    "Consumer GPU, up to 24 GB VRAM (RTX 3090 / 4090 class)":
        "消费级 GPU，显存 ≤ 24 GB（RTX 3090 / 4090 级）",
    "Workstation / professional GPU (RTX A6000, L40S class)":
        "工作站 / 专业 GPU（RTX A6000、L40S 级）",
    "Data-centre GPU, 80 GB class (A100 / H100 single card)":
        "数据中心 GPU，80 GB 级（A100 / H100 单卡）",
    "Multi-GPU data-centre node (2–8 accelerators)":
        "多卡数据中心节点（2–8 张加速卡）",
    "Cluster-scale deployment (multi-node)": "集群级部署（多节点）",
    "Offence": "违规行为",
    "Penalty": "罚没比例",
    "Job timeout": "任务超时",
    "Unexpected offline during an active job": "任务执行中意外离线",
    "Incorrect output (failed verification)": "输出错误（未通过验证）",
    "Proven fraud or fake heartbeat": "查实作弊或伪造心跳",
    "50% to compensate affected requesters, 30% to the DAO Treasury and 20% burned":
        "50% 赔偿受影响的需求方，30% 进 DAO 国库，20% 销毁",
    "denominated in USD": "以美元计价",
    "$20 deposit": "20 美元保证金",
    "It is a maximum, not a promise.": "它是上限，不是承诺。",
    "It needs no price oracle.": "它不需要价格预言机。",
    "It releases itself.": "它会自我解除。",
    "Staking page": "质押页",
    "Testnet page": "测试网",
    "Whitepaper page": "白皮书",
    "Whitepaper section 7": "白皮书第 7 节",
    "Repository": "代码仓库",
    "OMC token (tOMC)": "OMC 代币（tOMC）",
    "That is not an audit, and we do not describe it as one":
        "这不是审计，我们也不把它说成审计",
    "Not financial advice": "非财务建议",
    # testnet page
    "Faucet": "领水",
    "Earn tOMC": "赚取 tOMC",
    "Ladder: 20/100/500/1000/5000 tOMC — same on mainnet":
        "质押阶梯：20/100/500/1000/5000 tOMC——主网同额",
}

TOKENOMICS_MANUAL = {
    "1,000,000,000 OMC, fixed at deployment. Here is where every token sits, who can move it, and when.":
        "1,000,000,000 OMC，部署时固定。每个代币在哪里、谁能动它、什么时候能动，都在这一页。",
    "Parameters marked": "白皮书中标记为",
    "in the whitepaper are validated on the testnet and may change through governance before mainnet. Where a figure can be read directly from a contract, this page links to it so you can check it yourself rather than take our word for it.":
        "的参数正在测试网验证，主网前可能经治理调整。凡能直接从合约读出的数字，本页都给出链接，你可以自行核对，而不是听我们说。",
    "Every number on this page is a design target published in advance, not a promise of performance.":
        "本页所有数字都是提前公布的设计目标，不是对业绩的承诺。",
    "proposed": "拟议",
    "1 · Supply": "1 · 供应",
    "OMC is a BEP-20 token on BNB Chain with a fixed maximum supply of":
        "OMC 是 BNB Chain 上的 BEP-20 代币，最大供应量固定为",
    ". There is no inflation parameter and no mechanism that can raise the cap.":
        "。没有通胀参数，也没有任何机制能提高上限。",
    "Two mechanisms reduce supply. Nothing increases it:":
        "有两种机制减少供应，没有任何机制增加供应：",
    "Every settled job pays an": "每笔完成的任务支付",
    "protocol fee, charged to the requester on top of the provider's quoted price.":
        "协议费，向需求方收取，在提供者报价之外。",
    "by the contract at settlement, which reduces total supply directly. That is":
        "在结算时由合约直接销毁，直接减少总供应量，相当于",
    "— 4.4× the sink of the previous 3%/30% split, which destroyed 0.9% and could not offset emission at any volume a new network reaches.":
        "是此前 3%/30% 方案沉淀的 4.4 倍；旧方案只销毁 0.9%，在任何新网络所能达到的交易量下都无法对冲增发。",
    "Fee burn.": "手续费销毁。",
    "50% of that fee is destroyed": "该费用的 50% 被销毁",
    "4.0% of settled job volume": "相当于已结算任务量的 4.0%",
    "30% of the fee is distributed pro-rata to staked nodes. Unlike emissions this is revenue, not dilution, and it is the only staking yield that survives a falling token price.":
        "费用的 30% 按比例分给质押节点。与增发不同，这是收入而不是稀释，也是币价下跌时仍然成立的唯一质押收益。",
    "Fee share to stakers.": "质押者费用分成。",
    "20% of any slashed stake is burned. See section 6.": "罚没质押的 20% 被销毁，见第 6 节。",
    "Slashing burn.": "罚没销毁。",
    "The remaining 50% is split": "其余 50% 分配为",
    ". The staker slice matters: paid only in emissions, a staker has no reason to hold beyond farming, which makes the position mercenary by construction. A share of fees is revenue, and it survives a falling token price.":
        "。给质押者的这一份很关键：若只靠增发支付，质押者没有任何持仓理由，挖提卖是结构性的；费用分成是收入，币价下跌时依然成立。",
    "30% to staked nodes pro-rata": "30% 按比例给质押节点",
    "20% to the Treasury": "20% 进国库",
    "2 · Distribution": "2 · 分配",
    "The full 1,000,000,000 supply is allocated at deployment. Nothing is held back outside these seven categories.":
        "全部 1,000,000,000 供应在部署时即完成分配，七类之外没有任何保留。",
    "The community airdrop is listed separately from the investor allocations on purpose: it is the one allocation with no round behind it — no price was set for it, and nobody bought into it. Entries are earned by doing the tasks, and claiming carries a":
        "社区空投单列出来，是有意的：它是唯一没有轮次背景的份额——没有为它定过价，也没有人按价买入。份数靠完成任务挣得，领取时收取",
    "— 0.05 BNB for a base claim of five entries. It is a flat processing fee, charged per entry and independent of the token price; it funds development and operations, and the":
        "——基础 5 份即 0.05 BNB。这是按份平收的固定手续费，与代币价格无关；用于开发与运营，",
    "publishes the amount and the split.": "公布金额与分配比例。",
    "3 · Circulating supply at TGE": "3 · TGE 流通量",
    "About": "约",
    "enters circulation on day one (1 January 2027):": "在首日（2027 年 1 月 1 日）进入流通：",
    "65,500,000 OMC — 6.55% of maximum supply —": "65,500,000 OMC——最大供应量的 6.55%——",
    "Treasury and liquidity — 50% of the allocation, for initial liquidity":
        "国库与流动性——份额的 50%，用于初始流动性",
    "Community airdrop — delivered in full at claim": "社区空投——领取时全额到账",
    "Private investors — 10% of the allocation": "私募投资者——份额的 10%",
    "Ecosystem and grants — 5% of the allocation": "生态与资助——份额的 5%",
    "Institutional investors — 5% of the allocation": "机构投资者——份额的 5%",
    "That allocation is subject to a 12-month cliff and then vests monthly over 24 months, so it cannot reach the market before 2028. Node rewards likewise start at zero and are released only against verified work (section 5).":
        "团队份额有 12 个月锁定期，之后 24 个月按月释放，2028 年前不可能进入市场。节点奖励同样从零开始，只随已验证的工作释放（第 5 节）。",
    "No team or core-contributor tokens unlock at TGE.": "TGE 时没有任何团队或核心贡献者代币解锁。",
    "A public vesting dashboard is planned to show locked and unlocked balances for every category against the contract balance.":
        "计划上线公开的释放面板，对照合约余额展示每一类的锁定与解锁数量。",
    "4 · Vesting and cliffs": "4 · 释放与锁定期",
    "5 · Emission schedule for node rewards": "5 · 节点奖励释放曲线",
    "The 500,000,000 OMC node-reward pool is": "500,000,000 OMC 的节点奖励池由",
    "that cannot be minted before 2037 without a governance vote. The scheduled ceilings are 10,000,000 in year 1, 20,000,000 in year 2, 30,000,000 in year 3, 40,000,000 in year 4 and 50,000,000 a year from year 5 to year 10, released linearly by day within each year. They are ceilings, not entitlements.":
        "组成，不经治理投票，2037 年前无法铸造。计划上限为：第 1 年 10,000,000、第 2 年 20,000,000、第 3 年 30,000,000、第 4 年 40,000,000，第 5 至 10 年每年 50,000,000，年内按天线性释放。这些是上限，不是应得额度。",
    "400,000,000 scheduled plus a 100,000,000 DAO reserve":
        "400,000,000 计划额度与 100,000,000 DAO 储备两部分组成",
    "The curve is deliberately back-loaded. A flat 50,000,000 OMC in year 1 is":
        "曲线刻意后置。第 1 年就平发 50,000,000 OMC，相当于",
    "(65,500,000 OMC), paid to a network with no paying demand yet — dilution against a use case that does not exist, and new tokens whose only buyer is a market maker. A halving curve errs the other way, spending three quarters of the pool inside four years. Starting at 10,000,000 cuts first-year dilution to 15% of float.":
        "（总流通 65,500,000 OMC）的 76%，发给一个尚无付费需求的网络——对着不存在的用例稀释，新代币唯一的买家是做市商。减半曲线则是另一个极端，四年内花掉池子的四分之三。从 10,000,000 起步，把首年稀释压到流通量的 15%。",
    "76% of the entire TGE float": "整个 TGE 流通盘的 76%",
    "The rate paid in any period is": "任一期间实际支付的费率为",
    ", with": "，其中",
    "decaying from": "衰减系数从第 1 年的",
    "in year 1 to": "逐步降到",
    "from year 6. A schedule can only say how fast the pool may be spent; the gate says how fast it is spent relative to what the network earns. No revenue means no emission, so a network that never finds demand never inflates.":
        "第 6 年起为 1.0。释放曲线只说明池子最多可以多快花掉；闸门说明相对于网络收入它实际多快被花掉。没有收入就没有增发，永远找不到需求的网络永远不会通胀。",
    "Emission is capped by revenue, not only by the calendar.":
        "增发受收入约束，而不只受日历约束。",
    "The consequence is the cleanest number on this page. Inside the gate both burn and emission are linear in fee revenue, so their ratio is":
        "由此得到本页最干净的数字。闸门之内，销毁与增发都对手续费收入呈线性，因此两者的比例",
    ": 17% in year 1, 25% in year 2, 33%, 50%, 67%, and":
        "为：第 1 年 17%、第 2 年 25%、33%、50%、67%，以及",
    "— at which point emission equals burn and circulating supply stops growing at any scale. Above the gate, when the network is genuinely earning, the ceiling binds instead, and because the burn keeps scaling with volume those years are deflationary. Unemitted amounts stay unminted; the pool is not a promise to mint.":
        "——此时增发等于销毁，无论规模多大，流通量都不再增长。闸门之上，当网络真正有收入时，起约束作用的是年度上限；由于销毁随交易量继续放大，那些年份是通缩的。未释放的部分保持未铸造；池子不是铸造承诺。",
    "independent of volume and of price": "与交易量和价格无关",
    "100% from year 6": "第 6 年起 100%",
    "6 · Staking ladder and slashing": "6 · 质押阶梯与罚没",
    "Nodes stake OMC before they may accept jobs. The required amount is a published five-rung ladder. Rungs are":
        "节点必须先质押 OMC 才能接单。要求金额是公开的五档阶梯，各档",
    "and restated into OMC at each re-peg, so the bond keeps its size while the token price moves. The amounts on the testnet are placeholders;":
        "计价，并在每次重新锚定时折算成 OMC，因此保证金规模不随币价漂移。测试网金额为占位值；",
    "reads the live OMC figure from the contract.": "会从合约读取实时 OMC 数值。",
    "The steps are non-linear by design: the rungs separate provider classes rather than pricing a small step up in hardware. Two problems in the old fixed-OMC ladder are worth stating, because both were arithmetic. First, 20 OMC per tier-1 machine was a":
        "阶梯刻意非线性：档位区分的是提供者类别，而不是给硬件的小幅升级定价。旧固定 OMC 阶梯有两个问题值得说明，因为它们都是算术问题。第一，每台一档机器 20 OMC，等于",
    "behind a $1,500 GPU at a one-dollar token — a guarantee in wording only. Second, tier 1 was exactly one airdrop entry and tier 2 exactly one full airdrop, so a wallet could mint a stake out of nothing and draw emissions without ever buying OMC. USD pricing fixes the first outright and the second as a side effect: a maximum airdrop is 100 OMC, and turning that into a $250 tier-1 bond would need OMC at $2.50. Targets and the amounts last applied are recorded in":
        "的保证金去押一台 1,500 美元的 GPU——按 1 美元币价，这只是字面上的担保。第二，一档恰好等于一次空投份额、二档恰好等于一份满额空投，钱包可以凭空铸出质押金并领取增发，全程不用买 OMC。美元定价直接解决第一个问题，顺带解决第二个：空投上限是 100 OMC，要凑成 250 美元的一档保证金，OMC 需要到 2.50 美元。目标值与最近一次生效的金额记录在",
    "Slashing penalties, as a percentage of the stake:": "罚没比例（占质押金的百分比）：",
    "Slashed tokens are split": "罚没的代币分配为",
    ". The whole split is applied by the staking contract itself; the compute-market contract does not pay any of it a second time.":
        "。整个分配由质押合约执行；算力市场合约不会重复支付。",
    "7 · The staking reward ceiling": "7 · 质押奖励上限",
    "Node rewards are emitted at a rate per second, and a fixed rate pays the same absolute amount however little is staked — which, over a nearly empty pool, would imply a meaningless annualised figure. The scope of that problem is bounded by arithmetic, not by policy:":
        "节点奖励按每秒费率释放，固定费率下无论质押多少，支付的都是同样的绝对数量——在几乎空置的池子上，这会推出一个毫无意义的年化数字。这个问题的边界由算术而非政策决定：",
    "the staking contract clamps the rate it actually pays to a ceiling derived from the total amount staked":
        "质押合约把实际支付的费率钳制在一个由总质押量推导出的上限之内",
    ", and both the ceiling and the rate in force are readable from the contract at any time.":
        "，上限与当前费率随时可以从合约读出。",
    "Three properties matter, and all three are enforced on-chain:":
        "三个性质很关键，而且全部在链上强制执行：",
    "It bounds what a staker can be paid per unit of stake. It never raises that bound, and it never guarantees a payout.":
        "它限定每单位质押最多能被支付多少；从不抬高这个界限，也从不保证有支付。",
    "Rewards and stake are denominated in the same token, so the bound is pure arithmetic and cannot be dodged by moving a price.":
        "奖励与质押以同一种代币计价，界限是纯算术，无法通过操纵价格绕开。",
    "While total stake is small the ceiling binds and the emission schedule is irrelevant; as stake grows the ceiling stops binding on its own and the schedule in section 5 takes over.":
        "总质押量小时由上限约束，释放曲线无关紧要；质押量增长后，上限自然失效，第 5 节的曲线接管。",
    "This site publishes no advertised rate of return, because none exists. Staking on OMC is a security deposit that can be partially or fully slashed, not a yield product. The live rate in force is shown on the":
        "本站不公布任何预期收益率，因为不存在这回事。质押 OMC 是一笔可能被部分或全部罚没的保证金，不是收益产品。当前生效的费率显示在",
    ", read from the contract.": "，从合约读取。",
    "8 · Contracts": "8 · 合约",
    "The live contracts are on": "已部署的合约在",
    "(chainId 97). They are published here so that everything above can be checked against the chain rather than against this page.":
        "（chainId 97）。在此公布，是为了让上文的一切都能对照链上数据核验，而不是对照本页。",
    "It is not sold anywhere, it is not listed on any exchange, and it will not carry over to mainnet. Never send real funds to these addresses.":
        "它不在任何地方出售、不上任何交易所，也不会映射到主网。切勿向这些地址发送真实资金。",
    "These are testnet contracts and tOMC has no monetary value.":
        "以上为测试网合约，tOMC 没有任何货币价值。",
    "9 · Where to verify all of this": "9 · 在哪里核验这些内容",
    "— the authoritative text for payments, distribution, the emission schedule and slashing, on the":
        "——支付、分配、释放曲线与罚没的权威文本，在",
    "— RPC endpoints, deployment records and the node onboarding guide, at":
        "——RPC 端点、部署记录与节点接入指南，在",
    "— the ladder, the live emission rate in force and the exit procedure, at":
        "——阶梯、当前生效的释放费率与退出流程，在",
    "— contract sources, deployment manifests and the automated security-testing evidence, at":
        "——合约源码、部署清单与自动化安全测试证据，在",
    ". The contracts have been through automated security testing.":
        "。合约已通过自动化安全测试。",
    "— see": "——见",
    "Nothing on this page is an offer to sell, or a solicitation of an offer to buy, any token or security. OMC is a utility token for a decentralized computing network. Digital assets are volatile and carry the risk of total loss. Do your own research and comply with the laws of your jurisdiction.":
        "本页任何内容均不构成出售任何代币或证券的要约，也不构成任何购买要约的邀请。OMC 是去中心化计算网络的实用型代币。数字资产价格波动剧烈，存在血本无归的风险。请自行研究并遵守所在司法辖区的法律。",
}

MANUAL_PER_PAGE = {"tokenomics.html": {**GLOBAL_MANUAL, **TOKENOMICS_MANUAL}}


def norm(s):
    return re.sub(r"\s+", " ", s).strip()


def zh_href_map():
    """Both forms: body links are root-relative ("/airdrop"), but some
    generated blocks use absolute URLs."""
    m = {}
    for slug in BATCH.values():
        en = en_url(slug)
        zh = zh_url(slug)
        m[en] = zh
        m[en.replace(ORIGIN, "")] = zh.replace(ORIGIN, "")
        # "/" for the home page
    m["/"] = "/zh"
    return m


def set_i18n_inner(el, value):
    frag = LH.fragment_fromstring("<div>" + value + "</div>")
    for c in list(el):
        el.remove(c)
    el.text = frag.text or ""
    for c in frag:
        el.append(copy.deepcopy(c))


def add_zh_hreflang(doc, zh_target):
    if doc.xpath('//link[@hreflang="zh"]'):
        return
    anchor = doc.xpath('//link[@rel="alternate" and @hreflang="x-default"]')
    link = LH.fragment_fromstring(
        f'<link rel="alternate" hreflang="zh" href="{zh_target}"/>')
    if anchor:
        anchor[0].addnext(link)
    else:  # fall back: after head's canonical
        doc.xpath('//head/link[@rel="canonical"]')[0].addnext(link)


def patch_en_page(path, slug):
    """Insert the zh hreflang line right after x-default. Text-level edit on
    purpose: routing the en pages through the lxml serializer rewrites every
    line of them (attribute order, entities), which is churn the diff does
    not need."""
    text = path.read_text(encoding="utf-8")
    if 'hreflang="zh"' in text:
        return
    target = zh_url(slug)
    m = re.search(r'([ \t]*<link rel="alternate" hreflang="x-default"[^\n]*\n)', text)
    assert m, f"{path.name}: x-default link not found"
    line = m.group(1)
    indent = re.match(r"[ \t]*", line).group(0)
    text = text.replace(
        line,
        line + f'{indent}<link rel="alternate" hreflang="zh" href="{target}" />\n',
        1)
    path.write_text(text, encoding="utf-8")


def build_page(name, slug, zh):
    src = WEB / f"{name}.html"
    doc = LH.parse(str(src)).getroot()
    report = []

    doc.set("lang", "zh-CN")

    # head metadata
    for title in doc.xpath("//head/title"):
        k = title.get("data-i18n")
        if k and k in zh:
            title.text = zh[k]
    for meta in doc.xpath("//meta[@data-i18n-content]"):
        k = meta.get("data-i18n-content")
        if k in zh:
            meta.set("content", zh[k])
        if meta.get("property") == "og:locale":
            meta.set("content", zh.get("meta.og_locale", "zh_CN"))
    for el in doc.xpath('//link[@rel="canonical"]') + doc.xpath('//meta[@property="og:url"]'):
        el.set("href" if el.tag == "link" else "content", zh_url(slug))
    add_zh_hreflang(doc, zh_url(slug))

    # body: dictionary-driven replacements
    # (snapshot first: set_i18n_inner rewrites subtrees, which breaks iter())
    used = set()
    for el in list(doc.body.iter()):
        k = el.get("data-i18n")
        if k and k in zh:
            set_i18n_inner(el, zh[k])
            used.add(k)
    # every data-i18n key used on this page must exist in the dictionary
    for el in doc.body.iter():
        k = el.get("data-i18n")
        if k and k not in zh:
            report.append(f"MISSING dict key: {k}")
    for el in list(doc.body.iter()):
        ph = el.get("data-i18n-ph")
        if ph and ph in zh:
            el.set("placeholder", zh[ph])
            used.add(ph)

    # manual replacements on untagged text nodes (text + tails)
    manual = MANUAL_PER_PAGE.get(f"{name}.html", GLOBAL_MANUAL)
    hit = set()

    def try_replace(owner, attr):
        raw = getattr(owner, attr) or ""
        if not raw.strip():
            return
        # skip anything inside a tagged element
        if owner.get("data-i18n") or any(a.get("data-i18n") for a in owner.iterancestors()):
            return
        t = norm(raw)
        if t in manual:
            setattr(owner, attr, manual[t])
            hit.add(t)

    for el in list(doc.body.iter()):
        try_replace(el, "text")
    for el in list(doc.body.iter()):
        for c in list(el):
            try_replace(c, "tail")
    for k in TOKENOMICS_MANUAL:
        if name == "tokenomics.html" and k not in hit:
            report.append(f"UNUSED manual entry: {k[:60]!r}")

    # keep the visitor inside /zh/ for pages that exist there
    hrefs = zh_href_map()
    for a in doc.body.xpath("//a[@href]"):
        h = a.get("href")
        if h in hrefs:
            a.set("href", hrefs[h])

    # the en pages reference assets relative to the site root ("assets/...").
    # From /zh/<page> that would resolve to /zh/assets/... — 404. Make the
    # zh copies root-absolute.
    for el in doc.iter():
        for attr_name in ("href", "src"):
            v = el.get(attr_name)
            if v and v.startswith("assets/"):
                el.set(attr_name, "/" + v)

    out = WEB / "zh" / f"{name}.html"
    out.parent.mkdir(exist_ok=True)
    out.write_text("<!DOCTYPE html>\n" + LH.tostring(doc, encoding="unicode"),
                   encoding="utf-8")
    return report, out


def main():
    do_patch_en = "--patch-en" in sys.argv
    zh = load_zh_dict()
    failures = []
    for name, slug in BATCH.items():
        if do_patch_en:
            patch_en_page(WEB / f"{name}.html", slug)
            print(f"patched en: {name}.html")
            continue
        report, out = build_page(name, slug, zh)
        for line in report:
            print(f"{name}: {line}")
        if any(line.startswith("MISSING") for line in report):
            failures.append(name)
        print(f"built {out.relative_to(WEB.parent)}")
    if failures:
        print("FAILURES:", failures)
        sys.exit(1)


if __name__ == "__main__":
    main()
