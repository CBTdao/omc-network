# Security

**These contracts are testnet-only.** They are deployed to BNB Smart Chain testnet
(chainId 97), hold no value, and nothing here promises or implies a return. The
mainnet deployment and TGE are scheduled for **2027 Q2–Q3**, alongside the opening
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
| Property-based tests, `anvil` + `web3.py` | 5 properties, 2,762 assertions over randomised inputs — pass |
| Manual review | all 1,573 lines |

**Three defects were found and fixed. All three are live on testnet now — the
addresses in §Deployments run the fixed bytecode, verified against the chain.**

The High-severity one:

> `OMCComputeMarket.fail()` applied the published 50/30/20 slashing split twice — once
> in `OMCStaking.slashFor()`, then again out of the market's own balance. It was short
> by exactly half of every slash, so **`fail()` reverted for every non-zero penalty**:
> the failure/refund path, the mechanism that makes a requester whole out of a
> provider's bond, could not execute at all.

And two lower-severity ones, both about a promise the code did not keep:

> The "burn" halves of the slashing split and the protocol fee were paid with
> `transfer(0x…dEaD, amount)` rather than a real burn, so `totalSupply()` never fell —
> the published rule that those burns reduce supply was not enforced by the code.
>
> The whitepaper described a market buy-back ("buy back OMC on the market and burn
> it") that no contract has ever performed. Jobs are escrowed and settled in OMC, so
> the fee is already denominated in the token; the sentence has been corrected rather
> than implemented, because there is nothing to implement.

[`contracts/security/bytecode-report.json`](contracts/security/bytecode-report.json)
records the hashes proving the deployed code is the reviewed build, and
[`docs/security-review.md`](docs/security-review.md) §4 carries the full findings list
and the two defects this second pass *also* turned up off-chain.

## Deployments under review

BNB Smart Chain testnet (chainId 97). Every address is a testnet deployment; nothing
here refers to a mainnet asset.

| Contract | Address |
|---|---|
| `OMCTestToken` (tOMC) | `0xBEB21E40FB50A0F4ba9287C2058DC7851e450671` |
| `OMCStaking` | `0xa70B8506a1a614Fd83D0C70d73Da1E21fdcf1fB6` |
| `OMCComputeMarket` | `0x7664f1e73c2CBCbaFE636a653C173378C369C40A` |

These are the post-fix deployments. Earlier addresses are kept in
`contracts/deployments/bsc-testnet.json` under the `prev*` keys, so every revision that
was ever live can still be located on chain.

## Trusted roles

Stated plainly rather than buried, because they are the largest remaining risk:

- `owner` — retunes the emission rate, the published APR ceiling, the heartbeat
  window and the tier ladder; can pause staking and market operations.
- `scheduler` — off-chain role; the only address that can assign, settle, fail or
  resolve a job. Compute actually runs off chain; the contract is the escrow and
  verdict state machine around it.
- `verifier` — attests verified work on `OMCStaking`.

On the current testnet deployment those roles sit on **two** addresses, and neither is
a multisig:

- `owner` on both staking and market, plus `scheduler` — the deployer address,
  `0x6126b78a560D7edFC68179f064B26ba820Ee690e`
- `verifier`, `treasury`, `requesterPool`, and the token's `owner` —
  `0xc35711aa6128B8208FA534dbf94d3aF24BA22B4B`

Read directly from the chain rather than from the deployment record, which names a
different address in its `owner` key. Acceptable for a testnet, and it has to change
before mainnet — a single key that can retune emission and reassign the scheduler is
the largest remaining risk in this system, larger than anything the automated tooling
can see.

## Reproducing the review

```bash
cd contracts/security

# property-based tests against the current build (no compiler required)
python fuzz_props.py

# reproduces the defects that were found, against the revisions that had them
python fuzz_props.py --artifacts pre-fix-snapshot --only p3   # F-1: fail() reverts
python fuzz_props.py --artifacts pre-f5-snapshot  --only p5   # F-12: the burn does not burn

# compares the chain against the reviewed build and every historical snapshot
python verify_live_bytecode.py
```

Static analysis and the primary Foundry suite are documented in
[`docs/security-review.md` §7](docs/security-review.md#7-how-to-reproduce).

## Reporting a vulnerability

Please open a GitHub issue on this repository. A dedicated security contact channel
will be published before the mainnet deployment. Please do not disclose an
unpatched issue publicly before it has been addressed.
