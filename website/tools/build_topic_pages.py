#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generate the three topic pillars (English + Chinese) from the site skeleton.

These pages are the answer to "why are so few pages indexed": the daily news
feed is a list, and a list is one URL. A topic pillar is a stable, independent
URL with a definitional first sentence, a parameter table and a Q&A block —
the shape that answer engines and editors can quote a paragraph from.

The head, navigation and footer come from about.html / zh/about.html so every
page keeps the site's identity block, facts stamp and verification meta. Only
the metadata and the article body are replaced. Re-run after editing TOPICS:

    python website/tools/build_topic_pages.py
    python website/tools/inject_facts.py
    python website/tools/build_sitemap.py
"""

import html
import json
import re
import sys
from pathlib import Path

WEB = Path(__file__).resolve().parent.parent
ORIGIN = "https://omc.network"

TPL = {"en": WEB / "about.html", "zh": WEB / "zh" / "about.html"}


def link_row(k, v):
    return f"<tr><td style=\"padding:8px 12px;border-bottom:1px solid rgba(128,128,128,.28)\"><strong>{k}</strong></td><td style=\"padding:8px 12px;border-bottom:1px solid rgba(128,128,128,.28)\">{v}</td></tr>"


def table(rows):
    body = "".join(link_row(k, v) for k, v in rows)
    return (
        '<table style="width:100%;border-collapse:collapse;margin:18px 0;font-size:.95rem">'
        f"<tbody>{body}</tbody></table>"
    )


def related(items):
    lis = "".join(f'<li><a href="{u}">{t}</a></li>' for t, u in items)
    return f"<ul>{lis}</ul>"


TOPICS = [
    {
        "slug": "agent-economy",
        "badge": {"en": "Agent economy", "zh": "智能体经济"},
        "title": {
            "en": "Compute for the Agent Economy — OMC",
            "zh": "面向智能体经济的算力 — OMC 泛宇宙算力",
        },
        "h1": {"en": "Compute for the Agent Economy", "zh": "面向智能体经济的算力"},
        "sub": {
            "en": "Always-on inference, machine-to-machine payment, and settlement per verified result.",
            "zh": "常驻推理、机器对机器支付，按可验证结果结算。",
        },
        "desc": {
            "en": "OMC's settlement layer for the agent economy: agents buy GPU time, pay per verified result, and settle machine-to-machine on BNB Chain.",
            "zh": "OMC 正在构建智能体经济的结算层：自主智能体购买 GPU 算力、为可验证的推理结果付费，并在 BNB Chain 上完成机器对机器结算。本文给出模型、参数与路线图。",
        },
        "body": {
            "en": """
<p><strong>Omniverse Compute (OMC) is building the settlement layer for the agent economy: autonomous software buys GPU time, pays for verified results, and settles machine-to-machine on BNB Chain.</strong> The unit of commerce moves from a reserved GPU hour to a completed, checkable inference — the only thing an agent actually consumes.</p>

<h2 class="as-h3">From GPU hours to verified outcomes</h2>
<p>Cloud pricing starts with a reservation: rent a box for an hour, keep the queue short, pay whether the job succeeds or not. An always-on agent has the opposite shape. It emits thousands of small requests, each with a result that can be checked, and it needs a price attached to that result rather than to the idle hardware around it.</p>
<p>OMC prices compute at the outcome. A requester escrows the job, a node runs it, and the release condition is the verifiable completion of that job. Matching, staking and settlement sit behind that one sentence — the commercial interface stays deliberately small: one request, one result, one settlement.</p>

<h2 class="as-h3">Machine-to-machine payment is the default</h2>
<p>Agents do not fill in billing forms. They need a credential, a meter and a way to top up without a human in the loop. OMC's tool endpoints use prepaid credits redeemed against an on-chain transfer: the service verifies the transaction on BNB Chain, debits one unit per completed job, and returns the unit when inference fails. The server holds no private key, and tool revenue is accounted for separately from every other flow in the project.</p>
<p>That pattern scales down to sub-cent requests and up to long-running agents that buy capacity continuously. It is also the shape on-chain settlement was built for: small, frequent, auditable transfers between two programs.</p>

<h2 class="as-h3">Why inference, and why now</h2>
<p>Training is episodic; inference is continuous. As agents move from demos into production, the demand curve stops resembling a quarterly batch job and starts resembling a utility bill. The bottleneck shifts from raw FLOPS to availability, verification and settlement latency — the three things a decentralized grid competes on.</p>
<p>Routing therefore treats verification as a dial. Spot-check re-execution suits batch work; redundant execution across independent nodes suits high-stakes results; hardware TEEs suit confidential workloads. Requesters choose the policy and pay for the assurance their job needs. The <a href="/verifiable-compute">verifiable compute page</a> describes the ladder.</p>

<h2 class="as-h3">The parameters behind the model</h2>
""" + table([
    ("Settlement layer", "BNB Chain · chain ID 56"),
    ("Token", "BEP-20 · OMC · fixed supply"),
    ("Billing unit", "one verified result"),
    ("Verification", "requester-selectable: spot-check / redundancy / TEE"),
    ("Payment", "prepaid credits redeemed against an on-chain transfer"),
    ("Off-chain signatures", "ML-DSA (Dilithium, FIPS 204)"),
    ("Roadmap", "agent settlement → M2M metering → verifiable inference → post-quantum migration"),
]) + """

<h2 class="as-h3">Questions</h2>
<h3>What does an agent actually pay for?</h3>
<p>A completed result that passes the verification policy chosen for that job. Hardware time is an input to the node's own economics, not the line item on the requester's invoice.</p>
<h3>Who holds the funds while a job runs?</h3>
<p>The job fee sits in escrow and releases when the verifiable end state is reached. For metered tool traffic, prepaid credits are debited per completed call and returned when a call fails.</p>
<h3>Where does this go next?</h3>
<p>Agent-facing APIs, continuous metering, and a verification ladder priced by risk. Each stage is published on the <a href="/news">news page</a> and in the <a href="/whitepaper">whitepaper</a>.</p>

<h2 class="as-h3">Explore</h2>
""" + related([
    ("Verifiable compute & outcome-based billing", "/verifiable-compute"),
    ("Post-quantum signature migration", "/post-quantum"),
    ("The compute network", "/compute"),
    ("Whitepaper", "/whitepaper"),
    ("AI tools", "/ai-tools"),
    ("Project news", "/news"),
    ("DCF — long-form compute research", "https://forum.omc.network"),
    ("AITop — AI tool comparisons", "https://top.omc.network"),
]) + "\n",
            "zh": """
<p><strong>OMC 泛宇宙算力正在构建智能体经济的结算层：自主运行的软件购买 GPU 算力、为可验证的结果付费，并在 BNB Chain 上完成机器对机器结算。</strong>交易单位从「预留一小时 GPU」变成「一次完成且可校验的推理」——这才是智能体真正消耗的东西。</p>

<h2 class="as-h3">从 GPU 小时到可验证结果</h2>
<p>云厂商的定价从预留开始：租一台机器一小时，把队列压短，任务成功与否都照付。常驻运行的智能体恰好相反：它持续发出成千上万个小请求，每个请求都有可校验的结果，价格应该挂在这个结果上，而不是挂在结果周围的闲置硬件上。</p>
<p>OMC 按结果计费。请求方把任务费用托管，节点执行任务，放款条件就是任务的可验证完成态。任务匹配、质押与结算都藏在这句话背后，对外只留一个极简的商业接口：一次请求、一个结果、一次结算。</p>

<h2 class="as-h3">机器对机器支付是默认形态</h2>
<p>智能体不会填账单。它需要凭证、计量器，以及无人介入即可充值的方式。OMC 的工具端点采用预付额度：一笔链上转账兑换成额度，服务在 BNB Chain 上核验该交易，每完成一次调用扣一格，推理失败则退回这一格。服务端不持有私钥，工具收入与项目其他资金流分账核算。</p>
<p>这套模式向下覆盖分厘级请求，向上支撑持续采购算力的长驻智能体。它也是链上结算最擅长的形状：两个程序之间，小额、高频、可审计的转账。</p>

<h2 class="as-h3">为什么是推理，为什么是现在</h2>
<p>训练是阵发性的，推理是连续的。当智能体从演示走向生产，需求曲线就不再像季度批处理任务，而更像一张水电账单。瓶颈从纯粹算力转向可用性、验证与结算延迟——恰好是去中心化算力网格能正面竞争的三件事。</p>
<p>因此调度把验证做成一个档位：批处理适合抽检复算，高价值结果适合多节点冗余执行，机密负载适合硬件 TEE。请求方按任务的实际风险选档、按所选保证付费。<a href="/zh/verifiable-compute">可验证算力页</a>给出了完整档位。</p>

<h2 class="as-h3">模型参数</h2>
""" + table([
    ("结算层", "BNB Chain · 链 ID 56"),
    ("代币", "BEP-20 · OMC · 固定供应量"),
    ("计费单位", "一次可验证结果"),
    ("验证方式", "请求方自选：抽检复算 / 冗余执行 / TEE"),
    ("支付方式", "预付额度，凭链上转账兑换"),
    ("链下签名", "ML-DSA（Dilithium，FIPS 204）"),
    ("路线图", "智能体结算 → M2M 计量 → 可验证推理 → 抗量子迁移"),
]) + """

<h2 class="as-h3">常见问题</h2>
<h3>智能体到底为什么付钱？</h3>
<p>为一个通过所选验证策略的完整结果付钱。硬件时间是节点自身经济模型里的投入项，不是请求方账单上的条目。</p>
<h3>任务执行期间资金由谁保管？</h3>
<p>任务费用进入托管，达到可验证终态后释放。工具流量走预付额度，每次成功调用扣减，调用失败自动退回。</p>
<h3>接下来往哪走？</h3>
<p>面向智能体的 API、连续计量、按风险定价的验证档位。每个阶段都在<a href="/zh/news">动态页</a>与<a href="/zh/whitepaper">白皮书</a>公布。</p>

<h2 class="as-h3">延伸阅读</h2>
""" + related([
    ("可验证算力与结果计费", "/zh/verifiable-compute"),
    ("抗量子签名迁移", "/zh/post-quantum"),
    ("算力网络", "/zh/compute"),
    ("白皮书", "/zh/whitepaper"),
    ("AI 工具", "/zh/ai-tools"),
    ("项目动态", "/zh/news"),
    ("DCF 算力研究", "https://forum.omc.network"),
    ("AITop 工具对比", "https://top.omc.network"),
]) + "\n",
        },
    },
    {
        "slug": "verifiable-compute",
        "badge": {"en": "Verifiable compute", "zh": "可验证算力"},
        "title": {
            "en": "Verifiable Compute & Outcome-Based Billing — OMC",
            "zh": "可验证算力与结果计费 — OMC 泛宇宙算力",
        },
        "h1": {"en": "Verifiable Compute", "zh": "可验证算力"},
        "sub": {
            "en": "Trust-minimized inference, priced per result, with a verification dial the requester controls.",
            "zh": "可信最小化的推理，按结果计价，验证档位由请求方掌控。",
        },
        "desc": {
            "en": "How OMC verifies GPU work: escrow, spot-checks, redundancy, TEEs — billed per verified result, not per GPU hour. Parameters and FAQ.",
            "zh": "OMC 如何验证去中心化 GPU 任务：托管、抽检复算、冗余执行、硬件 TEE 与声誉机制；计费锚定可验证结果而非 GPU 小时。含参数表与问答。",
        },
        "body": {
            "en": """
<p><strong>Verifiable compute is decentralized GPU work whose completion can be checked before anyone gets paid.</strong> OMC makes that check a requester-controlled dial — spot-check re-execution, redundant execution across independent nodes, or a hardware trusted execution environment — and bills against the checked result instead of the reserved GPU hour.</p>

<h2 class="as-h3">Escrow first, compute second</h2>
<p>A requester locks the job fee in escrow before a node is dispatched. Release is tied to the job reaching a verifiable end state. The release condition lives in the contract rather than in an operator's promise, which removes the simplest failure mode: taking payment for work nobody did.</p>
<p>Escrow settles payment fraud. Correctness is a separate question, and that is where verification comes in.</p>

<h2 class="as-h3">Verification is per job, not per network</h2>
<p>There is no single switch that makes arbitrary computation trustworthy. The right policy depends on what the job is and what a wrong answer costs:</p>
<ul>
<li><strong>Spot-check re-execution</strong> — re-run a random sample of batch work on a second node and compare output hashes. Catches silent errors and lazy nodes at a cost proportional to the check rate.</li>
<li><strong>Redundant execution</strong> — dispatch the same task to 2–3 independent nodes and accept consensus. The strongest option, reserved for results whose downside is expensive.</li>
<li><strong>Hardware TEE</strong> — prove the computation ran inside shielded hardware for confidential models and datasets, trading portability for confidentiality.</li>
</ul>
<p>Treating verification as a dial rather than a flag is what makes outcome-based billing practical: every job carries the assurance it needs, and no job pays for assurance it does not need.</p>

<h2 class="as-h3">Reputation is the slow signal</h2>
<p>Escrow and verification settle one job. Reputation makes the next thousand cheaper. Nodes that complete work, pass checks and stay online accumulate standing; routing weights that standing together with TFLOPS, VRAM and bandwidth. The matching score is published in the <a href="/whitepaper">whitepaper</a>, and the tier ladder is live on the <a href="/testnet">testnet</a>.</p>

<h2 class="as-h3">The parameters</h2>
""" + table([
    ("Settlement", "BNB Chain · chain ID 56 · escrow release on verifiable completion"),
    ("Billing unit", "one verified result"),
    ("Verification ladder", "spot-check / redundancy / hardware TEE"),
    ("Routing inputs", "TFLOPS, VRAM, bandwidth, reputation"),
    ("Failure handling", "metered tool calls return the debited credit"),
    ("Off-chain signatures", "ML-DSA (Dilithium, FIPS 204)"),
]) + """

<h2 class="as-h3">Questions</h2>
<h3>Does every job need redundant execution?</h3>
<p>No. Redundancy is the expensive end of the ladder. Batch preprocessing usually needs only sampling; a high-value result is where consensus earns its cost.</p>
<h3>What happens when a node returns a plausible but wrong answer?</h3>
<p>The chosen verification policy decides: sampling compares hashes, redundancy compares independent results, and failing a check keeps the escrow from releasing.</p>
<h3>How is this priced?</h3>
<p>Per verified result. The requester selects the verification policy, and that choice is part of the job's price. See <a href="/agent-economy">compute for the agent economy</a> for the settlement model.</p>

<h2 class="as-h3">Explore</h2>
""" + related([
    ("Compute for the agent economy", "/agent-economy"),
    ("Post-quantum signature migration", "/post-quantum"),
    ("The compute network", "/compute"),
    ("Whitepaper", "/whitepaper"),
    ("Testnet & node onboarding", "/testnet"),
    ("DCF — GPU market analysis", "https://forum.omc.network"),
]) + "\n",
            "zh": """
<p><strong>可验证算力，指的是去中心化 GPU 任务在任何人收款之前，其完成状态可以被校验。</strong>OMC 把校验做成请求方可控的档位——抽检复算、跨独立节点冗余执行、硬件可信执行环境——并把账单锚定在校验通过的结果上，而不是预留的 GPU 小时。</p>

<h2 class="as-h3">先托管，后计算</h2>
<p>请求方在节点被派单之前把任务费用锁进托管，放款条件绑定任务达到可验证终态。这个条件写在合约里，而不是运营方的承诺里，直接消除了最基础的失效模式：为没人做的工作收钱。</p>
<p>托管解决的是付款欺诈。结果是否正确是另一个问题，验证机制负责这一层。</p>

<h2 class="as-h3">验证按任务，而不是按网络</h2>
<p>没有一个开关能让任意计算自动可信。策略取决于任务本身，以及答错的代价：</p>
<ul>
<li><strong>抽检复算</strong>——对批处理任务随机抽样，在第二个节点重跑并比对输出哈希。成本随抽检比例线性增长，足以拦住静默错误与偷懒节点。</li>
<li><strong>冗余执行</strong>——同一任务派给 2–3 个独立节点，以共识取结果。最稳也最贵，留给答错代价高的任务。</li>
<li><strong>硬件 TEE</strong>——为机密模型与数据证明计算确实发生在隔离硬件内，以可移植性换机密性。</li>
</ul>
<p>把验证当成档位而不是开关，结果计费才成立：每个任务只带自己需要的保证，不为用不上的保证付钱。</p>

<h2 class="as-h3">声誉是慢变量</h2>
<p>托管与验证结算单次任务，声誉让后面一千次更便宜。稳定完成、通过校验、保持在线的节点累积信用；调度把信用与算力、显存、带宽一起加权。匹配评分写在<a href="/zh/whitepaper">白皮书</a>，档位阶梯在<a href="/zh/testnet">测试网</a>上运行。</p>

<h2 class="as-h3">参数</h2>
""" + table([
    ("结算", "BNB Chain · 链 ID 56 · 达到可验证完成态后释放托管"),
    ("计费单位", "一次可验证结果"),
    ("验证档位", "抽检复算 / 冗余执行 / 硬件 TEE"),
    ("调度输入", "算力、显存、带宽、声誉"),
    ("失败处理", "按次计费的工具调用退回已扣额度"),
    ("链下签名", "ML-DSA（Dilithium，FIPS 204）"),
]) + """

<h2 class="as-h3">常见问题</h2>
<h3>每个任务都要冗余执行吗？</h3>
<p>不需要。冗余是档位里最贵的一端。批处理预处理通常抽检就够，高价值结果才值得为共识付费。</p>
<h3>节点返回了一个看起来合理但错误的结果怎么办？</h3>
<p>由所选验证策略裁决：抽检比对哈希，冗余比对独立结果，校验不通过则托管不释放。</p>
<h3>怎么计价？</h3>
<p>按可验证结果计价。请求方选定的验证策略是任务价格的一部分，结算模型见<a href="/zh/agent-economy">面向智能体经济的算力</a>。</p>

<h2 class="as-h3">延伸阅读</h2>
""" + related([
    ("面向智能体经济的算力", "/zh/agent-economy"),
    ("抗量子签名迁移", "/zh/post-quantum"),
    ("算力网络", "/zh/compute"),
    ("白皮书", "/zh/whitepaper"),
    ("测试网与节点接入", "/zh/testnet"),
    ("DCF 算力市场分析", "https://forum.omc.network"),
]) + "\n",
        },
    },
    {
        "slug": "post-quantum",
        "badge": {"en": "Signature agility", "zh": "签名敏捷性"},
        "title": {
            "en": "Post-Quantum Signature Migration — OMC",
            "zh": "抗量子签名迁移 — OMC 泛宇宙算力",
        },
        "h1": {"en": "Post-Quantum Signature Migration", "zh": "抗量子签名迁移"},
        "sub": {
            "en": "ML-DSA off chain today, signature agility in the contracts, and a migration path that follows the base layer.",
            "zh": "链下已用 ML-DSA，合约保留签名敏捷性，迁移路径跟随底层链标准。",
        },
        "desc": {
            "en": "OMC's post-quantum programme: ML-DSA (FIPS 204) off chain, signature agility in contracts, and a migration path following BNB Chain. Timeline and FAQ.",
            "zh": "OMC 的抗量子路线：链下服务流量采用 ML-DSA（Dilithium，FIPS 204）签名，已有可运行的验证实现；合约可升级，跟随 BNB Chain 标准；地址卫生指引已发布。含迁移节奏与问答。",
        },
        "body": {
            "en": """
<p><strong>OMC's post-quantum programme starts on the layers the project controls: service traffic signed by OMC already uses ML-DSA (Dilithium, FIPS 204), contracts keep signature agility, and the migration path follows BNB Chain as it adopts post-quantum signature standards.</strong> Custody on the base layer uses ECDSA / secp256k1 — the same assumption shared by every BSC asset — and the timeline is published as a roadmap.</p>

<h2 class="as-h3">ML-DSA on the service layer</h2>
<p>The ai-tools service and claim authorizations are the parts of the stack whose signature scheme OMC chooses itself. They use ML-DSA, the NIST FIPS 204 standard derived from Dilithium, with a working keygen / sign / verify implementation published in <code>ai-tools-service/dilithium-poc</code>. ML-DSA-65 keys and signatures are measured in that repository so the cost of the migration is visible rather than hypothetical.</p>
<p>Starting here has a practical advantage: the service layer ships on our schedule, while base-layer signature support moves on the chain's schedule. Both tracks advance in parallel.</p>

<h2 class="as-h3">Signature agility in the contracts</h2>
<p>Upgradeable contracts plus a verification interface that can accept new schemes are the mechanism that makes a later migration an orderly rollout. Privileged roles move to a 3-of-5 multisig with a 48-hour timelock before mainnet, and independent audits complete before launch — the same access-control work that governs every other upgrade.</p>
<p>The <a href="https://github.com/CBTdao/omc-network/blob/main/docs/post-quantum-roadmap.md" target="_blank" rel="noopener">post-quantum roadmap</a> tracks the standards work, the address-hygiene guidance and the migration stages in one place.</p>

<h2 class="as-h3">Address hygiene and harvest-now-decrypt-later</h2>
<p>Public keys become visible when an address is used. Guidance published for users covers address reuse, key rotation and the handling of long-lived authorizations, so the migration is a change of scheme rather than a scramble to clean up years of exposure.</p>

<h2 class="as-h3">The parameters</h2>
""" + table([
    ("Off-chain signatures", "ML-DSA (Dilithium, FIPS 204)"),
    ("Reference implementation", "ai-tools-service/dilithium-poc · ML-DSA-65 / ML-DSA-87"),
    ("Base-layer custody", "BNB Chain · ECDSA / secp256k1"),
    ("Contract model", "upgradeable · multisig + 48-hour timelock before mainnet"),
    ("Standards tracking", "BNB Chain post-quantum migration work, NIST FIPS 203/204/205"),
    ("User guidance", "address hygiene, key rotation, long-lived authorizations"),
]) + """

<h2 class="as-h3">Questions</h2>
<h3>Which parts of the stack use post-quantum signatures today?</h3>
<p>Off-chain traffic signed by OMC: the ai-tools service and claim authorizations. The verification implementation and its measured key and signature sizes are in the public repository.</p>
<h3>How does token custody migrate?</h3>
<p>By following the base layer. Contracts are upgradeable, the verification interface accepts new schemes, and the rollout stages are published on the roadmap alongside the chain's own standards work.</p>
<h3>What can a user do now?</h3>
<p>Follow the address-hygiene guidance: avoid reuse, rotate keys where practical, and keep long-lived authorizations short. Those habits pay off regardless of which scheme the chain adopts.</p>

<h2 class="as-h3">Explore</h2>
""" + related([
    ("Compute for the agent economy", "/agent-economy"),
    ("Verifiable compute", "/verifiable-compute"),
    ("Mainnet access control", "https://github.com/CBTdao/omc-network/blob/main/docs/mainnet-access-control.md"),
    ("Post-quantum roadmap", "https://github.com/CBTdao/omc-network/blob/main/docs/post-quantum-roadmap.md"),
    ("Whitepaper §6", "/whitepaper"),
    ("Project news", "/news"),
]) + "\n",
            "zh": """
<p><strong>OMC 的抗量子工作从项目自己掌控的层开始：OMC 签发的链下服务流量已采用 ML-DSA（Dilithium，FIPS 204）签名，合约保留签名敏捷性，迁移路径跟随 BNB Chain 采纳抗量子签名标准的节奏。</strong>底层托管沿用 ECDSA / secp256k1——与 BSC 上所有资产相同的底层假设——迁移时间线以路线图形式公开。</p>

<h2 class="as-h3">服务层已用 ML-DSA</h2>
<p>ai-tools 服务与领取授权，是整套架构里由 OMC 自己选择签名方案的部分。它们采用 NIST FIPS 204 标准 ML-DSA（源自 Dilithium），密钥生成 / 签名 / 验证的可运行实现公开在 <code>ai-tools-service/dilithium-poc</code>。该仓库实测给出 ML-DSA-65 的密钥与签名尺寸，让迁移成本是可查看的数字，而不是估算。</p>
<p>从这里起步有一个现实优势：服务层按我们的排期推进，底层签名支持按链的排期推进，两条线并行前进。</p>

<h2 class="as-h3">合约里的签名敏捷性</h2>
<p>可升级合约，加上能够接纳新方案的验证接口，让后续迁移成为一次有序 rollout。主网前，合约特权角色移交 3-of-5 多签 + 48 小时时间锁，独立审计在主网上线前完成——同一套访问控制也管着其他所有升级。</p>
<p><a href="https://github.com/CBTdao/omc-network/blob/main/docs/post-quantum-roadmap.md" target="_blank" rel="noopener">抗量子路线图</a>把标准跟进、地址卫生指引与各迁移阶段收在一处。</p>

<h2 class="as-h3">地址卫生与「先收割、后解密」</h2>
<p>地址一旦使用，公钥就会暴露。面向用户的指引覆盖地址复用、密钥轮换与长期授权的处理方式，让迁移只是换一套方案，而不是临时清理多年累积的暴露面。</p>

<h2 class="as-h3">参数</h2>
""" + table([
    ("链下签名", "ML-DSA（Dilithium，FIPS 204）"),
    ("参考实现", "ai-tools-service/dilithium-poc · ML-DSA-65 / ML-DSA-87"),
    ("底层托管", "BNB Chain · ECDSA / secp256k1"),
    ("合约模型", "可升级 · 主网前移交多签 + 48 小时时间锁"),
    ("标准跟进", "BNB Chain 抗量子迁移工作、NIST FIPS 203/204/205"),
    ("用户指引", "地址卫生、密钥轮换、长期授权"),
]) + """

<h2 class="as-h3">常见问题</h2>
<h3>现在哪些部分使用抗量子签名？</h3>
<p>由 OMC 签发的链下流量：ai-tools 服务与领取授权。验证实现及实测的密钥、签名尺寸都在公开仓库里。</p>
<h3>代币托管怎么迁移？</h3>
<p>跟随底层链。合约可升级，验证接口接纳新方案，rollout 阶段与链上标准进展一起写在路线图里。</p>
<h3>用户现在能做什么？</h3>
<p>按地址卫生指引来：避免复用、可轮换的密钥及时轮换、长期授权尽量缩短。无论链最终采纳哪套方案，这些习惯都划算。</p>

<h2 class="as-h3">延伸阅读</h2>
""" + related([
    ("面向智能体经济的算力", "/zh/agent-economy"),
    ("可验证算力", "/zh/verifiable-compute"),
    ("主网访问控制", "https://github.com/CBTdao/omc-network/blob/main/docs/mainnet-access-control.md"),
    ("抗量子路线图", "https://github.com/CBTdao/omc-network/blob/main/docs/post-quantum-roadmap.md"),
    ("白皮书 §6", "/zh/whitepaper"),
    ("项目动态", "/zh/news"),
]) + "\n",
        },
    },
]


def split_template(lang):
    """(nav, tail) — everything outside the article body, unchanged."""
    s = TPL[lang].read_text(encoding="utf-8")
    b = s.index("<body")
    b = s.index(">", b) + 1
    h = s.index('<header class="hero', b)
    f = s.index("<footer", b)
    return s[b:h], s[f:]


def org_script(lang):
    s = TPL[lang].read_text(encoding="utf-8")
    for m in re.finditer(r'<script type="application/ld\+json">([\s\S]*?)</script>', s):
        if '"@type":"Organization"' in m.group(1) or '"@type": "Organization"' in m.group(1):
            return m.group(0)
    raise SystemExit("Organization JSON-LD not found in template")


def build_head(lang, slug, m):
    is_zh = lang == "zh"
    url = f"{ORIGIN}/{'zh/' if is_zh else ''}{slug}"
    en_url = f"{ORIGIN}/{slug}"
    zh_url = f"{ORIGIN}/zh/{slug}"
    title = html.escape(m["title"], quote=True)
    desc = html.escape(m["desc"], quote=True)
    css = "/assets/css/" if is_zh else "assets/css/"
    page_ld = (
        '{"@context":"https://schema.org","@type":"WebPage",'
        f'"name":{json_str(m["h1"])},"url":"{url}",'
        f'"description":{json_str(m["desc"])},'
        f'"inLanguage":"{"zh-CN" if is_zh else "en"}",'
        '"isPartOf":{"@type":"WebSite","name":"Omniverse Compute","url":"https://omc.network"}}'
    )
    crumb = (
        '{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":['
        f'{{"@type":"ListItem","position":1,"name":"Home","item":"{ORIGIN}/"}},'
        f'{{"@type":"ListItem","position":2,"name":{json_str(m["h1"])},"item":"{url}"}}]}}'
    )
    return "\n".join([
        "<head>",
        '  <meta charset="UTF-8" />',
        '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
        '  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />',
        f"  <title>{title}</title>",
        f'  <meta name="description" content="{desc}">',
        f'  <link rel="canonical" href="{url}">',
        f'  <link rel="alternate" hreflang="en" href="{en_url}" />',
        f'  <link rel="alternate" hreflang="x-default" href="{en_url}" />',
        f'  <link rel="alternate" hreflang="zh" href="{zh_url}" />',
        f'  <link rel="alternate" type="application/rss+xml" title="OMC news" href="{ORIGIN}/news/feed.xml" />',
        '  <meta property="og:site_name" content="Omniverse Compute">',
        '  <meta property="og:type" content="article">',
        f'  <meta property="og:title" content="{title}">',
        f'  <meta property="og:description" content="{desc}">',
        f'  <meta property="og:url" content="{url}">',
        '  <meta property="og:image" content="https://omc.network/og-image.png">',
        '  <meta property="og:image:width" content="1200">',
        '  <meta property="og:image:height" content="630">',
        f'  <meta property="og:locale" content="{"zh_CN" if is_zh else "en_US"}">',
        '  <meta name="twitter:card" content="summary_large_image">',
        '  <meta name="twitter:site" content="@Omniverse_Depin">',
        f'  <meta name="twitter:title" content="{title}">',
        f'  <meta name="twitter:description" content="{desc}">',
        '  <meta name="twitter:image" content="https://omc.network/og-image.png">',
        f'  <link rel="stylesheet" href="{css}app.css?v=20261027a" />',
        f'  <link rel="stylesheet" href="{css}footer-chain.css?v=20261027a" />',
        f'  <link rel="stylesheet" href="{css}net-canvas.css?v=20261027a" />',
        '  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />',
        '  <link rel="icon" type="image/x-icon" href="/favicon.ico" sizes="any" />',
        '  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />',
        "  " + org_script(lang),
        '  <script type="application/ld+json">',
        "  " + page_ld,
        "  </script>",
        '  <script type="application/ld+json">',
        "  " + crumb,
        "  </script>",
        "</head>",
        "",
    ])


def json_str(s):
    """Minimal JSON string literal for a value that contains no control chars."""
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def build_page(lang, t):
    slug = t["slug"]
    m = {k: (v[lang] if isinstance(v, dict) else v) for k, v in t.items()}
    nav, tail = split_template(lang)
    lang_attr = "zh-CN" if lang == "zh" else "en"
    hero = "\n".join([
        '  <header class="hero" style="padding-bottom: 30px;">',
        '    <div class="container">',
        f'      <div class="hero-badge"><span class="dot"></span><span>{html.escape(m["badge"])}</span></div>',
        f'      <h1>{html.escape(m["h1"])}</h1>',
        f'      <p class="sub">{html.escape(m["sub"])}</p>',
        "    </div>",
        "  </header>",
        "",
        '  <section class="section" style="padding-top: 20px;">',
        '    <div class="container">',
        '      <div class="wp-body reveal" style="max-width: 820px; margin: 0 auto;">',
        m["body"],
        "      </div>",
        "    </div>",
        "  </section>",
        "",
    ])
    return (
        "<!DOCTYPE html>\n"
        f'<html lang="{lang_attr}">\n'
        + build_head(lang, slug, m)
        + "<body>\n"
        + nav
        + hero
        + tail
    )


BEGIN = "<!-- TOPIC_DEEP_DIVES:BEGIN -->"
END = "<!-- TOPIC_DEEP_DIVES:END -->"


def backlink_block(lang):
    """The reverse link: an existing, frequently fetched page points at the pillars."""
    zh = lang == "zh"
    root = "/zh/" if zh else "/"
    intro = (
        "三篇延伸阅读，讲网络正在走向哪里：常驻智能体负载、按结果计费的验证机制，以及签名迁移路径。"
        if zh else
        "Three deeper reads on where the network is heading: always-on agent workloads, "
        "verification priced per result, and the signature migration path."
    )
    items = [
        ("面向智能体经济的算力" if zh else "Compute for the Agent Economy", root + "agent-economy"),
        ("可验证算力" if zh else "Verifiable Compute", root + "verifiable-compute"),
        ("抗量子签名迁移" if zh else "Post-Quantum Signature Migration", root + "post-quantum"),
    ]
    lis = "".join(f'<li><a href="{u}">{t}</a></li>' for t, u in items)
    body = "\n".join([
        '  <section class="section" style="padding-top: 0;">',
        '    <div class="container">',
        '      <div class="wp-body reveal" style="max-width: 820px; margin: 0 auto;">',
        f'        <h2 class="as-h3">{"延伸阅读" if zh else "Deep dives"}</h2>',
        f"        <p>{intro}</p>",
        f"        <ul>{lis}</ul>",
        "      </div>",
        "    </div>",
        "  </section>",
    ])
    return BEGIN + "\n" + body + "\n  " + END + "\n"


def sync_backlinks(lang, check, stale):
    rel = "zh/compute.html" if lang == "zh" else "compute.html"
    path = WEB / rel
    s = path.read_text(encoding="utf-8")
    block = backlink_block(lang)
    if BEGIN in s and END in s:
        i, j = s.index(BEGIN), s.index(END) + len(END)
        new = s[:i] + block.rstrip("\n") + s[j:]
    else:
        k = s.index("<footer")
        new = s[:k] + block + "\n" + s[k:]
    if new == s:
        return
    if check:
        stale.append(rel + " (topic backlinks)")
        return
    path.write_text(new, encoding="utf-8")
    print("linked website/" + rel)


LD_BLOCK = re.compile(r'<script type="application/ld\+json">[\s\S]*?</script>')


def normalize(s):
    """Ignore the three stamps that inject_facts.py owns.

    This generator rewrites a whole page, while inject_facts.py deliberately
    edits only the identity block, the WebPage date and the footer stamp. A
    byte comparison would therefore report "stale" forever after every stamp
    pass. Comparing the page with those three parts scrubbed asks the question
    that actually matters: did the article or its metadata change?
    """
    def scrub(m):
        raw = m.group(0)
        body = raw.split(">", 1)[1].rsplit("<", 1)[0].strip()
        try:
            node = json.loads(body)
        except ValueError:
            return re.sub(r"\s+", " ", raw)
        if node.get("@type") == "Organization":
            return "ORGANIZATION_SCRIPT"
        node.pop("dateModified", None)
        return json.dumps(node, ensure_ascii=False, sort_keys=True, separators=(",", ":"))

    s = LD_BLOCK.sub(scrub, s)
    s = re.sub(r'<span class="facts-v">[\s\S]*?</span>', '<span class="facts-v">STAMP</span>', s)
    return s


def main(argv):
    check = "--check" in argv
    stale = []
    for t in TOPICS:
        for lang, rel in (("en", f"{t['slug']}.html"), ("zh", f"zh/{t['slug']}.html")):
            path = WEB / rel
            content = build_page(lang, t)
            old = path.read_text(encoding="utf-8") if path.exists() else None
            if old is not None and normalize(old) == normalize(content):
                continue
            if check:
                stale.append(str(path.relative_to(WEB)))
                continue
            path.write_text(content, encoding="utf-8")
            print("wrote website/" + rel.replace("\\", "/"))
    for lang in ("en", "zh"):
        sync_backlinks(lang, check, stale)
    if check:
        if stale:
            print("STALE (run: python website/tools/build_topic_pages.py)")
            for s in stale:
                print("  " + s)
            return 1
        print("topic pages are current")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
