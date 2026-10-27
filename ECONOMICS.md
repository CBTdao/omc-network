# OMC economic model

Every number in this document is produced by [`models/economics.mjs`](models/economics.mjs)
or [`models/claim.mjs`](models/claim.mjs), and checked by
[`models/economics.test.mjs`](models/economics.test.mjs),
[`models/claim.test.mjs`](models/claim.test.mjs) and
[`scripts/params.test.mjs`](scripts/params.test.mjs). Nothing here is a forecast:
the GMV paths are scenarios, and running the model prints the same tables.

```bash
node models/economics.mjs                    # both designs, three scenarios
node models/economics.mjs --breakeven        # GMV needed for net-zero, by price
node models/claim.mjs                        # claim fee: ratio, revenue, sybil cost
node models/claim.mjs --revenue              # what 0.01 BNB raises, by claimer count
node models/claim.mjs --sybil                # what a sybil farm has to fund
```

## Verdict, up front

The previous design was **not an investable token**. It was an inflation schedule
with a fee mechanism attached. The fees were real, the burn was real, and both
were two orders of magnitude too small to matter. Four changes fix that, and
after them the token has a property it did not have before: **the rate at which
supply grows is a function of revenue, and it converges to zero on a published
schedule.**

## 1. Five arithmetic failures

### 1.1 The burn was a rounding error

3% fee × 30% burned = **0.9% of GMV destroyed**. To offset the emission ceiling,
annual settled volume would have to reach:

| | Year 1 | Year 5 |
|---|---:|---:|
| GMV required for net-zero supply (at $0.02) | **$33.3M** | **$133.3M** |

No new compute network does $33M of GMV in year one. So in the conservative
scenario, ten years of burn covers **13% of ten years of emission** (sink/source
0.13); in the base scenario, 38%.

The honest description of the old model is not "a fee-burning token". It is "an
inflationary token with a rounding-error burn".

### 1.2 Emission ignored revenue completely

15,000,000 OMC in year 1 whether the network settles $0 or $50,000,000. Dilution
was therefore a function of the calendar. An investor asking "when do you stop
diluting me, and what would have to be true for that to happen sooner" got an
answer that depended on nothing they could observe.

### 1.3 Stakers were paid only in inflation

The fee split sent **0% to stakers**. A 20% APR was therefore pure dilution: every
staker's rational move is to sell what they earn, because there is no other reason
to hold the position. That is the definition of mercenary capital, and it is why
"APR" in a DePIN deck is usually a red flag rather than a selling point.

### 1.4 Unstaking had no cooldown

`OMCStaking.unstake()` releases principal in the same block. Combined with 1.3 this
makes staking a **free option**: stake, farm emissions for a week, unstake, sell.
There is no cost to trying, so the marginal staker is a yield farmer and the
emissions that were meant to buy capacity buy nothing but sell pressure.

### 1.5 An 18% investor allocation with no price against it

`params.json` reserved 18% for "institutional 10% + private 8%" with no round
closed, no valuation, no discount disclosed. That is where token diligence stops,
because everything downstream — float, unlock wall, dilution — depends on a number
that is not there.

### 1.6 Two smaller ones

- The airdrop released **100% at claim**: a day-one sell wall built by the project
  itself, and the wallets that dump are the ones least likely to ever run a GPU.
- The 50M/year flat ceiling in the old schedule was **76% of the TGE float**; the
  ramp cut that to 23%, which was right, but it was fixing the wrong variable —
  the absolute number still had nothing to do with revenue.

## 2. The four changes

| | Before | After | Why |
|---|---|---|---|
| Protocol fee | 3% | **8%** | 4.4x the sink at the same split; the "50-70% cheaper than Web2 cloud" claim still holds with an 8% take |
| Fee split | 30% burn / 0% stakers / 70% reward pool | **50% burn / 30% stakers / 20% treasury** | A burn that scales, and a yield that is revenue rather than dilution |
| Emission | `min(schedule, APR cap)` | **`min(schedule, k × trailing 30d fee revenue)`**, k: 3 → 0.5 | No revenue means no emission; dilution becomes a business metric |
| Stake exit | instant | **14-day cooldown** | Farming becomes a real risk instead of a free option |
| Airdrop | 100% at claim | **25% at claim + 180 days linear** | Removes the day-one cliff without making the claim useless |

One further change belongs to the same redeploy: **the fee should be charged to the
requester on top of the provider's quoted price, not deducted from it.** Today
`toProvider = amount - fee`, so an 8% take is an 8% pay cut for the supply side —
the wrong side to tax when you are trying to attract the first thousand GPUs. A
requester-side service fee is also what every marketplace does, and it is easier to
defend: the provider quotes what the hardware costs, the requester pays for escrow,
verification and dispute resolution.

## 3. What it looks like now

### 3.1 The one claim that is true at any scale

Inside the revenue-gate regime, burn and emission are both linear in fee revenue,
so their ratio is **independent of GMV and of price**:

| Year | 1 | 2 | 3 | 4 | 5 | 6+ |
|---|---:|---:|---:|---:|---:|---:|
| Burn ÷ emission | 17% | 25% | 33% | 50% | 67% | **100%** |

From year 6 the ratio is 100% by construction: emission equals burn, and circulating
supply stops growing at *any* scale. This is the number to quote in a deck, because
it cannot be gamed by picking a friendly GMV assumption.

### 3.2 Conservative scenario, $0.02 reference price

TGE float is **50.5M** (5.05% of supply): 25M treasury, 5M of the airdrop (25%
is claimable at TGE, the rest vests over 180 days), 8M private, 7.5M ecosystem,
5M institutional. Counting only a quarter of the airdrop on day one removes 15M
from the float, and a smaller float makes the same emission a larger percentage
— so the peak inflation below is *higher* than it was when the model counted the
whole airdrop at TGE. That is the honest direction of the change.

Old design — never deflationary, peaks at 46.1% annual inflation:

| Yr | GMV | Fee (OMC) | Burn | Emission | Net | Circulating | Inflation | Burn÷Emit |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | $150k | 0.23M | 0.07M | 15.00M | +14.93M | 65.43M | 29.6% | 0% |
| 3 | $2.50M | 3.75M | 1.13M | 45.00M | +43.88M | 138.95M | 46.1% | 3% |
| 5 | $12.00M | 18.00M | 5.40M | 60.00M | +54.60M | 240.85M | 29.3% | 9% |
| 10 | $30.00M | 45.00M | 13.50M | 60.00M | +46.50M | 485.50M | 10.6% | 23% |

New design — peaks at 18.0%, flat by year 6, deflationary by year 9:

| Yr | GMV | Fee (OMC) | Burn | Emission | Net | Circulating | Inflation | Burn÷Emit |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | $150k | 0.60M | 0.30M | 1.80M | +1.50M | 52.00M | 3.0% | 17% |
| 3 | $2.50M | 10.00M | 5.00M | 15.00M | +10.00M | 66.80M | 17.6% | 33% |
| 5 | $12.00M | 48.00M | 24.00M | 36.00M | +12.00M | 90.80M | 15.2% | 67% |
| 6 | $18.00M | 72.00M | 36.00M | 36.00M | **0** | 90.80M | **0.0%** | 100% |
| 9 | $28.00M | 112.00M | 56.00M | 50.00M | −6.00M | 84.80M | −6.6% | 112% |

Same GMV, same decade: **485M circulating vs 75-91M**, and the point at which
dilution stops is a date rather than a hope.

### 3.3 Model limitation, stated

Price is held constant, and burn is denominated in OMC — so a rising price makes
each dollar of GMV burn fewer tokens. Holding price fixed therefore **overstates
deflation at high GMV**, which is why the model clamps burn at circulating supply
and flags it `†` instead of letting supply go negative. Read the conservative rows
as the honest ones and the aggressive rows as "deflationary, and price would have
moved". The gate-regime ratios in 3.1 are the only figures with no such caveat.

### 3.4 The numbers an investor will actually compute

- **Burn yield** = 4.0% of GMV ÷ FDV. At $30M GMV and a $150M FDV: 0.8%/yr. At $100M
  GMV and a $300M FDV: 1.3%/yr. Modest — but it is a real sink, and it is the
  reason the old 0.18% was unfixable by narrative.
- **Staker yield** = 2.4% of GMV ÷ staked value, *before* emissions. At $40M GMV
  and $8M staked: 12%/yr of actual revenue.
- **Break-even GMV**, by reference price, is printed by `--breakeven`. At $0.02 the
  year-1 figure is $5.0M (was $33.3M) and the year-5 figure is $25.0M (was $133.3M).

## 4. What parameters cannot fix

Honesty is part of the model. Three of the five objections a serious investor
raises are not addressable in this file:

1. **No paying customers.** Every number above is a function of GMV, and GMV is
   zero. The fee change makes the sink proportional to revenue; it does not create
   revenue.
2. **An anonymous team with no funding.** A token allocation table cannot substitute
   for a named entity and a disclosed round.
3. **No third-party audit.** `SECURITY.md` says plainly that automated tests are not
   an audit, which is more honest than most, and still not an audit.

What the changes do is remove the four objections that *were* arithmetic, so that
the remaining ones are the honest kind: does this team ship, and will anyone pay.

## 5. Airdrop claim: what 0.01 BNB actually costs

Registering an entry is free — a signature, not a transaction. **Claiming is not.**
The claim transaction carries a **0.01 BNB fee that the treasury keeps**, split 60%
to ecosystem development and 40% to team operations. At the BNB reference of **$742**
(27 Oct 2026) that is **$7.42 per wallet**, and unlike a deposit it is spent.

There are two reasons for it, and only one of them is about sybils:

1. **Funding.** There is no private round. Audit, testnet incentives, RPC and indexer
   costs, the node client, the sub-sites and the people building them all cost money,
   and the fee is the revenue line that pays for them before the compute market has
   any volume.
2. **Filtering.** A free claim is farmed by wallets that will never run a GPU. Money
   that does not come back is a different decision from money that does.

`models/claim.mjs` prices the whole thing, including the two designs that were
rejected, so the choice is a parameter and not a rewrite:

```bash
node models/claim.mjs              # shipped design: ratio, revenue, sybil cost
node models/claim.mjs --revenue    # what the fee raises, by claimer count
node models/claim.mjs --sybil      # cost of a farm, and where it turns profitable
node models/claim.mjs --all        # fee / deposit / gas-only side by side
```

### 5.1 A fee is a distribution price, so the allocation has to carry it

This is the part that had to change with the fee. `fee ÷ allocation` is the price at
which a claim stops making sense, and it is fixed by `perEntry` rather than by the fee:

| perEntry | Base claim | Pool slots | Fee ÷ claim @ $0.05 | Breakeven OMC price |
|---:|---:|---:|---:|---:|
| 20 OMC | 100 OMC | 1,000,000 | **148%** | $0.0742 |
| **40 OMC** | **200 OMC** | **500,000** | **74%** | **$0.0371** |
| 50 OMC | 250 OMC | 400,000 | 59% | $0.0297 |
| 100 OMC | 500 OMC | 200,000 | 30% | $0.0148 |

At 20 OMC per entry a base claim was 100 OMC — worth $5.00 at a $0.05 listing against
a $7.72 charge. The campaign would have reported a successful claim window while
nobody claimed. 40 OMC per entry is the point where the pool still covers 100,000
claimers, the honest ambition ceiling for a project with no product yet, and the fee
is 74% of a base claim rather than 148%.

The trade-off is revenue, and it should be stated rather than discovered: **one fee
per claim means bigger allocations raise less.** At 40 OMC the pool can produce at
most 1,000 BNB ($742k) if every slot is claimed; at 20 OMC it was 2,000 BNB. That is
the price of a claim people actually make.

### 5.2 What it raises

| Claimants | Fee raised (BNB) | Fee raised (USD) | Ecosystem 60% | Team 40% | runway @ $15k/mo |
|---:|---:|---:|---:|---:|---:|
| 5,000 | 50 | $37.1k | $22.3k | $14.8k | 2.5 mo |
| 10,000 | 100 | $74.2k | $44.5k | $29.7k | 4.9 mo |
| 25,000 | 250 | $185.5k | $111.3k | $74.2k | 12.4 mo |
| 50,000 | 500 | $371k | $222.6k | $148.4k | 24.7 mo |
| 100,000 | 1,000 | $742k | $445.2k | $296.8k | 49.5 mo |

The last row is also the ceiling, not a target: 500,000 entries ÷ 5 per base claim is
100,000 claim transactions, so the airdrop cannot raise more than **1,000 BNB**
however popular it becomes. It funds a build; it does not fund a company. Everything
past that has to come from the compute margin, which is why §1.2's revenue gate
matters more than the fee does.

### 5.3 The sybil question, answered in dollars

| Wallets | Sunk cost per wallet | Total burned | Pool consumed at the cap |
|---:|---:|---:|---:|
| 1,000 | $7.72 | **$7.7k** | 2% |
| 10,000 | $7.72 | **$77.2k** | 20% |
| 50,000 | $7.72 | **$385.8k** | 100% |
| 100,000 | $7.72 | **$771.7k** | 200% |

Above **$0.0193/OMC** — the fee spread over the 400 OMC a wallet can hold — farming
pays for itself, and the fee stops being a wall. That is the design, not a leak: a
farm that pays the toll is revenue, and the pool is never drained for free either
way. It is strictly stronger than the refundable deposit it replaced, because
recoverable capital is a timing cost a funded farm can rotate, while spent capital is
a budget.

### 5.4 Two things this fee is, that the docs have to say out loud

**It is a sale of tokens for consideration.** $7.42 for 200 OMC is $0.037 per token;
the cap allocation is $0.019. Whether it is called a fee or a price, a regulator and
an exchange will both characterise it as tokens issued against payment, and booking
the proceeds as revenue makes that harder to argue with. That is why nothing in the
repository or on the site says the airdrop is "100% free" any more, and why the
distribution price is published in `params.json → airdrop.claimCost.priceAnchor`
instead of being left for a reader to work out.

**It has to be disclosed before a wallet signs, not at the moment it claims.** The
rule sits on the airdrop page next to the balance, in both languages, with the split
and the amount. An undisclosed charge on a free-looking page is the pattern the page's
own anti-scam notice warns about.

### 5.5 What the claim contract has to enforce

1. `0.01 BNB` transferred to the treasury address in the claim transaction, reverting
   if the value is short — no "pay what you like" path.
2. Allocation paid **25% at claim, 75% linear over 180 days** from the claim instant.
3. Merkle root built from `airdrop_allocations` after `freeze_airdrop_allocations()`,
   so the amount a claimant is owed cannot move after 2027-01-01.
4. No owner function that can raise the fee for a claim already in flight; the fee is
   read at claim time from a parameter that is bounded in code.

`params.json → airdrop.claimCost` holds the shipped values; the two rejected designs
(`refundable-deposit`, `gas-only`) remain in `models/claim.mjs` because the next
person to reopen this question should have the arithmetic rather than the argument.

## 6. Implementation checklist

`OMCComputeMarket` — constants, so a redeploy rather than an owner transaction:

| Constant | Now | Target |
|---|---|---|
| `PROTOCOL_FEE_BPS` | 300 | 800 |
| `FEE_BURN_BPS` | 3 000 | 5 000 |
| `FEE_REWARD_BPS` | 7 000 | 2 000 (treasury) |
| *(new)* staker share | — | 3 000, distributed pro-rata to stake, not to reputation |

`OMCStaking` — owner-settable, but needs code:

- `requestUnstake()` / `withdrawStake()` with a 14-day cooldown; `unstake()` keeps its
  name but becomes the request half.
- Emission rate driven by the gate: either an `EmissionController` that reads
  `OMCComputeMarket.feeRevenue30d()` (mainnet) or a keeper calling
  `setEmissionPerSecond` monthly (testnet only, and only with public calls).
- The APR ceiling stays as a backstop, but it must no longer be the binding
  constraint — otherwise a $5M stake base silently caps emission at $1M/year and the
  schedule in `params.json` is fiction.

Airdrop claim — three changes, all in the claim contract rather than in the caps:

- 25% immediate, 75% linear over 180 days.
- A `claim()` that requires `msg.value == claimFeeBnb` (0.01 BNB) plus gas and
  forwards the fee to the treasury in the same transaction, reverting if it is short.
  There is no refund path, so there is no escrow balance to argue about — the fee is
  income on receipt, and the treasury split (60/40) is a transfer, not an accounting
  entry anyone has to trust.
- A Merkle root published before the window opens, so the allocation is auditable
  independently of this repository.

Until those ship, the deployed testnet keeps its old constants and every document
labels the live values as placeholders. `/tokenomics` reads the published targets,
not the deployed ones, and says so.
