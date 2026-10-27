<div align="center">

<img src="website/assets/img/logo.png" alt="Omniverse Compute" width="120" />

# Omniverse Compute (OMC)

**The Next-Gen Decentralized GPU Compute Network on BNB Chain**

Turn idle GPUs worldwide into a high-throughput, low-cost, censorship-resistant compute grid.

[![Token](https://img.shields.io/badge/tOMC%20test%20token-BEP--20-2b6bf3?style=flat-square)](https://testnet.bscscan.com/token/0xbeb21e40fb50a0f4ba9287c2058dc7851e450671)
[![Chain](https://img.shields.io/badge/Chain-BNB%20Smart%20Chain-f0b90b?style=flat-square)](https://www.bnbchain.org/)
[![Testnet](https://img.shields.io/badge/Testnet-Live-22c55e?style=flat-square)](https://testnet.bscscan.com/token/0xbeb21e40fb50a0f4ba9287c2058dc7851e450671)
[![Mainnet](https://img.shields.io/badge/Mainnet-TGE%202027--01--01-6b7280?style=flat-square)](#mainnet)
[![Supply](https://img.shields.io/badge/Supply-1%2C000%2C000%2C000%20OMC-8b5cf6?style=flat-square)](#tokenomics)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

[Website](#-website) · [Whitepaper](docs/OMC-Whitepaper-EN.pdf) · [Testnet](#-testnet) · [Airdrop](#-airdrop) · [Security](SECURITY.md) · [X / Twitter](https://x.com/Omniverse_Depin) · [Telegram](https://t.me/OmniverseCompute)

</div>

---

## 📖 Overview

**Omniverse Compute (OMC)** is a decentralized physical infrastructure network (**DePIN**) that aggregates idle GPU capacity — consumer RTX cards, data-center spare capacity, and post-PoW mining rigs — into a single permissionless compute grid.

Demand for AI compute is exploding: LLM training, multimodal inference, Sora-grade video generation, real-time 3D cloud rendering. Centralized clouds answer with prohibitive CapEx, strict quotas, and vendor lock-in. **OMC answers with a permissionless GPU grid.**

The protocol settles on **BNB Chain** (L1 root settlement). A dedicated **Layer 2 rollup** for high-frequency task scheduling and per-second / per-task micropayments is planned but **not yet deployed** — today the testnet contracts run directly on BNB Chain.

| Metric | Value |
|---|---|
| Compute cost reduction vs Web2 cloud | **50–70%** |
| Supply reserved for community airdrop | **2%** (20,000,000 OMC) |
| Marginal cost of idle GPU onboarding | **≈ 0** |
| Max total supply | **1,000,000,000 OMC** (fixed) |

---

## 🏗 Architecture

OMC uses a three-tier network stack:

```
┌──────────────────────────────────────────────────────────────┐
│  L1 · SETTLEMENT LAYER — BNB Chain                           │
│  OMC token issuance · staking contracts · DAO governance     │
│  final dispute arbitration                                   │
├──────────────────────────────────────────────────────────────┤
│  L2 · ORCHESTRATION LAYER — Rollup (planned)                │
│  node heartbeats · task-allocation state mapping             │
│  state-channel settlement · low-cost micropayments           │
├──────────────────────────────────────────────────────────────┤
│  COMPUTE GRID — Off-chain containerized grid                 │
│  Docker / Kubernetes sandboxes · CUDA / ROCm acceleration    │
│  NVLink inter-GPU links · P2P data transport                 │
└──────────────────────────────────────────────────────────────┘
```

### Task Matching Engine

Every job is scored and routed by a weighted bipartite matching algorithm:

```
Score = 0.35 × TFLOPS + 0.25 × VRAM + 0.15 × Bandwidth + 0.25 × Reputation
```

### Dual Verification

- **Redundant execution** — high-precision tasks dispatched to 2–3 independent nodes, output feature hashes compared
- **zk-SNARKs sampling** — on-chain verification of execution traces without exposing private data

### Staking & Slashing

```
Staking_Min  = USD_Tier_Target ÷ OMC_Price          (restated at each re-peg)
Slash_Burn   = Slashed_Tokens × 20%
Fee_Burn     = Job_Volume × 8% × 50%                (= 4.0% of GMV)
Emission     = min(Annual_Ceiling, k × Fee_Revenue_30d)   (k: 3 → 0.5)
```

Exit is a two-step request with a **14-day cooldown**: an instant `unstake()`
makes staking a free option — farm emissions for a week, exit, sell — which is
the difference between attracting operators and attracting yield farmers.

Tier targets are **USD 250 / 1,000 / 5,000 / 15,000 / 50,000**, not fixed OMC figures: a bond has to be worth more than the damage an operator can do, and a fixed OMC number stops being that the moment the token moves. The OMC amount actually stored on chain is authoritative and `/stake` reads it live; published targets and the amounts last applied both live in [`contracts/params.json`](contracts/params.json), and [`contracts/tools/set-params.js`](contracts/tools/set-params.js) is the only thing that writes them. The values currently deployed on the testnet (20 / 100 / 500 / 1,000 / 5,000 tOMC) are placeholders — tOMC has no price to anchor to.

Slashing triggers: fraudulent outputs, task timeouts, unexpected offline dropouts, fake heartbeats.
Re-allocation: **50%** to affected requesters · **30%** to DAO Treasury · **20%** permanently burned.

---

## 🪙 Tokenomics

**OMC** — BEP-20 · Max supply **1,000,000,000** (fixed)

| Category | Allocation | Amount (OMC) | Vesting |
|---|---|---|---|
| Compute Mining & Node Rewards | 50% | 500,000,000 | 0% at TGE; **400M scheduled + 100M DAO reserve (2037+)**. Ceilings 10M / 20M / 30M / 40M / 50M ×6 = 400M, and the binding cap is a **revenue gate** — see [ECONOMICS.md](ECONOMICS.md) |
| Ecosystem & Grants | 15% | 150,000,000 | 5% at TGE, 6m lockup, then 36m monthly linear |
| Institutional Investors | 10% | 100,000,000 | 5% at TGE, 6m cliff, then 24m monthly linear |
| Team & Core Contributors | 10% | 100,000,000 | 0% at TGE, 12m cliff, then 24m monthly linear |
| Private Investors | 8% | 80,000,000 | 10% at TGE, 3m cliff, then 18m monthly linear |
| Treasury & Liquidity | 5% | 50,000,000 | 50% at TGE for DEX/CEX liquidity |
| Community Airdrop | 2% | 20,000,000 | 100% at claim, no vesting tail — 0.01 BNB per entry claim fee, not refunded |
| **Total** | **100%** | **1,000,000,000** | Circulating at TGE ≈ 65,500,000 OMC (6.55%) |

### Deflationary Mechanics

- **Protocol fee burn** — **8% fee per job, charged to the requester on top of the provider's price**; **50% of that fee is burned by the contract at settlement** (there is no market buyback), 30% is distributed pro-rata to staked nodes as fee revenue, 20% funds the Treasury. That burns **4.0% of settled volume**, 4.4× the old 3%/30% split, whose 0.9% sink could not offset emission at any volume a new network reaches
- **Slashing burn** — 20% of every slashed stake is permanently burned
- **Emission gated by revenue** — `min(annual ceiling, k × trailing 30-day fee revenue)`, k: 3 → 0.5. No revenue means no emission; from year 6 emission equals burn and supply stops growing at any scale. Arithmetic and scenarios: [ECONOMICS.md](ECONOMICS.md) | `node models/economics.mjs`

---

## 🌐 Testnet

OMC runs on **BNB Smart Chain Testnet**.

| Field | Value |
|---|---|
| Network | BNB Smart Chain Testnet |
| RPC URL | `https://data-seed-prebsc-1-s1.binance.org:8545/` |
| Chain ID | `97` |
| Native Symbol | `tBNB` |
| Gas faucet (tBNB) | https://testnet.bnbchain.org/faucet-smart |
| **tOMC (test token)** | [`0xBEB21E40FB50A0F4ba9287C2058DC7851e450671`](https://testnet.bscscan.com/token/0xbeb21e40fb50a0f4ba9287c2058dc7851e450671) — transferable ERC-20. **The faucet pays 20 tOMC per claim, once per day, five claims per address maximum** (enforced on-chain by the token contract). Five claims = 100 tOMC, exactly the tier-2 staking minimum. |
| **OMCStaking** | [`0xa70B8506a1a614Fd83D0C70d73Da1E21fdcf1fB6`](https://testnet.bscscan.com/address/0xa70b8506a1a614fd83d0c70d73da1e21fdcf1fb6) — tier staking, node heartbeat liveness (24 h window + 6 h grace), per-tier minimums (20 / 100 / 500 / 1 000 / 5 000 tOMC), slashing split 50% requesters / 30% treasury / 20% burn. Emission is clamped by a published ceiling: `min(emissionPerSecond, totalStake × maxAprBps ÷ 10 000 ÷ 365 days)`. |
| **OMCComputeMarket** | [`0x7664f1e73c2CBCbaFE636a653C173378C369C40A`](https://testnet.bscscan.com/address/0x7664f1e73c2cbcbaafe636a653c173378c369c40a) — job escrow, assignment, settlement and dispute resolution. 3% protocol fee (2.7% when paid in OMC), 48-hour dispute window. |
| Legacy points contract | `0x3C7EDae9da38b72Db7AE98921eF0759d19dE7Cc5` — points only, **cannot transfer or stake**; kept for reference |
| Retired addresses | `0x8B6a8A46cB2779688212f033e6a4Fc8e604363f6` (earlier test token), `0xD4b1bB57637eFb62016a81B584fa8BE66Fb482d6` / `0xA49537fA46172693c553E9A1824CdF7CA810AAFc` (earlier staking), `0xBd1575bE1b0b9349468482eA2B1D4611fcD13CaE` / `0x5795393f33F6E27797499b1C61422ACeF0555709` (earlier markets), `0x3226dffED51e28CEf526F8c078B2EC9a092E36e6` / `0x3B81E6edfbA775B4E53694F531C3b0236D77FEF1` (pre-fix staking / market — superseded 2026-10-11) — **do not use** |

> **Mainnet status.** All addresses above are BNB Smart Chain **testnet** deployments. The
> mainnet deployment and TGE are scheduled for **1 January 2027**, alongside the opening of the
> community airdrop, in line with the roadmap in the whitepaper. Nothing on this page refers
> to a mainnet asset today.

### Airdrop ledger

Airdrop entries are recorded server-side against the wallet that signs for them,
so they follow a participant across browsers and devices and can be audited at
claim time. Each entry is a `personal_sign` over a canonical message that carries
the UTC+8 day (yesterday's signature cannot register today's entry), and the caps
— one per day, five base plus five referral — are enforced inside a per-address
database lock. Schema, API contract and setup: [`db/README.md`](db/README.md).

With no `DATABASE_URL` configured the API answers `503` and the page falls back
to its browser-local preview, which the participation rules then say out loud.
With one configured, the schema applies itself on the first request — creating
the database is the only manual step, and nothing needs `psql` run against it.

A second table, `airdrop_allocations`, records the credit rather than the event:
per wallet, its own entries and its referral bonus, the per-entry rate that
produced the total, and a `status` that flips from `accruing` to `frozen` when
`freeze_airdrop_allocations()` is run at the claim cutoff. Once frozen, further
entries still append to the event log but cannot move the amount owed — the
distinction between "what happened" and "what is committed" is explicit instead
of implied.

### Protocol parameters

Every number that appears in more than one document lives in
[`contracts/params.json`](contracts/params.json): the USD staking targets, the
ten-year emission schedule, the airdrop caps. `scripts/params.test.mjs` asserts
the things that went wrong before — that the schedule sums to the 500,000,000
pool, that year one is a real reduction and not a rounding difference, that the
ladder is monotone, and that the file still matches what is deployed.

```
node --test scripts/params.test.mjs        # invariants
node contracts/tools/set-params.js check   # same checks, operator-facing
node contracts/tools/set-params.js show    # targets vs what the chain holds
node contracts/tools/set-params.js plan --price 0.02
```

`set-params.js` sends nothing without `--apply`, and `--apply` needs the owner
key: `setTierMinStake` and `setEmissionPerSecond` are `onlyOwner` on the
deployed `OMCStaking`, so a parameter change is an owner transaction, not a
redeploy. Every applied change is appended to
`contracts/deployments/params-history.json` with the price it was made at.

### Security

**Not audited.** The contracts have not been reviewed by a third-party firm. The team runs
its own static analysis and property-based tests and publishes the results — see
[`SECURITY.md`](SECURITY.md) and [`docs/security-review.md`](docs/security-review.md).

One **High-severity defect** was found in that self-review and is fixed in this repository:
`OMCComputeMarket.fail()` applied the published slashing split twice and therefore reverted
for every non-zero penalty, making the failure/refund path unusable. **The fix is deployed** —
the live testnet addresses above carry the reviewed build:
[`contracts/security/bytecode-report.json`](contracts/security/bytecode-report.json) verifies
the deployed bytecode of `OMCStaking` and `OMCComputeMarket` against the reviewed build
(identical except at the expected immutable regions).

- [x] Redeploy `OMCStaking` + `OMCComputeMarket` to testnet with the fix — done 2026-10-11, verified on-chain
- [ ] Third-party audit before mainnet
- [ ] Move owner / scheduler / verifier off a single EOA

### Run a Node

```bash
# 1. Get test BNB (tBNB) from the faucet for gas
#    https://testnet.bnbchain.org/faucet-smart

# 2. Claim tOMC from the token faucet (20 per claim, once a day, five claims max)
#    — five claims is exactly the 100 tOMC tier-2 minimum

# 3. Clone the repo and bootstrap a node: it stakes and registers on-chain
git clone https://github.com/CBTdao/omc-network.git
cd omc-network/ai-tools-service/p1-service
node bootstrap-node.js          # needs Node.js + ethers; see this folder's README

# 4. Keep the worker running — it heartbeats (24 h + 6 h grace) and picks up jobs
node node-worker.js
```

Step-by-step walkthrough: [Run a GPU node on the testnet](https://forum.omc.network/guides/run-a-gpu-node-on-the-testnet).

---

## 🎁 Airdrop

**2% of total supply (20,000,000 OMC) reserved for the community — 1,000,000 entries × 20 OMC each.**

> ⚠️ **Registering is free. Claiming costs 0.01 BNB per entry, and it is not refunded.**
> A base claim of five entries is **0.05 BNB**; a full ten-entry claim is **0.1 BNB**.
> We will **never** ask for your seed phrase or private key. That fee is paid
> inside the claim transaction and goes to the treasury; any message asking you to
> send BNB to a wallet address "for gas" is not us. Only trust links published here
> and on our verified social accounts.

| Rule | Detail |
|---|---|
| Per entry | **20 OMC** |
| Per wallet | up to **10 entries = 200 OMC**; a base claim is **5 entries = 100 OMC** |
| Daily limit | **1 entry / calendar day** (resets 00:00 UTC+8) |
| Cost to register | **Zero.** Registering an entry is a `personal_sign` challenge — no gas, no transaction, no payment |
| Cost to claim | **0.01 BNB per entry, kept** (about $7.42 at $742/BNB) — **0.05 BNB** for a base claim of five entries, **0.1 BNB** at the ten-entry cap — paid to the treasury in the claim transaction, plus network gas (~0.0004 BNB). Split **60% ecosystem development / 40% team operations** |
| Withdrawal | accumulated amount is **displayed** during the airdrop; claimed in **one transaction** after the airdrop ends — **the whole entry, immediately** |

Why the claim is not free — two reasons, and they are the whole argument:

1. **It is the funding path, because there is no private round.** 60% of the fee goes
   to development (audits, testnet incentives, RPC and indexer costs, the node client,
   the sub-sites) and 40% to team operations. 100,000 entries raises **1,000 BNB
   ($742k)**; the pool — 1,000,000 slots — is the ceiling at **10,000 BNB ($7.4M)**.
   That is years of runway for a small team, and still not enough to build a GPU
   network, which is why the emission is revenue-gated and compute margin carries the rest.
2. **It filters the wallets that will never run a GPU.** A farm taking five entries per
   wallet spends **$37.40** per wallet before holding a token, and unlike a deposit that
   money cannot be rotated back out — 100,000 such wallets is **$3.74M**. Free tokens get
   farmed; $37 is a decision.

The charge is **per entry**, and it is not indexed to the token price: five entries cost
0.05 BNB whether OMC lists at $0.01 or at $1. What changes is whether the claim is worth
making, and the docs do not pretend otherwise — below about **$0.374/OMC** a five-entry
claim is a net cash cost. The campaign asks people to claim because they intend to use the
network, not because the arithmetic promises a profit.

**On the name, and on the address.** It is still an airdrop: the tokens are given for
completing tasks, no price was set for them, and no round sits behind them. A flat claim fee
is ordinary on BSC — the claimer pays gas anyway — and publishing the amount is what
separates this from a hidden cost, so the fee stays in the copy rather than in a footnote.
**The receiving address is deliberately not fixed yet:** `claim()` hard-codes the treasury,
so it is set at deployment together with the multisig, and `contracts/params.json` records
`treasuryAddress: null` until then. No figure anywhere depends on it.

Full arithmetic, including what the fee raises, where it stops filtering, and how the
allocation was sized: [`ECONOMICS.md` §5](ECONOMICS.md#5-airdrop-claim-what-001-bnb-actually-costs),
reproducible with `node models/claim.mjs`, `--revenue` and `--sybil`.

**How to qualify** — complete all three social tasks:

1. Follow [@Omniverse_Depin](https://x.com/Omniverse_Depin) on X
2. Retweet & comment on the pinned post
3. Join the [Telegram community](https://t.me/OmniverseCompute)

---

## 🗺 Roadmap

**Phase 1 · Q4 2026 — Infrastructure & Testnet**
- [x] Smart contract deployment (BNB Smart Chain Testnet)
- [x] Open-source node client release
- [x] Public testnet launch
- [x] 2% community airdrop campaign — participation open; claiming opens 1 January 2027

**Phase 2 · 2027 Q1 (1 January) — Mainnet, TGE & Staking**
- [ ] Mainnet launch and TGE — **1 January 2027**
- [ ] Airdrop participation and claims open — **1 January 2027**
- [ ] Compute mining activation
- [ ] HuggingFace & Blender plugin integration
- [ ] First completed audits

**Phase 3 · 2027 Q4 and later — TEE, ZK Research & Full DAO**
- [ ] TEE confidential-computing tier
- [ ] Zero-knowledge verification research results (research track, not a launch deliverable)
- [ ] Full DAO governance transition
- [ ] Cross-chain compute settlement expansion

---

## 📁 Repository Structure

```
omc-network/
├── README.md
├── LICENSE
├── CONTRIBUTING.md
├── .gitignore
├── website/                  ← Official website (static, en + zh)
│   ├── index.html            ← Home (incl. live airdrop progress ticker)
│   ├── whitepaper.html       ← Whitepaper (web rendering)
│   ├── testnet.html          ← Testnet & node onboarding
│   ├── stake.html            ← Live testnet staking dApp (real contracts)
│   ├── airdrop.html          ← Community airdrop
│   ├── news.html             ← Project news & announcements
│   ├── api/                  ← Airdrop ledger functions (Vercel)
│   │   ├── airdrop/entry.js  ← POST: verify signature, record one entry
│   │   ├── airdrop/summary.js← GET:  a wallet's recorded entries
│   │   └── _lib/             ← canonical message, caps, SQL, self-migration
│   └── assets/
│       ├── css/style.css
│       ├── img/logo.png
│       ├── data/news.js      ← News feed entries
│       ├── js/               ← i18n engine + airdrop logic (wallet connect on airdrop page only)
│       │   ├── i18n.js
│       │   ├── wallet.js     ← Wallet connect for airdrop claims (EIP-1193 / personal_sign)
│       │   ├── airdrop-api.js← Signs and posts an entry to the ledger
│       │   ├── main.js
│       │   ├── airdrop-stats.js ← Home-page progress ticker
│       │   ├── news.js       ← News feed renderer
│       │   └── lang/         ← en · zh
│       └── docs/             ← Whitepaper PDFs
├── db/                       ← Airdrop ledger schema + tests (see db/README.md)
│   ├── migrations/           ← 001 entries · 002 allocations (credit ledger)
│   ├── scripts/migrate.mjs   ← applies pending migrations, once each
│   └── tests/                ← 24 tests against a real Postgres (PGlite)
├── models/
│   ├── economics.mjs         ← supply/sink model (scenarios, break-even, JSON)
│   ├── claim.mjs             ← claim fee: ratio, revenue, sybil cost
│   ├── economics.test.mjs    ← asserts the identities the docs quote
│   └── claim.test.mjs        ← asserts the claim model matches params.json
├── scripts/
│   └── params.test.mjs       ← asserts contracts/params.json invariants
├── contracts/                ← Testnet contracts + deploy tooling
│   ├── OMCTestToken.sol      ← tOMC: transferable ERC-20 + faucet (20/day, 5 lifetime)
│   ├── OMCStaking.sol        ← tier stake · heartbeat · real slashing
│   ├── OMCComputeMarket.sol  ← job escrow · assignment · settlement · disputes
│   ├── test/                 ← property-based suite (forge test)
│   ├── security/             ← self-review harness, snapshots, tool output
│   ├── tools/compile.js      ← solc build (viaIR, paris evm)
│   ├── tools/deploy.js       ← deploy / verify / handover
│   ├── tools/set-params.js   ← owner-only parameter changes (dry-run by default)
│   ├── params.json           ← canonical ladder, emission schedule, caps
│   └── deployments/bsc-testnet.json ← live addresses (git-tracked)
├── SECURITY.md               ← security posture, disclosures, known issues
└── docs/                     ← Whitepaper PDFs + security-review.md
```

---

## 🌍 Website

**Live:** https://omc.network/

The official site is a dependency-free static build with **English and Chinese** support (`en` · `zh`). Other locales were retired on 2026-10-11.

| Page | URL |
|---|---|
| Home | https://omc.network/ |
| Whitepaper | https://omc.network/whitepaper |
| Testnet | https://omc.network/testnet |
| Stake | https://omc.network/stake |
| Airdrop | https://omc.network/airdrop |
| News | https://omc.network/news |

Wallet connection is used on the **airdrop page** (free `personal_sign` challenge) and on the **stake page** (real `eth_sendTransaction` calls against the testnet contracts) (EIP-1193); the session is stored locally and no server-side authorisation is claimed yet. There is deliberately no sitewide sign-in entry — wallets show a generic "proceed with caution" banner on newly launched domains and airdrop pages, so visitors are only asked to connect at the moment they claim. The home page ticker reads live numbers when `OMC_STATS.endpoint` is set, and otherwise shows a clearly-labelled preview feed.

To run locally:

```bash
cd website
python -m http.server 8080
# open http://localhost:8080
```

SEO is checked mechanically rather than remembered. Both tools are read-only:

```bash
node scripts/seo-audit.mjs        # every page: canonical vs real URL, og/twitter, h1,
                                  # JSON-LD, image alts, sitemap coverage, robots, internal links
node scripts/seo-audit.mjs --all  # one line per page, to see drift at a glance
node scripts/seo-audit.mjs --json # machine readable; exits non-zero on any problem
python website/tools/seo_audit.py # the 13 root pages, site-wide conventions only
```

The game sub-site (`website/game/`) is deployed twice — at `game.omc.network/` (its own
project, which every canonical points at) and under `omc.network/game/`; the redirect rules in
`vercel.json` send the second one to the first, so the two copies do not compete.

### Chinese pages

The main site's Chinese is a client-side switch, which crawlers do not run. `website/zh/`
is the static Chinese mirror that fixes that: real Chinese HTML at `/zh/…`, canonical
pointing at itself, hreflang pairs in both directions, and zh URLs in the sitemap.

```bash
python website/tools/build_zh.py            # (re)generate website/zh/*.html
python website/tools/build_zh.py --patch-en # add the zh hreflang line to the en pages
node scripts/zh-pages.test.mjs              # guards: lang, canonical, hreflang, coverage
```

Eight pages are generated (index, airdrop, tokenomics, stake, compute, testnet, ai-tools,
news) — the ones whose visible text the zh dictionary covers. `whitepaper`, `about`,
`privacy`, `aup` and `calculator` are 51–92% inline English and are deliberately **not**
generated: a half-translated whitepaper or legal page is worse than none. Adding them is
a translation task (extend the `MANUAL` tables in `build_zh.py` or tag the markup with
`data-i18n`), not a build task. `i18n.js` treats `/zh/` URLs as a Chinese default, behind
an explicit switcher pick; asset references in the zh copies are rewritten root-absolute.

---

## 🤝 Contributing

## 🧩 Ecosystem

OMC is not one page with a token attached. Three properties run alongside the
protocol site, each doing a different job in the same funnel:

| Property | URL | Job it does | Depth today |
|---|---|---|---|
| **AITop** | [top.omc.network](https://top.omc.network) | Buyer-side entry point: AI tool comparisons and rankings. Someone shopping for inference lands here before they have heard of OMC | 37 comparison pages, one table per question |
| **DCF** | [forum.omc.network](https://forum.omc.network) | Supply-side and research: GPU market analysis, a 12-network comparison tracker, and the canonical [run-a-GPU-node guide](https://forum.omc.network/guides/run-a-gpu-node-on-the-testnet) | The onboarding path a node operator actually follows |
| **Real or AI** | [game.omc.network](https://game.omc.network) | Consumer entry point: a daily photo game about spotting generated images. No wallet, no token, no signup | Daily challenge plus a guide |

Why this counts as depth rather than as content marketing: each property answers a
question the protocol itself cannot answer without sounding like a pitch. AITop
answers "what should I use" for a buyer who does not care about DePIN. DCF answers
"is this hardware worth running" for an operator who does not trust a project's own
benchmarks. Real or AI answers "why would I care" for someone who will never run a
GPU — and it is the only one of the four properties that works without a wallet.

All three sit on `omc.network` subdomains, so domain authority accumulates in one
place instead of splitting across throwaway sites.

**Disclosure, stated once and linked from every page:** all three are operated by
the OMC team, not by third parties. They are editorially independent of the
protocol narrative — DCF publishes comparisons that do not flatter OMC — but
"independent" here means editorial, not corporate. A reader who mistakes one for a
neutral third party has been misled, so every page carries the disclosure.

| | |
|---|---|
| AITop | [top.omc.network](https://top.omc.network) |
| DCF (compute forum) | [forum.omc.network](https://forum.omc.network) |
| Real or AI (game) | [game.omc.network](https://game.omc.network) |

---

We welcome contributions. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

---

## 🔗 Links

| | |
|---|---|
| Website | [omc.network](https://omc.network) |
| Testnet & node onboarding | [omc.network/testnet](https://omc.network/testnet) |
| AI tool comparisons (AITop) | [top.omc.network](https://top.omc.network) |
| Compute research forum (DCF) | [forum.omc.network](https://forum.omc.network) |
| Real or AI (daily photo game) | [game.omc.network](https://game.omc.network) |
| X / Twitter | [@Omniverse_Depin](https://x.com/Omniverse_Depin) |
| Telegram | [t.me/OmniverseCompute](https://t.me/OmniverseCompute) |
| tOMC test token | [`0xBEB21E40...450671`](https://testnet.bscscan.com/token/0xbeb21e40fb50a0f4ba9287c2058dc7851e450671) |
| Tokenomics (supply, vesting, emission) | [omc.network/tokenomics](https://omc.network/tokenomics) |
| OMCStaking | [`0xa70B8506...fcf1fB6`](https://testnet.bscscan.com/address/0xa70b8506a1a614fd83d0c70d73da1e21fdcf1fb6) |
| OMCComputeMarket | [`0x7664f1e7...369C40A`](https://testnet.bscscan.com/address/0x7664f1e73c2cbcbaafe636a653c173378c369c40a) |

---

## ⚠️ Disclaimer

Omniverse Compute (OMC) is the utility token of a decentralized infrastructure protocol. Nothing in this repository constitutes financial advice. Digital assets carry high risk — do your own research and comply with the laws of your jurisdiction. Airdrop participation may be restricted in certain jurisdictions. Testnet tokens (tOMC) have no monetary value.

---

<div align="center">
<sub>© 2026 Omniverse Compute · Built on BNB Chain</sub>
</div>
