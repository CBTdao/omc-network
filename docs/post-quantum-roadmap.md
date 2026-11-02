# Long-term Security & Resilience Roadmap — OMC

**Scope.** This document records OMC's stance and plan on two classes of
long-horizon risk: (a) **asset theft resistance** and (b) **post-quantum
cryptography** readiness. It is a planning document, not a security audit, and it
does **not** claim that OMC is currently quantum-resistant. It is published
alongside [`SECURITY.md`](../SECURITY.md) and
[`docs/security-review.md`](security-review.md).

**Status.** Draft for the testnet phase. Dates are tentative until the mainnet
deployment is locked.

---

## 0. Framing — read this first

OMC runs on an EVM-compatible chain (BNB Chain, BEP-20 token). That single fact
sets the boundary for everything below:

- A user's token custody rests on the **ECDSA / secp256k1** signature scheme of
  the EVM and their wallet. OMC, as a set of smart contracts, **cannot change the
  signing algorithm of a user's externally-owned account (EOA)**. So the phrase
  "our coin is quantum-resistant" is **false** and will not appear anywhere in
  OMC's materials — it is the kind of over-statement that gets screenshotted and
  dismantled.
- What OMC *can* control is real and is what this roadmap commits to: the
  project's own off-chain signing, the contract's access-control model, and the
  user-facing guidance.

Honesty guardrails (enforced by `scripts/security-narrative.test.mjs`):

- Never write "quantum-resistant", "quantum-proof", "抗量子", or
  "后量子已就绪" as an achieved fact.
- Never write "audited" — `SECURITY.md` already states the contracts are
  self-reviewed, not audited.
- Post-quantum is described only as *tracked / planned / used in OMC-controlled
  signing*, never as a property of the token itself.

---

## 1. Two threats, two time horizons

| | Theft resistance | Post-quantum readiness |
|---|---|---|
| **Nature** | Present-day | Future (decades-scale, compressing) |
| **Main risk** | A single compromised key = total protocol control; user-side phishing / fake airdrops | Shor's algorithm deriving a private key from an exposed ECDSA public key |
| **What OMC controls** | Access control, key custody, user education | Off-chain signing, upgrade path, user address hygiene |
| **Action today** | Multisig + timelock + audit + education | Track standards, pilot off-chain Dilithium, plan upgrade path |

### 1.1 Post-quantum context (measured, not hyped)

- NIST finalised three post-quantum standards in 2024-08: **FIPS 203 ML-KEM**
  (Kyber, key encapsulation), **FIPS 204 ML-DSA** (Dilithium, signatures), and
  **FIPS 205 SLH-DSA** (SPHINCS+, hash-based signatures). **Falcon** is also an
  approved signature standard.
- Breaking secp256k1 is estimated to require **millions of logical qubits** —
  far beyond anything that exists. Industry roadmaps align around 2029–2030 for
  *hundreds* of logical qubits, which is still insufficient to break ECDSA.
  Metaculus puts the probability of a machine that breaks ECC at ~20% before
  2030.
- The genuinely urgent pattern is **harvest-now-decrypt-later**: an adversary
  records exposed public keys today and forges signatures once quantum hardware
  matures. Address hygiene (do not reuse addresses) directly reduces this
  exposure — and it also defends against ordinary theft.

---

## 2. What OMC can and cannot control

**Cannot (no action will change this unilaterally):**

- The signature algorithm of a user's EOA. That is fixed by the EVM and the
  wallet. OMC cannot make a user's BEP-20 holdings "quantum-proof" on its own.

**Can (committed in this roadmap):**

1. **Off-chain signing that OMC fully controls** — e.g. the `ai-tools-service`
   job authentication and any internal message signing — can move to
   Dilithium / SPHINCS+ today, independent of the chain.
2. **Contract access control** — move `owner`, `verifier`, `market`,
   `treasury`, `requesterPool` from a single key to a **multisig** (Gnosis Safe
   class) plus a **timelock** before mainnet.
3. **Upgradeability / account-abstraction headroom** — design the mainnet
   deployment so that, if the base layer later offers post-quantum account
   abstraction (EIP-7702 / 4337 class), users can migrate without the protocol
   being stranded.
4. **User education** — address hygiene, hardware wallets, official-domain-only
   — which serves *both* theft resistance and post-quantum exposure.

---

## 3. Theft-resistance track (now → mainnet)

### 3.1 Already done (testnet)

- `docs/security-review.md` — static analysis (slither, solhint), property-based
  tests (2,762 assertions, pass), and on-chain bytecode verification
  (`verify_live_bytecode.py`). Three defects found and fixed, all live on
  testnet.
- `SECURITY.md` openly states the contracts are **not** audited, are testnet-only,
  and that the trusted roles are currently single-signature.

### 3.2 Before mainnet (mandatory)

- **Multisig.** `owner`/`verifier`/`market`/`treasury`/`requesterPool` are plain
  `address` fields today — `transferOwnership` already accepts any non-zero
  address, so pointing them at a Gnosis Safe multisig requires **no contract
  change**, only a deployment decision. Target a 3-of-5 (or similar) threshold.
- **Timelock.** Sensitive operations (emission tuning, treasury changes, market
  registration) wrapped behind a `TimelockController` so the community has a
  delay window to observe and react.
- **Emergency pause.** The contracts already expose `paused`; confirm it is held
  by the multisig and reachable quickly.
- **Cold-key custody.** Signer keys offline; no key ever touches application code
  or this repository.

The concrete role→multisig mapping, threshold, timelock delay and deployment
sequence are specified in [`docs/mainnet-access-control.md`](mainnet-access-control.md).

### 3.3 User side

- Anti-scam guidance already in the airdrop FAQ: the team never asks for a seed
  phrase / private key / to send BNB to any address; trust only `omc.network`
  and the verified X / Telegram accounts. Keep this prominent.
- One official domain (`omc.network`) and subdomains; anything else is
  fraudulent.

### 3.4 Independent audit

- `security-review.md` §6 already records the budget range (≈ $3k–$7k for a
  first-tier audit). Commission before the contracts hold value on mainnet.

### 3.5 Continuous

- Run slither / solhint / `fuzz_props.py` / `verify_live_bytecode.py` in CI.
- Open a security contact channel before mainnet (already planned in
  `SECURITY.md`).

---

## 4. Post-quantum track (phased, contingent on the base layer)

### 4.1 Track the standards

- FIPS 204 (Dilithium), FIPS 205 (SPHINCS+), FIPS 203 (Kyber), Falcon.
- The base layer's own roadmap: Ethereum's `ETH2030` post-quantum work, and
  whatever BSC publishes. OMC's token security is bound to this.

### 4.2 Off-chain signing (OMC-controlled — pilot now)

- The `ai-tools-service` and any internal signing move to **Dilithium**
  (libsodium / OpenQuantumSafe `liboqs`, or `pqcrystals-dilithium`) for
  message authentication, independent of the chain. See the proof-of-concept
  under `ai-tools-service/` (tracked in the task list).
- This is the one place OMC can be quantum-resistant *today*, because it does not
  depend on the EVM.

### 4.3 Contract upgrade headroom

- The current testnet contracts are **non-proxy** and deliberately frozen before
  mainnet (a redeploy strands the reward pool). The mainnet deployment therefore
  must get access control right **once**: multisig owner + a clear decision on
  upgradeability (UUPS / Transparent proxy, or an explicit freeze). If a proxy is
  adopted, it also becomes the lever for a future post-quantum account-abstraction
  migration.

### 4.4 Address hygiene

- Document and surface, in the UI, the rule: do not reuse addresses; prefer
  hardware wallets. This reduces public-key exposure for both theft and
  harvest-now-decrypt-later.

### 4.5 Long-term

- If the base layer ships post-quantum account abstraction, migrate via that path
  or evaluate a multi-chain deployment (e.g. an Ethereum L2 with an active
  post-quantum roadmap) as a hedge. Treat as a long-horizon observation, not a
  near-term commitment.

---

## 5. Honesty guardrails (do not cross)

- No "quantum-resistant" / "quantum-proof" / "抗量子" as an achieved fact.
- No "audited".
- Post-quantum is *tracked / planned / used in OMC-controlled signing* only.
- Every external number and commitment binds to `contracts/params.json` or a
  verified fact.

---

## 6. Milestones

| When | Theft resistance | Post-quantum |
|---|---|---|
| Testnet now | This roadmap + SECURITY hardening published | Off-chain Dilithium PoC; standards tracking |
| Before mainnet (≤ 2027-01-01) | Multisig + timelock deployed; audit; pause confirmed; user education live | Upgrade-headroom decision locked at genesis |
| Long-term | Continuous CI + bounty | Follow base-layer account-abstraction; multi-chain hedge option |

---

## 7. See also

- [`SECURITY.md`](../SECURITY.md) — access control, trusted roles, vulnerability
  reporting.
- [`docs/security-review.md`](security-review.md) — self-review scope, method,
  findings, residual risk.
- Whitepaper §6 — Security and Privacy.
