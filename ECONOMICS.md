# OMC economic model

Every number in this document is produced by [`models/economics.mjs`](models/economics.mjs)
and checked by [`models/economics.test.mjs`](models/economics.test.mjs) plus
[`scripts/params.test.mjs`](scripts/params.test.mjs). Nothing here is a forecast:
the GMV paths are scenarios, and running the model prints the same tables.

```bash
node models/economics.mjs                    # both designs, three scenarios
node models/economics.mjs --breakeven        # GMV needed for net-zero, by price
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

Old design — never deflationary, peaks at 39.9% annual inflation:

| Yr | GMV | Fee (OMC) | Burn | Emission | Net | Circulating | Inflation | Burn÷Emit |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | $150k | 0.23M | 0.07M | 15.00M | +14.93M | 80.43M | 22.8% | 0% |
| 3 | $2.50M | 3.75M | 1.13M | 45.00M | +43.88M | 153.95M | 39.9% | 3% |
| 5 | $12.00M | 18.00M | 5.40M | 60.00M | +54.60M | 255.85M | 27.1% | 9% |
| 10 | $30.00M | 45.00M | 13.50M | 60.00M | +46.50M | 500.50M | 10.2% | 23% |

New design — peaks at 14.7%, flat by year 6, deflationary by year 9:

| Yr | GMV | Fee (OMC) | Burn | Emission | Net | Circulating | Inflation | Burn÷Emit |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | $150k | 0.60M | 0.30M | 1.80M | +1.50M | 67.00M | 2.3% | 17% |
| 3 | $2.50M | 10.00M | 5.00M | 15.00M | +10.00M | 81.80M | 13.9% | 33% |
| 5 | $12.00M | 48.00M | 24.00M | 36.00M | +12.00M | 105.80M | 12.8% | 67% |
| 6 | $18.00M | 72.00M | 36.00M | 36.00M | **0** | 105.80M | **0.0%** | 100% |
| 9 | $28.00M | 112.00M | 56.00M | 50.00M | −6.00M | 99.80M | −5.7% | 112% |

Same GMV, same decade: **500M circulating vs 90-106M**, and the point at which
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

## 5. Implementation checklist

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

Airdrop claim — split into 25% immediate and 75% vested over 180 days, which is a
change to the claim contract, not to the caps.

Until those ship, the deployed testnet keeps its old constants and every document
labels the live values as placeholders. `/tokenomics` reads the published targets,
not the deployed ones, and says so.
