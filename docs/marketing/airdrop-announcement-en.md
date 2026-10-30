# Free Airdrop: 20,000,000 OMC on BNB Chain — Everything You Need to Know (Including the Fee)

*Publish as-is on Medium, Mirror, Hackernoon or your own blog. Replace nothing. The numbers are generated from `contracts/params.json`, and `scripts/announcement.test.mjs` fails the build if this copy drifts from them.*

---

Most airdrop announcements are written to be screenshotted, not read. They lead with a number, bury the conditions, and let people discover the catch at the wallet prompt. This one is written the other way round: the conditions are in the third paragraph, and the fee is in the fourth.

Omniverse Compute is a decentralized GPU compute network on BNB Chain. We are giving away **20,000,000 OMC** — two percent of a fixed supply of 1,000,000,000 — to anyone who completes three social tasks. It is free to join. There is no presale, no private round, no allowlist to beg into, and nothing to buy.

## The numbers, in one table

| | |
|---|---|
| **Token** | OMC — BEP-20 on BNB Smart Chain |
| **Total pool** | 20,000,000 OMC (2% of a fixed 1,000,000,000 supply) |
| **Per entry** | 20 OMC, delivered in full at claim |
| **Slots** | 1,000,000 — first come, first served |
| **Cost to join** | Free — no purchase, no presale, no deposit |
| **Entry cap** | 5 base + up to 5 referral = 10 entries (200 OMC) per wallet |
| **Daily limit** | 1 entry per calendar day |
| **Claim processing fee** | 0.01 BNB per entry, not refunded |
| **Registration** | Open now |
| **Claim window** | 1 January 2027 — 31 March 2027 (UTC+8) |

## How to take part

1. Follow **@Omniverse_Depin** on X.
2. Retweet and comment on the pinned post. Both actions are verified on our own page, not on X.
3. Join the Telegram group.
4. Connect a BNB Smart Chain wallet at omc.network/airdrop and register up to 5 base entries.

Step 4 is a signature, not a transaction. It costs no gas and sends no payment. Each wallet you invite that registers its first entry earns you one more entry, up to five. The daily cap is one entry per calendar day, which applies to everyone including people who arrive with ten wallets.

The pool is first come, first served. Per-wallet caps do not reserve anything: if you claim after the pool is empty, you get nothing. There is no lottery and no snapshot.

## The part most announcements skip: the 0.01 BNB

Claiming costs **0.01 BNB per entry**, charged once, inside the claim transaction. A base claim of five entries is 0.05 BNB. A capped ten-entry claim is 0.1 BNB.

Three things about that fee, stated plainly:

**It is not a price for the token.** It is a processing charge for the claim transaction, in the same way the network charges gas for a transfer. It is not a percentage of anything and it is not indexed to the OMC price: the same 0.01 BNB applies whether OMC trades at $0.01 or at $1.

**It is not refunded.** It funds work that has already happened — 60% to ecosystem development (audits, testnet incentives, RPC and indexer costs, the node client, the sub-sites) and 40% to team operations. There is no private round behind this project, so the fee is the funding path before compute revenue exists.

**None of it is deducted from what you receive.** An entry is 20 OMC and delivers 20 OMC in the claim transaction. There is no cliff and no vesting tail on the airdrop.

Why charge anything at all? Because free tokens are farmed by wallets that have no intention of ever running a GPU, and a project that hands out its only source of early liquidity to those wallets has nothing left to build with. A wallet that will not spend 0.01 BNB does not intend to use the network. A wallet that will has already priced its own interest.

That trade-off is worth being honest about: below roughly **$0.374 per OMC**, a five-entry claim is a net cash cost rather than a gain. We are not going to pretend the arithmetic promises a profit. The campaign asks people to claim because they intend to use a compute network, and the tokens are worth whatever the market decides after listing.

## Why 100% at claim, when everything else is locked

The investor allocations carry the lock-ups: private 10% at TGE then 18 months, institutional 5% at TGE then 24 months, ecosystem 5% at TGE then 36 months, team a 12-month cliff then zero.

The airdrop carries none. Withholding three quarters of something someone has already paid a fee for is a second lock on the same thing, and it makes the headline number false — a page that says 20 OMC and delivers 5 is a page nobody trusts twice. The airdrop is the one allocation delivered in full, because it is the one allocation paid for at the claim window rather than bought at a discount.

Claimed tokens are liquid from the first block. If the point is to bootstrap real usage, people should be able to stake them, pay for compute with them, or sell them without asking permission.

## Timeline

| | |
|---|---|
| **27 October 2026** | Registration opens. Three social tasks, one wallet, no payment. |
| **1 January 2027** | Mainnet and TGE. The claim window opens. |
| **31 March 2027** | Claim window closes. Unclaimed slots return to the protocol. |

## What is not live yet

Stated plainly, because a launch post that omits this is not worth reading: there is **no mainnet deployment, no token contract, no audit, and no exchange listing**. Those arrive on 1 January 2027 or later.

Today there is a public testnet, a working node client, and a registration flow. The protocol fee is set at 8% of settled compute volume — 50% burned, 30% to staked nodes, 20% to the treasury — and emission is gated by trailing 30-day fee revenue so issuance follows real usage instead of a calendar. All of that is design, not revenue. Treat it as scheduled rather than shipped.

## Scam warning

No OMC token exists before TGE. Any contract, presale, or "claim portal" using the OMC name today is fraudulent — including any that asks you to send BNB to a wallet address "for gas". We will never ask for a seed phrase or a private key, in any channel, for any reason.

The only addresses that matter are published at **omc.network** and in the GitHub repository, with the deployment transaction alongside them.

## Where to check any number in this post

Every figure here is generated from `contracts/params.json` in the repository — the single source of truth the contracts are deployed from. The same numbers are published machine-readable at **omc.network/airdrop.json** for listing sites and answer engines, and summarised at **omc.network/llms.txt**.

If a third-party listing disagrees with this post, the listing is stale. That is not a marketing position; it is a property of the build: the test suite fails if the published feed and the parameter file diverge.

---

**Register free:** https://omc.network/airdrop
**Announcement (dated, with sources):** https://omc.network/news/omc-airdrop-is-open
**Repository:** https://github.com/CBTdao/omc-network
**X:** https://x.com/Omniverse_Depin · **Telegram:** https://t.me/OmniverseCompute

*Digital assets carry risk. A claimed allocation may be worth nothing. The claim processing fee is not refunded. Nothing here is financial advice. Participation may be restricted in some jurisdictions — see omc.network/aup.*
