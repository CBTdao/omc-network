<div align="center">

<img src="website/assets/img/logo.png" alt="Omniverse Compute" width="120" />

# Omniverse Compute (OMC)

**The Next-Gen Decentralized GPU Compute Network on BNB Chain**

Turn idle GPUs worldwide into a high-throughput, low-cost, censorship-resistant compute grid.

[![Token](https://img.shields.io/badge/Token-OMC%20%C2%B7%20BEP--20-2b6bf3?style=flat-square)](https://testnet.bscscan.com/token/0x3c7edae9da38b72db7ae98921ef0759d19de7cc5)
[![Chain](https://img.shields.io/badge/Chain-BNB%20Smart%20Chain-f0b90b?style=flat-square)](https://www.bnbchain.org/)
[![Testnet](https://img.shields.io/badge/Testnet-Live-22c55e?style=flat-square)](https://testnet.bscscan.com/token/0x3c7edae9da38b72db7ae98921ef0759d19de7cc5)
[![Supply](https://img.shields.io/badge/Supply-1%2C000%2C000%2C000%20OMC-8b5cf6?style=flat-square)](#tokenomics)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

[Website](#-website) · [Whitepaper](docs/OMC-Whitepaper-EN.pdf) · [Testnet](#-testnet) · [Airdrop](#-airdrop) · [X / Twitter](https://x.com/Omniverse_Depin) · [Telegram](https://t.me/OmniverseCompute)

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
| Faucet | https://testnet.bnbchain.org/faucet-smart |
| **Test Contract (tOMC)** | [`0x3C7EDae9da38b72Db7AE98921eF0759d19dE7Cc5`](https://testnet.bscscan.com/token/0x3c7edae9da38b72db7ae98921ef0759d19de7cc5) |

### Run a Node in 4 Steps

```bash
# 1. Get test BNB (tBNB) from the faucet for gas
#    https://testnet.bnbchain.org/faucet-smart

# 2. Pull the open-source node client
git clone https://github.com/CBTdao/omc-network.git
cd omc-network/node
docker compose up     # any CUDA / ROCm machine

# 3. Stake tOMC proportional to your hardware tier and register your node heartbeat
# 4. Receive matched tasks, execute in sandbox, pass dual verification, collect rewards
```

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

**Phase 1 · Q1–Q2 2026 — Infrastructure & Testnet**
- [x] L2 smart contract deployment
- [x] Open-source node client release
- [x] Public testnet launch
- [ ] 2% community airdrop campaign

**Phase 2 · Q3–Q4 2026 — Mainnet & Mining**
- [ ] Mainnet launch
- [ ] Compute mining activation
- [ ] HuggingFace & Blender plugin integration

**Phase 3 · 2027 — ZK-ML & Full DAO**
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
├── website/                  ← Official website (static, 7 languages)
│   ├── index.html            ← Home
│   ├── whitepaper.html       ← Whitepaper (web rendering)
│   ├── testnet.html          ← Testnet & node onboarding
│   ├── airdrop.html          ← Community airdrop
│   └── assets/
│       ├── css/style.css
│       ├── img/logo.png
│       ├── js/               ← i18n engine + airdrop logic
│       │   ├── i18n.js
│       │   ├── main.js
│       │   └── lang/         ← en · zh · ja · es · ko · pt · fr
│       └── docs/             ← Whitepaper PDFs
└── docs/                     ← Protocol documentation
```

---

## 🌍 Website

The official site is a dependency-free static build with **7-language support** (English · 中文 · 日本語 · Español · 한국어 · Português · Français).

To run locally:

```bash
cd website
python -m http.server 8080
# open http://localhost:8080
```

---

## 🤝 Contributing

We welcome contributions. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

---

## 🔗 Links

| | |
|---|---|
| X / Twitter | [@Omniverse_Depin](https://x.com/Omniverse_Depin) |
| Telegram | [t.me/OmniverseCompute](https://t.me/OmniverseCompute) |
| Test Contract | [`0x3C7EDae9...dE7Cc5`](https://testnet.bscscan.com/token/0x3c7edae9da38b72db7ae98921ef0759d19de7cc5) |

---

## ⚠️ Disclaimer

Omniverse Compute (OMC) is the utility token of a decentralized infrastructure protocol. Nothing in this repository constitutes financial advice. Digital assets carry high risk — do your own research and comply with the laws of your jurisdiction. Airdrop participation may be restricted in certain jurisdictions. Testnet tokens (tOMC) have no monetary value.

---

<div align="center">
<sub>© 2026 Omniverse Compute · Built on BNB Chain</sub>
</div>
