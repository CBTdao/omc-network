# Mainnet Access Control — Multisig + Timelock

**Status:** mandatory before mainnet. This document is the concrete spec for OMC's
anti-theft main line. See [`docs/post-quantum-roadmap.md`](../docs/post-quantum-roadmap.md)
for the forward-looking post-quantum track and the honest boundary between what OMC
controls and what it does not.

## 0. Why this is the real work

Most protocol losses do **not** come from exotic cryptography. They come from **one
compromised key** — a leaked deployer key, a single signer's laptop, a reused
mnemonic. OMC's testnet deployment today uses single-signature keys, and
`SECURITY.md` already names this as the largest remaining risk. Closing it is the
highest-leverage, lowest-uncertainty security work OMC can do before mainnet.

This is also the part of the security story that is **real today**, unlike the
post-quantum track (which is preparation, not a shipped property).

## 1. Role inventory

| Role | What it can do | Should be multisig? |
|---|---|---|
| `owner` (staking + market) | retune emission, APR ceiling, heartbeat window, tier ladder; pause staking/market | **Yes** |
| `verifier` | attest verified work on staking | **Yes** |
| `market` | register/approve providers, resolve disputes | **Yes** |
| `treasury` | receive the 20% fee share | **Yes** |
| `requesterPool` | hold requester escrow/fee accounting | **Yes** |
| `scheduler` | off-chain job assignment/settlement/fail/resolve | Off-chain; protect via key custody, not a chain multisig |

## 2. Multisig

- Use **Gnosis Safe** (audited, battle-tested) as the role holder.
- **No contract change required.** `owner`, `verifier`, `market`, `treasury` and
  `requesterPool` are plain `address` fields; `transferOwnership` already accepts
  any non-zero address. Pointing them at a Safe is a deployment decision, not a
  code change.
- **Threshold:** 3-of-5 (or similar). 5 signers, no single signer can move funds
  or change parameters alone; tolerates up to 2 compromised signers.
- **Signer set:** distinct individuals/devices, geographically and organisationally
  separated. No two signers on the same machine, cloud account, or jurisdiction
  where one warrant/seizure takes two.

## 3. Timelock

Wrap the **slow, high-impact** operations behind an OpenZeppelin `TimelockController`
(or equivalent):

- Parameter changes (emission, APR ceiling, heartbeat, tier ladder)
- Treasury withdrawals / large transfers
- Role transfers (`transferOwnership` to a new Safe)
- Market registration / provider approval changes

**Delay window:** 48 hours for parameter + treasury changes (gives the community a
window to observe, discuss, and — if needed — exit or raise an alarm). The delay is
a public, on-chain value, so every pending change is visible before it executes.

**Emergency pause is NOT timelocked.** The `paused` flag on `OMCStaking` and
`OMCComputeMarket` must remain reachable quickly via the multisig, so the protocol
can freeze on a live incident. Pause = fast; everything else = delayed. This is the
standard trade-off: you want to stop bleeding immediately, but you do not want a
single compromised signer to be able to drain the treasury on a timer-free path.

## 4. Deployment sequence (at genesis)

1. Deploy `TimelockController` with the chosen delay and the Safe as its *proposer*
   and *executor* (so only the Safe can schedule, and only after the delay can it
   execute).
2. Deploy the Gnosis Safe (3-of-5) with the separated signer set.
3. Deploy the OMC contracts with the Safe address as the initial `owner` (and the
   other roles pointed at the same or purpose-specific Safes).
4. Verify on-chain: read each role from the contract and confirm it equals the
   expected Safe address. Record the verified addresses in `SECURITY.md`.
5. Confirm the pause path: a multisig call flips `paused` immediately.
6. Move signer keys fully **offline** (hardware / air-gapped). No signer key ever
   enters application code or this repository.

## 5. What this does NOT do (honesty)

- It does **not** make the token quantum-resistant. Token custody is still EVM
  ECDSA / secp256k1; that is inherited from the base layer and is out of OMC's
  unilateral control. See the roadmap.
- It does **not** eliminate all risk. A 3-of-5 Safe still depends on signer
  hygiene, the timelock delay being respected by tooling, and the community
  actually watching the delay window. It shrinks the dominant risk to a manageable
  one; it is not a silver bullet.
- It does **not** replace a code audit. Multisig + timelock are access control, not
  correctness. The independent audit (roadmap §3.4) is still required before the
  contracts hold value.

## 6. Verification & publication

- After deployment, `SECURITY.md` carries the live Safe addresses, the threshold,
  the timelock delay, and the on-chain verification method.
- A small script (mirroring `verify_live_bytecode.py`) reads each role from chain
  and asserts it matches the published Safe — runnable in CI so a future
  single-key deployment is caught.
- Signer public identities (Safe address, not keys) are published; key custody
  procedures stay private by design.
