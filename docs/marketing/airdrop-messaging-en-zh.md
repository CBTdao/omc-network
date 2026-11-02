# 空投对外表述 · 2026-11-02

这份文件是**可以直接复制粘贴的句子**，中英双语。凡是数字，全部来自
`contracts/params.json`；改参数时 `node scripts/marketing-kit.test.mjs` 会先红，
所以这里不会偷偷老掉。

同样的话术在页面上也有对应：`omc.network/press`（媒体与 KOL 用）、
`omc.network/airdrop#value`（"20 OMC 值多少"）、`omc.network/zh/press`（中文版）。
三处说法必须一致，不一致就等于给了别人两种口径去对照。

---

## 1. 三个必须记住的参照数

| 说法 | 数 | 算法 |
|---|---|---|
| 一份占总量 | **0.000002%**（满额 10 份 200 OMC = 0.00002%） | 20 ÷ 1,000,000,000 |
| 满额空投 ≈ 一台节点的首付 | **30%**（第 1 档保证金 250 美元 ≈ 674 OMC） | 200 × 隐含单价 ÷ 250 |
| 年化是除法，不是承诺 | 上限 **100%**；全网质押 2000 万时 50%，1 亿时 10% | 年释放 1000 万 ÷ 质押量 |

「20 OMC」单独说是个没有参照物的数字。换成「一台消费级显卡节点保证金的 30%」，
对方才能拿去做决定，而且这个换算是真的。

**年化必须连着下半句说**：释放受手续费收入闸门约束
（`min(年计划/365, k × 近 30 天手续费/30)`）。网络还没挣到手续费时不释放，
真实年化可能是 0。只说上半句，1 月 1 日就会变成"承诺落空"的截图。

---

## 2. 「这值多少」——可直接发的版本

```
What a full OMC claim is actually worth:

200 OMC (10 entries) ≈ 30% of the bond for a tier-1 GPU node
(tier 1 = $250 bond for an RTX 3090/4090-class card)

Stake it and you earn from network emissions:
APR = min(100%, annual emission ÷ total staked) — it falls as more
stake arrives, so no fixed rate is promised.

Register free: omc.network/airdrop
```

```
中文版：

满额空投 200 OMC ≈ 一台入门级节点保证金的 30%
（第 1 档 = $250 保证金，RTX 3090/4090 级显卡）

质押可分享网络释放：
年化 = min(100%, 年释放 ÷ 全网质押量)，质押越多越低，不承诺固定年化

免费登记：omc.network/airdrop
```

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

---

## 4. 三个绕不开的质疑，以及我们的回答

这三个问题每一次推广都会被问到。下面是我们对不同结构的回答。

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

三个回答的共同点：先承认对方的怀疑是合理的，再区分"登记免费"和"领取收费"，
最后给出收费的去向。**不要把 0.01 BNB 说成"免费"**——它确实不是免费的，
说错一次，后面所有话都不可信了。

---

## 5. 聚合站提交字段（英文，逐字可粘）

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
Logo / banner:       https://omc.network/assets/img/press/omc-airdrop-en-1200x630.png (or /og-image.png)
```

短描述（≤160 字符）：

```
Free 20,000,000 OMC airdrop on BNB Chain. 1,000,000 slots × 20 OMC, first come
first served. Register free; claim from 1 Jan 2027 with a 0.01 BNB processing
fee per entry.
```

---

## 6. 进度怎么查

登记是免费签名，收费发生在领取那一刻，所以现在唯一有意义的数是**登记份数**：

```bash
$ curl -s https://omc.network/api/airdrop/summary
{"ok":true,...,"totals":{"wallets":2,"entries":2,"amount":40,"frozen":false}}
```

关注 `totals.entries`。判断标准不是访问量，是 entries 的增量。
