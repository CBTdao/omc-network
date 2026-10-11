# Security

**These contracts are testnet-only.** They are deployed to BNB Smart Chain testnet
(chainId 97), hold no value, and nothing here promises or implies a return. The
mainnet deployment and TGE are scheduled for **2027-01-01**, alongside the opening
of the community airdrop.

## Not audited

The contracts have **not** been audited by a third-party firm. The team runs its own
static analysis and property-based tests and publishes the results, and that is a
different thing:

> Free automated tooling is weak by measurement. A 2024 study of 127 incidents
> (~$2.3 B of losses) found that five mainstream automated analysers together would
> have flagged about **8%**. A 2023 study of 516 exploitable vulnerabilities found
> that **more than 80%** were outside what those tools can see.

Anything that describes this project as "audited" on the strength of the material
below would be misleading. Please don't.

## What is published

| Document | Contents |
|---|---|
| [`docs/security-review.md`](docs/security-review.md) | Full self-review: scope, method, tool versions, every finding, residual risk, reproduction commands |
| [`contracts/security/`](contracts/security/) | The harnesses and the raw triaged tool output |

Summary of the 2026-10-11 self-review of `OMCTestToken.sol`, `OMCStaking.sol` and
`OMCComputeMarket.sol`:

| Tool | Result |
|---|---|
| solhint 6.2.5 | 0 errors, 502 warnings — all style / gas / natspec |
| Slither 0.11.6 (102 detectors) | **0 Critical, 0 High**, 26 Medium, 46 Low (72 findings before the fixes, 69 after) |
| Property-based tests, `anvil` + `web3.py` | 2,521 assertions over randomised inputs — pass |
| Manual review | all 1,573 lines |

**One High-severity defect was found and fixed in source:**

> `OMCComputeMarket.fail()` applied the published 50/30/20 slashing split twice — once
> in `OMCStaking.slashFor()`, then again out of the market's own balance. It was short
> by exactly half of every slash, so **`fail()` reverted for every non-zero penalty**:
> the failure/refund path, the mechanism that makes a requester whole out of a
> provider's bond, could not execute at all.

The fix is in the repository. **It is not yet deployed** — the three testnet
addresses below still run the pre-fix bytecode, and
[`contracts/security/bytecode-report.json`](contracts/security/bytecode-report.json)
records the hashes that prove it.

## Deployments under review

BNB Smart Chain testnet (chainId 97). Every address is a testnet deployment; nothing
here refers to a mainnet asset.

| Contract | Address |
|---|---|
| `OMCTestToken` (tOMC) | `0xBEB21E40FB50A0F4ba9287C2058DC7851e450671` |
| `OMCStaking` | `0x3226dffED51e28CEf526F8c078B2EC9a092E36e6` |
| `OMCComputeMarket` | `0x3B81E6edfbA775B4E53694F531C3b0236D77FEF1` |

## Trusted roles

Stated plainly rather than buried, because they are the largest remaining risk:

- `owner` — retunes the emission rate, the published APR ceiling, the heartbeat
  window and the tier ladder; can pause staking and market operations.
- `scheduler` — off-chain role; the only address that can assign, settle, fail or
  resolve a job. Compute actually runs off chain; the contract is the escrow and
  verdict state machine around it.
- `verifier` — attests verified work on `OMCStaking`.

On the current testnet deployment owner, scheduler and verifier are all the deployer
address, which is **not** a multisig. That is acceptable for a testnet and will
change before mainnet.

## Reproducing the review

```bash
cd contracts/security

# property-based tests against the reviewed build (no compiler required)
python fuzz_props.py

# reproduces the High-severity defect against the code that is deployed today
python fuzz_props.py --artifacts pre-fix-snapshot --only p3
python fuzz_props.py --artifacts pre-fix-snapshot --only p4

# compares the chain against both local builds
python verify_live_bytecode.py
```

Static analysis and the primary Foundry suite are documented in
[`docs/security-review.md` §7](docs/security-review.md#7-how-to-reproduce).

## Reporting a vulnerability

Please open a GitHub issue on this repository. A dedicated security contact channel
will be published before the mainnet deployment. Please do not disclose an
unpatched issue publicly before it has been addressed.
