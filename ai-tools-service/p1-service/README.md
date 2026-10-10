# OMC AI Tools · P1 service layer

The two long-running processes that make the on-chain paid path real.

## Why these exist at all

`OMCComputeMarket` marks five functions `onlyScheduler`:

```
assign  confirmDelivery  settle  fail  resolveDispute
```

A browser can never call them, because the scheduler key must not live in a
page. That single constraint is what forces a server process to exist. The page
can only `createJob`, `cancelJob` and `dispute`; everything that moves a job
forward is done here.

## The processes

| File | Role | Key it holds |
|---|---|---|
| `scheduler.js` | watches ESCROWED/ASSIGNED jobs, assigns and settles | **deployer key (scheduler)** |
| `node-worker.js` | the staked GPU node: heartbeats, computes, reports result hash | node key (`omc-node-key.env`) |
| `bootstrap-node.js` | funds → stakes → `registerNode()` a node this machine holds the key for | node key + funder |
| `chain.js` | shared addresses, ABIs, RPC, job decoding | — |
| `store.js` | the out-of-band image channel | — |
| `liveness.js` | who is actually *running* a worker, not just who is eligible | — |
| `provider-select.js` | the one picker both the scheduler and the rehearsal use | — |
| `e2e-rehearsal.js` | runs one job all the way through, on testnet | both |
| `offline-wiring-check.js` | proves the wiring without spending gas | — |

## The out-of-band channel, and why the hash matters

An EVM cannot store a megabyte of pixels, so the image bytes travel through an
ordinary file channel and the chain carries only their `keccak256`:

```
requester:  imageHash = keccak256(bytes)
            specHash  = keccak256("omc-ai-tools/spec/v1|" + imageHash + "|" + tier + "|" + policy + "|" + protection)
node:       reads bytes, runs Real-ESRGAN, resultHash = keccak256(resultBytes)
requester:  downloads the result and checks it hashes to resultHash
```

That binding is the only reason the off-chain hop is trustworthy. No trust in
the transport is required — only in keccak256. `store.verifyResult()` is the
check, and the scheduler refuses to `settle()` a delivery whose bytes do not
match the committed digest; it calls `fail(BAD_OUTPUT)` instead, which slashes
the provider.

`specHash` folds the tier and policies in with the image so that two jobs on
the same picture at different tiers cannot collide onto one commitment.

## Who gets the next job

`isEligible()` is necessary but not sufficient: a node stays eligible while its
heartbeat is fresh even if its operator stopped the process. Handing a job to
that node does not fail — it parks in ASSIGNED until the deadline, then refunds.
Every log line stays green while every job times out.

So selection is two questions, asked in order:

```
1. isEligible(addr, tier)          the contract's answer: stake, tier, overdue
2. liveness.isLive(addr)           is anything actually running there
   -> pick the least-loaded live node
   -> if nobody is live, do NOT assign; leave the job ESCROWED (cancellable)
```

`node-worker.js` announces itself on every sweep and withdraws the record on
exit, so `--once` cleans up after itself. Records live in
`.p1-jobs/workers.json` with a 90s TTL, refreshed every 20s; a killed process
is therefore treated as dead within a minute and a half. Workers on other hosts
cannot share that file — list them in `OMC_LIVE_NODES` (comma separated).

`--assign-anyway` restores the old behaviour for demos, and logs a warning when
it does. Jobs are always left cancellable rather than committed to a dead node.

## Running
```bash
cd omc-ai-tools

# read-only report (no writes, no gas)
node p1-service/scheduler.js --status

# one sweep, then exit
node p1-service/scheduler.js --once

# continuous — start the worker FIRST: the scheduler will not assign to a node
# that has not announced itself
node p1-service/node-worker.js
node p1-service/scheduler.js

# ignore liveness (demos only — it logs a warning)
node p1-service/scheduler.js --assign-anyway

# prove the wiring without spending gas
node p1-service/offline-wiring-check.js

# the real thing: one job end to end on BSC testnet
node p1-service/e2e-rehearsal.js --image testdata/sample.png --price 5
node p1-service/e2e-rehearsal.js --no-infer      # chain plumbing only
```

Requires `NODE_PATH` pointing at the managed node modules so `ethers` resolves:

```bash
NODE_PATH="C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules" \
  node p1-service/scheduler.js --status
```

## Keys

| Key | Where | Purpose |
|---|---|---|
| scheduler (deployer) | `~/.workbuddy/omc-secrets.env` → `OMC_TESTNET_DEPLOYER_PRIVATE_KEY` | assign / confirmDelivery / settle |
| node (`0x1402a793…f9e6`) | `~/.workbuddy/omc-node-key.env` → `OMC_NODE_PRIVATE_KEY` | `staking.heartbeat()` |

The node and the scheduler are **different wallets**, and that is deliberate:
the key that decides outcomes must not be the key that does the work.

## The heartbeat trap

`isEligible()` folds in `!overdue`, and overdue is driven by
`heartbeatInterval (1800s) + heartbeatGrace (600s)`. Miss the 40-minute window
and the node is silently unassignable — `assign()` reverts with
`OMCM: provider not eligible` and every job sits in ESCROWED forever.

`node-worker.js` self-heals this every 20 minutes when it can find a key.
`scheduler.js` cannot fix it (wrong key) but shouts about it on every sweep so
the failure is never silent.

## Verified on testnet

`offline-wiring-check.js` — **57/57**, including:

- the **shipping page's** hand-written keccak256 matches `ethers` on all
  fixtures, including the 135- and 271-byte rate boundaries
- a single flipped byte in a result breaks verification
- the settlement split matches the contract: 3% fee, 10% OMC discount,
  30% burn / 70% rewards
- `assign` from a non-scheduler key is rejected
- liveness: TTL expiry, case-insensitivity, `forget`, `OMC_LIVE_NODES` and the
  4x-TTL prune all behave as the scheduler assumes
- the picker **refuses** to assign with no live worker, prefers a live node over
  a lighter offline one, and still exposes the per-node reason

Driven end to end on BSC testnet by `scheduler.js` + a long-running
`node-worker.js` (not just the rehearsal harness): `jobCount 0 -> 2`,
both `SETTLED`, `escrowedNow = 0`, `settledVolume = 10.0`, provider stake
unslashed. See `../README.md` for the current status.
