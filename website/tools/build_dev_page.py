#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generate the developers documentation page (English + Chinese).

This is a standalone page, deliberately NOT one of the three topic pillars in
build_topic_pages.py. It reuses that module's head/skeleton builders so the
canonical, hreflang triple and JSON-LD are identical to the rest of the site,
but it does not touch TOPICS, the backlink block, or any hardcoded guard list.

The sitemap builder discovers website/*.html and website/zh/*.html automatically,
so the two pages land in the sitemap with correct en/zh alternates on the next
build. Re-run with:

    python website/tools/build_dev_page.py
    python website/tools/inject_facts.py
    python website/tools/build_sitemap.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_topic_pages as tpl  # noqa: E402  (same-directory reuse)

DEV = {
    "slug": "developers",
    "badge": {"en": "Developer documentation", "zh": "开发者文档"},
    "title": {
        "en": "Developers API & Node Guide — OMC",
        "zh": "开发者 API 与节点指南 — OMC 泛宇宙算力",
    },
    "h1": {"en": "Build on OMC", "zh": "在 OMC 上开发"},
    "sub": {
        "en": "The public endpoints, the signed message format, and the node onboarding path — documented from the code that actually runs.",
        "zh": "公开接口、签名消息格式与节点接入路径——全部依据实际运行的代码编写。",
    },
    "desc": {
        "en": "OMC developer reference: the airdrop REST API, the canonical wallet-signature message, entry caps, and the four-step testnet node onboarding path.",
        "zh": "OMC 开发者参考：空投 REST API（GET /api/airdrop/summary、POST /api/airdrop/entry）、规范钱包签名消息、名额上限，以及四步测试网节点接入流程。",
    },
    "body": {
        "en": """
<p><strong>The Omniverse Compute (OMC) public surface is small on purpose: two read/write endpoints for the airdrop, one canonical signature message, and a documented node path. Everything below is taken from the code that runs in production, so the fields and error codes match what your client will actually receive.</strong></p>

<h2 class="as-h3">Before you start</h2>
<ul>
<li><strong>Network.</strong> Testnet runs on BNB Smart Chain Testnet, chain ID <code>97</code>, symbol <code>tOMC</code>. Full RPC, explorer and faucet details live on the <a href="/testnet">testnet page</a>.</li>
<li><strong>Wallet.</strong> Signing is gas-free — you sign a message, you do not send a transaction. The only on-chain fee in the project is the airdrop claim fee, charged later at claim, not at registration.</li>
<li><strong>Base URL.</strong> All endpoints below are relative to <code>https://omc.network</code>.</li>
</ul>

<h2 class="as-h3">GET /api/airdrop/summary</h2>
<p>Read service status, campaign caps, and — when a wallet is supplied — that wallet's recorded entries. Used on page load to drive the progress ticker and to resume a session on another device.</p>
<table style="width:100%;border-collapse:collapse;margin:18px 0;font-size:.95rem">
<tbody>
<tr><td style="padding:8px 12px;border-bottom:1px solid rgba(128,128,128,.28)"><strong>Query</strong></td><td style="padding:8px 12px;border-bottom:1px solid rgba(128,128,128,.28)"><code>address</code> (optional) — <code>0x</code> + 40 hex characters. It is a lookup key only; reading another wallet reveals no more than the chain already shows.</td></tr>
<tr><td style="padding:8px 12px;border-bottom:1px solid rgba(128,128,128,.28)"><strong>200 — no address</strong></td><td style="padding:8px 12px;border-bottom:1px solid rgba(128,128,128,.28)"><code>{ ok, status, frozen?, totals?: { wallets, entries, amount, is_frozen }, caps: { base, referral, perEntry, total } }</code>. <code>totals</code> is omitted when the ledger migration has not yet applied — the page then falls back to its static copy rather than showing zeros as if they were real.</td></tr>
<tr><td style="padding:8px 12px;border-bottom:1px solid rgba(128,128,128,.28)"><strong>200 — with address</strong></td><td style="padding:8px 12px;border-bottom:1px solid rgba(128,128,128,.28)"><code>{ ok: true, entries: { base, referral, total, today, amount, cap }, day, canParticipate, caps, allocation }</code>.</td></tr>
<tr><td style="padding:8px 12px;border-bottom:1px solid rgba(128,128,128,.28)"><strong>Errors</strong></td><td style="padding:8px 12px;border-bottom:1px solid rgba(128,128,128,.28)"><code>405 METHOD</code> (GET only) · <code>400 BAD_ADDRESS</code> · <code>503 UNAVAILABLE</code> / <code>SCHEMA_UNAVAILABLE</code> · <code>500 SERVER_ERROR</code>.</td></tr>
</tbody>
</table>
<p><strong>Caps in effect:</strong> <code>base = 5</code> entries per wallet (lifetime), <code>referral = 5</code> bonus entries an inviter can earn (lifetime), <code>perEntry = 20</code> OMC, across <code>1,000,000</code> pool slots. These mirror the on-chain parameters and are asserted against them in the test suite.</p>

<h2 class="as-h3">POST /api/airdrop/entry</h2>
<p>Register one daily entry. The server rebuilds the signed message from its parsed fields and compares it byte for byte — a signer cannot quietly change the day or the referrer after signing — and the recovered signer must equal the claimed address.</p>
<table style="width:100%;border-collapse:collapse;margin:18px 0;font-size:.95rem">
<tbody>
<tr><td style="padding:8px 12px;border-bottom:1px solid rgba(128,128,128,.28)"><strong>Body</strong></td><td style="padding:8px 12px;border-bottom:1px solid rgba(128,128,128,.28)"><code>{ address, message, signature, referrer? }</code> — all strings; <code>address</code> and any <code>referrer</code> are lower-cased <code>0x</code> addresses; <code>signature</code> is an ECDSA signature over <code>message</code>.</td></tr>
<tr><td style="padding:8px 12px;border-bottom:1px solid rgba(128,128,128,.28)"><strong>200 family</strong></td><td style="padding:8px 12px;border-bottom:1px solid rgba(128,128,128,.28)"><code>{ ok, code, ... }</code>. <code>code: "OK"</code> means the entry was recorded; other codes report the cap or pool state without a server error.</td></tr>
<tr><td style="padding:8px 12px;border-bottom:1px solid rgba(128,128,128,.28)"><strong>Errors</strong></td><td style="padding:8px 12px;border-bottom:1px solid rgba(128,128,128,.28)"><code>405 METHOD</code> (POST only) · <code>400 BAD_REQUEST / BAD_MESSAGE / BAD_SIGNATURE</code> · <code>409 STALE_MESSAGE</code> (the signature is bound to one UTC+8 day — yesterday's signature is dead) · <code>503 UNAVAILABLE / SCHEMA_UNAVAILABLE</code> · <code>500 SERVER_ERROR</code>.</td></tr>
</tbody>
</table>

<h2 class="as-h3">The canonical signature message</h2>
<p>Sign exactly this string. The server calls <code>buildMessage()</code> from the parsed fields and requires an exact match, so any reworded, reordered or appended text is rejected. The day inside the message is what kills replay: a signature harvested today cannot register an entry tomorrow.</p>
<pre style="white-space:pre-wrap;background:rgba(128,128,128,.1);padding:16px;border-radius:8px;overflow-x:auto"><code>Omniverse Compute (OMC) — airdrop entry

Address: 0x&lt;your 40-hex address&gt;
Day: 2026-11-23 (UTC+8)
Referrer: none
Nonce: &lt;16 hex characters&gt;

Signing this message registers one airdrop entry for the day above.
It costs no gas and grants no spending rights.</code></pre>
<ul>
<li><code>Address</code>, <code>Referrer</code>: lower-case <code>0x</code> + 40 hex. Use <code>none</code> when there is no referrer; a referrer equal to the signer is rejected.</li>
<li><code>Day</code>: the UTC+8 calendar day in <code>YYYY-MM-DD</code>. The campaign resets at 00:00 UTC+8.</li>
<li><code>Nonce</code>: exactly 16 hex characters.</li>
</ul>
<p>Sign with a standard personal-sign flow (for example <code>eth_signMessage</code> / <code>personal_sign</code>). The server recovers the signer and requires it to equal the <code>Address</code> field.</p>

<h2 class="as-h3">Run a testnet node</h2>
<p>Consumer GPUs are enough for the testnet — an RTX 3090 or 4090 lands in tier 1 (under 24&nbsp;GB VRAM), which is what the faucet covers. The path is four steps, documented on the <a href="/testnet">testnet page</a>: add the network, fund the wallet from the faucet, stake tOMC to a tier, and register the node. One staking ladder — <code>20 / 100 / 500 / 1000 / 5000 tOMC</code> — runs on both testnet and mainnet; registering now positions the node for the same tier at launch.</p>
<p>Each job runs under a per-job verification policy — spot-check re-execution or full redundancy across 2–3 nodes. Fraudulent outputs, timeouts and fake heartbeats are slashed: 50% to requesters, 30% to the DAO treasury, 20% burned.</p>

<h2 class="as-h3">Other entry points</h2>
<ul>
<li><a href="/whitepaper">Whitepaper</a> — architecture, verification, staking and tokenomics.</li>
<li><a href="/compute">Compute station</a> — the compute product surface.</li>
<li><a href="/verifiable-compute">Verifiable compute</a> — how verification tiers are priced.</li>
<li><a href="https://github.com/CBTdao/omc-network" target="_blank" rel="noopener">Source on GitHub</a> — website, docs and contribution guide under MIT.</li>
</ul>
""",
        "zh": """
<p><strong>Omniverse Compute (OMC) 的公开接口刻意做得很小：空投的两个读写端点、一条规范签名消息，以及有文档的节点接入路径。以下全部取自生产环境实际运行的代码，字段与错误码与你的客户端真正收到的内容一致。</strong></p>

<h2 class="as-h3">开始之前</h2>
<ul>
<li><strong>网络。</strong>测试网运行在 BNB Smart Chain Testnet，链 ID <code>97</code>，符号 <code>tOMC</code>。完整的 RPC、浏览器与水龙头信息见<a href="/zh/testnet">测试网页面</a>。</li>
<li><strong>钱包。</strong>签名不消耗 gas——你签一条消息，不发交易。项目里唯一上链的费用是稍后在领取时收取的空投手续费，注册环节不收费。</li>
<li><strong>基础地址。</strong>下列端点均相对于 <code>https://omc.network</code>。</li>
</ul>

<h2 class="as-h3">GET /api/airdrop/summary</h2>
<p>读取服务状态、活动名额上限，在提供钱包地址时还会返回该钱包已登记的名额。页面加载时用它驱动进度看板，也让用户在另一台设备上继续之前的进度。</p>
<table style="width:100%;border-collapse:collapse;margin:18px 0;font-size:.95rem">
<tbody>
<tr><td style="padding:8px 12px;border-bottom:1px solid rgba(128,128,128,.28)"><strong>查询参数</strong></td><td style="padding:8px 12px;border-bottom:1px solid rgba(128,128,128,.28)"><code>address</code>（可选）——<code>0x</code> 开头 + 40 位十六进制字符。它只作为查询键；读取他人钱包不会得到链上本就公开之外的信息。</td></tr>
<tr><td style="padding:8px 12px;border-bottom:1px solid rgba(128,128,128,.28)"><strong>200 · 无地址</strong></td><td style="padding:8px 12px;border-bottom:1px solid rgba(128,128,128,.28)"><code>{ ok, status, frozen?, totals?: { wallets, entries, amount, is_frozen }, caps: { base, referral, perEntry, total } }</code>。当账本迁移尚未执行时 <code>totals</code> 会省略——页面随即回退到静态文案，而不是把零当成真实数据显示。</td></tr>
<tr><td style="padding:8px 12px;border-bottom:1px solid rgba(128,128,128,.28)"><strong>200 · 带地址</strong></td><td style="padding:8px 12px;border-bottom:1px solid rgba(128,128,128,.28)"><code>{ ok: true, entries: { base, referral, total, today, amount, cap }, day, canParticipate, caps, allocation }</code>。</td></tr>
<tr><td style="padding:8px 12px;border-bottom:1px solid rgba(128,128,128,.28)"><strong>错误</strong></td><td style="padding:8px 12px;border-bottom:1px solid rgba(128,128,128,.28)"><code>405 METHOD</code>（仅 GET）· <code>400 BAD_ADDRESS</code> · <code>503 UNAVAILABLE</code> / <code>SCHEMA_UNAVAILABLE</code> · <code>500 SERVER_ERROR</code>。</td></tr>
</tbody>
</table>
<p><strong>当前名额上限：</strong>每个钱包终身 <code>base = 5</code> 个自有名额，邀请人终身可得 <code>referral = 5</code> 个奖励名额，每个名额 <code>perEntry = 20</code> OMC，共 <code>1,000,000</code> 个池位。这些数值与链上参数一致，并在测试套件中对照校验。</p>

<h2 class="as-h3">POST /api/airdrop/entry</h2>
<p>登记当日的一个名额。服务端会从解析出的字段重建签名消息并逐字节比对——签名者无法在签名后偷偷改动日期或邀请人——且恢复出的签名者必须等于声明的地址。</p>
<table style="width:100%;border-collapse:collapse;margin:18px 0;font-size:.95rem">
<tbody>
<tr><td style="padding:8px 12px;border-bottom:1px solid rgba(128,128,128,.28)"><strong>请求体</strong></td><td style="padding:8px 12px;border-bottom:1px solid rgba(128,128,128,.28)"><code>{ address, message, signature, referrer? }</code>——均为字符串；<code>address</code> 与可选的 <code>referrer</code> 为小写 <code>0x</code> 地址；<code>signature</code> 是对 <code>message</code> 的 ECDSA 签名。</td></tr>
<tr><td style="padding:8px 12px;border-bottom:1px solid rgba(128,128,128,.28)"><strong>200 系列</strong></td><td style="padding:8px 12px;border-bottom:1px solid rgba(128,128,128,.28)"><code>{ ok, code, ... }</code>。<code>code: "OK"</code> 表示名额已登记；其他 code 用于报告名额或池位状态，不属于服务端错误。</td></tr>
<tr><td style="padding:8px 12px;border-bottom:1px solid rgba(128,128,128,.28)"><strong>错误</strong></td><td style="padding:8px 12px;border-bottom:1px solid rgba(128,128,128,.28)"><code>405 METHOD</code>（仅 POST）· <code>400 BAD_REQUEST / BAD_MESSAGE / BAD_SIGNATURE</code> · <code>409 STALE_MESSAGE</code>（签名绑定单个 UTC+8 自然日——昨天的签名失效）· <code>503 UNAVAILABLE / SCHEMA_UNAVAILABLE</code> · <code>500 SERVER_ERROR</code>。</td></tr>
</tbody>
</table>

<h2 class="as-h3">规范签名消息</h2>
<p>请签署下面这条字符串。服务端会从解析出的字段调用 <code>buildMessage()</code> 并要求精确匹配，因此任何改写、重排或追加的文本都会被拒绝。消息里包含日期，正是它阻止了重放：今天截获的签名明天无法登记名额。</p>
<pre style="white-space:pre-wrap;background:rgba(128,128,128,.1);padding:16px;border-radius:8px;overflow-x:auto"><code>Omniverse Compute (OMC) — airdrop entry

Address: 0x&lt;你的 40 位十六进制地址&gt;
Day: 2026-11-23 (UTC+8)
Referrer: none
Nonce: &lt;16 位十六进制字符&gt;

Signing this message registers one airdrop entry for the day above.
It costs no gas and grants no spending rights.</code></pre>
<ul>
<li><code>Address</code>、<code>Referrer</code>：小写 <code>0x</code> + 40 位十六进制。无邀请人时填 <code>none</code>；邀请人等于签名者会被拒绝。</li>
<li><code>Day</code>：UTC+8 自然日，格式 <code>YYYY-MM-DD</code>。活动在 UTC+8 00:00 重置。</li>
<li><code>Nonce</code>：恰好 16 位十六进制字符。</li>
</ul>
<p>用标准的个人签名流程签署（例如 <code>eth_signMessage</code> / <code>personal_sign</code>）。服务端恢复签名者并要求其等于 <code>Address</code> 字段。</p>

<h2 class="as-h3">运行测试网节点</h2>
<p>消费级显卡就足够跑测试网——RTX 3090 或 4090 落在档位一（显存低于 24&nbsp;GB），正是水龙头覆盖的范围。路径分四步，详见<a href="/zh/testnet">测试网页面</a>：添加网络、从水龙头为钱包注资、质押 tOMC 到某档位、注册节点。一条质押阶梯——<code>20 / 100 / 500 / 1000 / 5000 tOMC</code>——在测试网与主网通用；现在注册可让节点在上线时进入同一档位。</p>
<p>每个任务按单独任务的验证策略执行——抽检复算，或 2–3 个节点全量冗余。虚假输出、超时与伪造心跳会被罚没：50% 归请求方，30% 归 DAO 金库，20% 永久销毁。</p>

<h2 class="as-h3">其他入口</h2>
<ul>
<li><a href="/zh/whitepaper">白皮书</a>——架构、验证、质押与代币经济。</li>
<li><a href="/zh/compute">算力站</a>——算力产品界面。</li>
<li><a href="/zh/verifiable-compute">可验证算力</a>——验证档位如何定价。</li>
<li><a href="https://github.com/CBTdao/omc-network" target="_blank" rel="noopener">GitHub 源码</a>——网站、文档与贡献指南，MIT 许可。</li>
</ul>
""",
    },
}


def main(argv):
    check = "--check" in argv
    stale = []
    for lang, rel in (("en", "developers.html"), ("zh", "zh/developers.html")):
        path = tpl.WEB / rel
        content = tpl.build_page(lang, DEV)
        old = path.read_text(encoding="utf-8") if path.exists() else None
        if old is not None and tpl.normalize(old) == tpl.normalize(content):
            continue
        if check:
            stale.append(rel)
            continue
        path.write_text(content, encoding="utf-8")
        print("wrote website/" + rel)
    if check:
        if stale:
            print("STALE (run: python website/tools/build_dev_page.py)")
            for s in stale:
                print("  " + s)
            return 1
        print("developer page is current")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
