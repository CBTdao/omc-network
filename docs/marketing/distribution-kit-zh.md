# 空投分发工具包 · 2026-10-30

目标：**把登记份数尽快推上去**，让人先进入漏斗，资金在 2027-01-01 领取窗口开启时回笼。

这份文件是操作手册，不是文案库。每条文案都可以直接复制，每个数字都来自
`contracts/params.json`，改参数时 `node scripts/marketing-kit.test.mjs` 会先红。

---

## 0. 现在唯一的硬指标

**登记是免费签名，收费发生在领取那一刻。** 所以 2026-10-30 到 2026-12-31 这段
是蓄水期，衡量成败的不是收入，是**登记份数**。收入是 2027-01-01 之后的结果。

基线（2026-10-30 实测）：

```
$ curl -s https://omc.network/api/airdrop/summary
{"ok":true,...,"totals":{"wallets":2,"entries":2,"amount":40,"frozen":false}}
```

2 个钱包、2 份、40 OMC。每天固定两次（发布后 6 小时 / 24 小时）记一行，就知道渠道有没有用。

---

## 1. 一个决定成败的算术问题，必须先看清

领取费 = 每份 0.01 BNB，每份给 20 OMC。按 BNB $742：

| 项 | 数值 |
|---|---|
| 每份成本 | 0.01 BNB ≈ **$7.42** |
| 每份得到 | 20 OMC |
| 隐含单价 | **$0.371 / OMC** |

**每一个来领的人，都是在赌 OMC 会高于 $0.371。** 空投猎人不是慈善家，他们算这个数
算得比我们清楚。「免费空投」决定了他们会不会来看，$0.371 决定他们会不会掏钱。

这意味着：**如果 2027-01-01 没有价格锚，登记数再大也换不成现金。** 十万个钱包登记，
币没有可参照的价值，来付钱的可能只有几百个。

三个杠杆，都是你的决定，代价不同：

| 杠杆 | 效果 | 代价 |
|---|---|---|
| **A. 讲清「20 OMC 能干什么」** | 唯一不花钱、不动物理参数的办法：质押年化、租算力折扣、治理权重。让它有参照物 | 需要真数据支撑，编不得 |
| **B. 每份 20 → 40 OMC** | 份数 100 万 → 50 万，隐含单价腰斩到 **$0.185**，池子仍是 20M（2%），一分钱不少收 | 改 `perEntry`，同步 5 处 + 重建 zh |
| **C. 每份 0.01 → 0.005 BNB** | 门槛减半，隐含单价同样到 $0.185 | 直接减半回笼资金，不建议 |

我的话：**A 必做，B 值得做，C 不要做。** B 是唯一一个「让人感觉便宜但不多花一分钱」的
调整——同样的 20,000,000 OMC 池子，只是切得更细。猎人看的是「一份多少钱」，不是「一共多少份」。

> 提醒：B 会动到 `params.json` → `airdrop.json` → 公告页 → 两篇外发长文 → 5 个测试文件。
> 这些现在是联动红的，这是设计。要不要改，你定，我一句话就能改完并重新发布。

---

## 2. 渠道分层：哪些值得投时间

| 档 | 渠道 | 能带来什么 | 判断 |
|---|---|---|---|
| **A** | X 空投圈 KOL 转发（@ 或私信，给素材不给钱） | 直接登记，最快 | 首选 |
| **A** | Telegram 空投群（英文群为主） | 直接登记，量大 | 首选 |
| **A** | 邀请奖励（已有：+5 份） | 每个登记的人自带一个渠道 | 每篇文案都要带 |
| **B** | CryptoRank / DappRadar / CMC Airdrops | 曝光 + AI 与聚合站引用 | 逐步提交 |
| **B** | Mirror（优先）/ Medium（次选） | 链上永久、Google 收录快、AI 爱引用 | 发长文 |
| **B** | 公众号 / 金色财经 / 律动 | 中文圈信任度 | 发中文长文 |
| **C** | airdrops.io、Airdrop Alert 等「免费空投」专栏 | 会被标 paid / 拒收，负面标签 | **不投** |
| **D** | 付费买量 / 竞价广告 | 需要预算与企业资质 | 现在不做 |

「C 档不投」的原因不是道德，是结果：这些站把「需要付费」直接标红，我们投进去等于
自己给自己贴 scam 标签，AI 抓到的第一批内容就是那些红色警告。

---

## 3. 逐字文案

### 3.1 X 主推文（英文）

```
🎁 FREE AIRDROP — 20,000,000 $OMC

1,000,000 slots × 20 OMC. First come, first served.
No lottery. No snapshot. No allowlist.

→ Follow @Omniverse_Depin
→ RT + comment this post
→ Join t.me/OmniverseCompute
→ Register free: omc.network/airdrop

20 OMC is delivered in full at claim — no cliff, no vesting tail.

DePIN GPU network on BNB Chain. Registering costs nothing: it is a
wallet signature, not a transaction. The claim transaction carries a
flat 0.01 BNB processing fee per entry (0.05 BNB for the 5-entry base
claim), which funds audits and development.

Claim window: 1 Jan 2027 – 31 Mar 2027.
```

### 3.2 X 线程（5 条，给愿意细看的人）

```
1/ 20,000,000 $OMC is going out to the community — 2% of the fixed 1B supply.

1,000,000 slots, 20 OMC each. No purchase. Registration is a signature.

2/ The full flow:
· 3 social tasks (follow / RT / Telegram)
· connect wallet, sign once — free
· 5 base entries, +1 per friend you bring, up to +5 → 10 entries = 200 OMC

3/ Why a fee at claim? Because the alternative is a network nobody funds.
0.01 BNB per entry pays for audits, testnet incentives, RPC, the node
client. It is flat, it is not indexed to the OMC price, and it is spent
on the protocol rather than on anyone's allocation.

4/ Nothing is bought here. You are not buying tokens, not joining a
presale, not getting a discount. You are claiming an allocation for
completing tasks, and paying the processing cost of the transaction.

5/ Claim opens 1 Jan 2027 with mainnet and staking. Every entry is
delivered in full at claim — 20 OMC means 20 OMC, withdrawable in one
transaction, stakeable the same day.

omc.network/airdrop
```

### 3.3 Telegram 置顶（中英双语，群内第一次进来就读到）

```
📌 泛宇宙算力 · OMC 免费空投

20,000,000 OMC（总量 10 亿的 2%），100 万份 × 每份 20 OMC，先到先得。

登记三步（免费，只是钱包签名）：
1. 关注 https://x.com/Omniverse_Depin
2. 转发并评论置顶推文
3. 加入本群 + 在 omc.network/airdrop 连钱包登记

· 基础 5 份 = 100 OMC；每邀请 1 位好友 +1 份，最多 +5 份 → 满额 10 份 = 200 OMC
· 领取时每份 0.01 BNB 处理手续费（不退款，与币价无关），满额 10 份 = 0.1 BNB
· 领取窗口：2027-01-01 至 2027-03-31，全额到账，无锁仓

登记：https://omc.network/airdrop
中文说明：https://omc.network/zh/airdrop
公告：https://omc.network/news/omc-airdrop-is-open

---
EN: 20,000,000 $OMC free airdrop · 1,000,000 slots × 20 OMC.
Register free (wallet signature) → omc.network/airdrop
Claim opens 1 Jan 2027 · 0.01 BNB processing fee per entry at claim.
```

### 3.4 朋友圈 / 微信群（中文，短，给完全不懂币的人）

```
自己做的项目，主网 1 月 1 日上。空投 2000 万枚，先到先得。

登记不要钱，连钱包签个名就行，做三个关注任务，基础 5 份。
1 月 1 日领取时每份收 0.01 BNB 手续费（不退），5 份是 0.05 BNB。

omc.network/airdrop
```

### 3.5 微博（中文，带话题）

```
#空投# #DePIN# 【免费空投 2000 万 OMC，100 万份，先到先得】

泛宇宙算力：BNB Chain 上的去中心化 GPU 算力网络。
空投总量 20,000,000 OMC（2%），每份 20 OMC。

登记免费——做三个社交任务 + 钱包签名，不花一分钱。基础 5 份，邀请好友最多再加 5 份。
领取从 2027 年 1 月 1 日开始，全额到账无锁仓；领取时每份 0.01 BNB 处理手续费。

omc.network/airdrop
```

### 3.6 被质疑时的回复（照抄，别临场解释）

**「付费空投 = 骗局」**

```
Fair challenge. Structure: registration is free — a wallet signature, no
transaction. The 0.01 BNB is charged only when you claim, per entry, and it
is flat: the same amount whether OMC is $0.01 or $1. It is not a percentage,
not index-linked, and it does not buy you tokens — the tokens are given for
the tasks. It funds audits, RPC and the node client, split 60/40
development/team. If that is not worth 0.01 BNB to you, the correct response
is not to claim, and that is fine.
```

**「为什么不免费到底？」**

```
Because a network with no treasury cannot ship. The pool is 2% of supply and
is not spent on the team's allocation — every token in it goes to claimants.
The fee is the only funding path before compute revenue exists, and it is
paid to the treasury, not to any individual.
```

**「为什么等到 2027 年 1 月？」**

```
Claim opens with mainnet and staking, so that what you claim can be used the
same day instead of sitting as a placeholder. Registration is open now and
your entries are recorded against your wallet.
```

---

## 4. 聚合站提交字段（英文，逐字可粘）

```
Project name:        Omniverse Compute
Ticker:              OMC
Chain:               BNB Chain (BEP-20)
Category:            DePIN / GPU Compute / Infrastructure
Total supply:        1,000,000,000 OMC (fixed)
Airdrop pool:        20,000,000 OMC (2% of supply)
Per entry:           20 OMC
Total slots:         1,000,000 (first come, first served)
Cost to register:    0 (wallet signature only)
Cost to claim:       0.01 BNB per entry, flat, non-refundable, charged at claim
Max per wallet:      10 entries (5 base + 5 referral) = 200 OMC, 0.1 BNB max fee
Vesting:             100% at claim — no cliff, no lock-up
Registration:        open now
Claim window:        1 Jan 2027 – 31 Mar 2027 (UTC+8)
Tasks:               follow @Omniverse_Depin, retweet + comment the pinned post, join t.me/OmniverseCompute
Website:             https://omc.network
Airdrop page:        https://omc.network/airdrop
Announcement:        https://omc.network/news/omc-airdrop-is-open
Spec (machine):      https://omc.network/airdrop.json
Telegram:            https://t.me/OmniverseCompute
X:                   https://x.com/Omniverse_Depin
Logo:                1200×630 card in docs/marketing/cards/ (or /og-image.png)
```

短描述（≤160 字符）：

```
Free 20,000,000 OMC airdrop on BNB Chain. 1,000,000 slots × 20 OMC, first come
first served. Register free; claim from 1 Jan 2027 with a 0.01 BNB processing
fee per entry.
```

---

## 5. 七天节奏（一次只推一个渠道，否则归因不了）

| 天 | 动作 | 记录 |
|---|---|---|
| D1 | X 主推文 + 置顶；线程同时发出；卡片图配图 | 6h / 24h 各查一次 totals |
| D2 | Telegram 群发 + 置顶；找 2–3 个空投群投放 | 同上 |
| D3 | Mirror 发英文长文，回链公告页 | 同上 |
| D4 | 公众号 / 微博发中文长文 + 卡片竖版 | 同上 |
| D5 | 提交 CryptoRank / DappRadar（用上面字段表） | 同上 |
| D6 | 整理第一周数据，看哪个渠道的「份数/人」最高 | — |
| D7 | 把最有效的文案改写成 3 个变体，重复 D1 | — |

判断标准不是访问量，是 **entries 增量**。2 个钱包 20 个人访问，比 2000 个访问 0 登记有价值得多。

---

## 6. 归因：现在只能做到粗粒度，别假装精确

站上没有埋点（没有 GA、没有 Vercel Analytics），所以：

- **能测**：登记份数与钱包数的绝对增量（`/api/airdrop/summary`）
- **不能测**：某个渠道带来的访问量、跳出率、页面转化

粗归因办法：**一次只推一个渠道，48 小时内不叠加**。增量归该渠道。
如果之后想精确，Vercel Analytics 是零代码的（在 Vercel 后台开，需要你的账号），
开了之后我可以给每个渠道的链接加 `?ref=`，在 `main.js` 里读出来一起上报。
