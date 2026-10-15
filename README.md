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

The protocol settles on **BNB Chain** (L1 root settlement) with a dedicated **Layer 2 Rollup** for high-frequency task scheduling and per-second / per-task micropayments.

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
│  L2 · ORCHESTRATION LAYER — Dedicated Rollup                 │
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
Staking_Min  = Base_Deposit × Card_Tier_Multiplier
Burn_Amount  = Slashed_Tokens × 20%
```

Slashing triggers: fraudulent outputs, task timeouts, unexpected offline dropouts, fake heartbeats.
Re-allocation: **50%** to affected requesters · **30%** to DAO Treasury · **20%** permanently burned.

---

## 🪙 Tokenomics

**OMC** — BEP-20 · Max supply **1,000,000,000** (fixed)

| Category | Allocation | Amount (OMC) | Vesting |
|---|---|---|---|
| Compute Mining & Node Rewards | 50% | 500,000,000 | 0% at TGE; linear decay over 10 years (halving every 2 years) |
| Investors (incl. **2% Airdrop**) | 20% | 200,000,000 | Institutional 10% · Private 8% · **Airdrop 2% (TGE 100%)** |
| Ecosystem & Grants | 15% | 150,000,000 | 5% at TGE, 6m lockup, 36m monthly linear |
| Team & Core Contributors | 10% | 100,000,000 | 0% at TGE, 12m cliff, 24m monthly linear |
| Treasury & Liquidity | 5% | 50,000,000 | 50% at TGE for DEX/CEX liquidity |

### Deflationary Mechanics

- **Protocol fee burn** — 3% service fee per job; **30% of it is automatically bought back and burned**, 70% funds the Treasury to reward high-reputation nodes
- **Slashing burn** — 20% of every slashed stake is permanently burned
- **Dual burn engine** — service-fee burn + slashing burn constantly reduce circulating supply

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
> mainnet deployment and TGE are scheduled for **2027-01-01**, alongside the opening of the
> community airdrop, in line with the roadmap in the whitepaper. Nothing on this page refers
> to a mainnet asset today.

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

> ⚠️ The OMC airdrop is **100% FREE**. We will **never** ask for your seed phrase, private key, or any payment beyond the network gas fee. Only trust links published here and on our verified social accounts.

| Rule | Detail |
|---|---|
| Per entry | **20 OMC** |
| Per wallet | up to **10 entries** |
| Daily limit | **2 entries / calendar day** (resets 00:00 UTC+8) |
| Fee | a small amount of network gas fee, per entry |
| Withdrawal | accumulated amount is **displayed** during the airdrop; claimable in **one claim** after the airdrop ends |

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
- [ ] 2% community airdrop campaign

**Phase 2 · Q1 2027 — Mainnet, TGE & Staking**
- [ ] Mainnet launch and TGE — **2027-01-01**
- [ ] Airdrop participation and claims open — **2027-01-01**
- [ ] Compute mining activation
- [ ] HuggingFace & Blender plugin integration

**Phase 3 · Q2 2027 onwards — ZK-ML & Full DAO**
- [ ] On-chain ZK-ML framework launch
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
│   └── assets/
│       ├── css/style.css
│       ├── img/logo.png
│       ├── data/news.js      ← News feed entries
│       ├── js/               ← i18n engine + airdrop logic (wallet connect on airdrop page only)
│       │   ├── i18n.js
│       │   ├── wallet.js     ← Wallet connect for airdrop claims (EIP-1193 / personal_sign)
│       │   ├── main.js
│       │   ├── airdrop-stats.js ← Home-page progress ticker
│       │   ├── news.js       ← News feed renderer
│       │   └── lang/         ← en · zh
│       └── docs/             ← Whitepaper PDFs
├── contracts/                ← Testnet contracts + deploy tooling
│   ├── OMCTestToken.sol      ← tOMC: transferable ERC-20 + faucet (20/day, 5 lifetime)
│   ├── OMCStaking.sol        ← tier stake · heartbeat · real slashing
│   ├── OMCComputeMarket.sol  ← job escrow · assignment · settlement · disputes
│   ├── test/                 ← property-based suite (forge test)
│   ├── security/             ← self-review harness, snapshots, tool output
│   ├── tools/compile.js      ← solc build (viaIR, paris evm)
│   ├── tools/deploy.js       ← deploy / verify / handover
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

---

## 🤝 Contributing

## 🧩 Ecosystem

OMC runs a small editorial network alongside the protocol site — independent in voice, disclosed in writing on every page:

| Property | URL | What it is |
|---|---|---|
| **AITop** | [top.omc.network](https://top.omc.network) | AI tool comparisons and rankings — one table per question, 37 pages |
| **DCF** | [forum.omc.network](https://forum.omc.network) | Decentralized Compute Forum — GPU market analysis, a 12-network comparison tracker, and hands-on testnet guides |

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
