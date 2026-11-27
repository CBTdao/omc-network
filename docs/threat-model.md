# OMC — Threat model & privilege matrix

> Purpose: a one-page map for external reviewers of the open-source OMC compute
> contracts. It complements [`SECURITY.md`](../SECURITY.md) and
> [`docs/security-review.md`](security-review.md). It is a self-assessment, not an
> independent audit. Mainnet + TGE are scheduled for **1 January 2027**; the review
> below describes the BNB Smart Chain testnet build (chainId 97).

## 1. Boundary

| Layer | Reviewed | Notes |
|---|---|---|
| `OMCTestToken.sol`, `OMCStaking.sol`, `OMCComputeMarket.sol` | Yes | Static analysis, property tests, line-by-line read; bytecode verified on chain |
| Off-chain scheduler / verifier / node worker | **No** | The only thing between an arbitrary job and a slashing call; the largest blind spot |
| Airdrop signer / API, static website | **No** | Off-chain signature issuance and browser-side state |
| Token economics and incentive design | **No** | Reviewed as documentation claims only, not as a mechanism |

## 2. Asset flows

- **Stake / bond.** A node stakes OMC, registers hardware at a tier, and keeps a
  heartbeat alive. `OMCStaking` holds the bond; the tier ladder sets minimum stake.
- **Job settlement.** A requester escrows OMC; `OMCComputeMarket.settle()` pays the
  provider and splits the 8% protocol fee **50% burn / 30% to staked nodes / 20% to
  treasury**. `fail()` slashes the provider through `OMCStaking.slashFor()` with the
  same 50/30/20 split, making the requester whole. The double-application of that
  split (F-1) was found and fixed before the deployed build was reviewed.
- **Rewards.** `fundRewards()` tops up `rewardLiquidity` one-way; there is no owner
  rescue. A redeploy of `OMCStaking` strands the pool — on mainnet the contract must be
  frozen before launch or funding must be re-added.
- **Burn / mint headroom.** Real burns reduce `totalSupply()`, and the token cap is
  `totalSupply + amount <= 1,000,000,000`, so destroyed supply becomes mintable again.
  That is a property of the cap, not a bug in the burn.
- **Airdrop.** Registration is a wallet signature against a fixed 20,000,000 OMC pool
  (1,000,000 entries × 20 OMC). Claiming opens on mainnet with a **0.01 BNB per-entry
  processing fee**, split **60% ecosystem development / 40% team operations**. Claim
  state, daily limits and invite credits are enforced partly off chain.

## 3. Privilege matrix

| Role | Can do | Testnet holder | Mainnet plan |
|---|---|---|---|
| `owner` (staking + market) | Retune emission, APR ceiling, heartbeat window, tier ladder; pause staking and market | Deployer EOA `0x6126…690e` | 3-of-5 multisig, 48h timelock |
| `scheduler` | Assign, settle, fail and resolve jobs | Same deployer EOA | Multisig-controlled operator, timelocked registration |
| `verifier` | Attest verified work on `OMCStaking` | `0xc357…22B4` | 3-of-5 multisig |
| `treasury`, `requesterPool`, token `owner` | Receive protocol fee / hold pool / mint within cap | `0xc357…22B4` | Separate multisig-controlled addresses |
| Anyone | `slashOverdue()` settles a dark node's debt; heartbeat to resume earning | Permissionless | Unchanged |

`transferOwnership` already accepts any non-zero address, so pointing roles at a
Gnosis Safe needs no contract change — only a deployment decision.

## 4. Threats, mitigations and residual risk

| Threat | Mitigation in place | Residual |
|---|---|---|
| Fake job / malicious scheduler | Escrow state machine, `onlyScheduler` on settle/fail, verifier attestation | A compromised scheduler can still settle or fail incorrectly; off chain, unreviewed |
| Provider goes dark | Permissionless `slashOverdue()`, heartbeat requirement | Node cannot unstake until it heartbeats; knowingly documented |
| Sybil airdrop farming | One daily entry per wallet, invite credit only from a completed first entry, 0.01 BNB claim fee | Signature issuance is off chain and not covered by this review |
| Replay / stale signature | Canonical message builder, `BAD_SIGNATURE` / `STALE_MESSAGE` responses | Verify the API's nonce and expiry in the final mainnet pass |
| Key compromise | Mainnet 3-of-5 multisig, 48h timelock, cold signer keys, pause flags on both contracts | Testnet still uses two EOAs; mainnet transfer is a launch dependency |
| Economic logic bug | Property tests over randomised inputs, fixed splits, manual review | Automation misses economic paths; a 2025 Flare contest found 9 high-severity issues a month after a "zero-high" review |
| Supply cap confusion | Cap checked on `totalSupply`, not cumulative issuance | Burned supply can be minted again; stated openly |

## 5. Where outside eyes help most

1. **Scheduler trust boundary** — can an arbitrary job reach a slashing call through
   any path that bypasses verification?
2. **Economic invariants** — do the 50/30/20 splits, tier ladder and APR ceiling hold
   under adverse sequences, not just random inputs?
3. **Airdrop final pass** — signature replay, daily-limit enforcement, invite credit
   and the claim fee flow (60/40) against the published rules.
4. **Mainnet role transfer** — is a 48h timelock plus pause sufficient for the
   remaining privileged operations?
5. **Redeploy safety** — `fundRewards()` is one-way; what is the correct freeze and
   handover sequence for `OMCStaking` at genesis?

## 6. Reproduce

```bash
cd contracts/security
python fuzz_props.py                    # property tests against the current build
python verify_live_bytecode.py          # chain vs reviewed build
```

Full method, findings and tool versions: [`docs/security-review.md`](security-review.md).
Deployed addresses and raw triaged output: [`contracts/security/`](../contracts/security/).
