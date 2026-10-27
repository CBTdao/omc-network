# Airdrop ledger

The airdrop page used to keep a participant's entries in `localStorage` only.
That meant the entries disappeared when a browser was cleared, could not be
resumed on a second device, and could not be audited at claim time — the page
was effectively a preview dressed up as a registration.

Entries are now written to Postgres against the wallet that signed for them.

```
db/
├── migrations/001_airdrop_entries.sql   schema
└── tests/airdrop.test.mjs               9 tests, run against a real Postgres (PGlite)
```

## Setup

Two steps, and only the first one needs a human.

1. **Create a Postgres database.** Neon, Vercel Postgres, Supabase and Railway
   all have a free tier. In the Vercel dashboard, `Storage` → `Create Database`
   → Neon also injects `DATABASE_URL` into the project for you, which removes
   step 2 entirely.
2. **Set `DATABASE_URL`** on the Vercel project (`website/` is the project root)
   and redeploy.

The schema then applies itself: the first request to `/api/airdrop/*` runs any
pending migration from `website/api/_lib/schema.generated.js`, under a session
advisory lock, and records it in `schema_migrations`. Nobody has to run `psql`
against a connection string, which matters because that is the step a
one-maintainer project forgets, and its failure mode — an API that answers 200
with an opaque SQL error — is worse than a few hundred milliseconds of DDL on
the first cold start.

| Variable | Required | Meaning |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string (`POSTGRES_URL` is also read) |
| `AIRDROP_IP_SALT` | no | Salt for the IP hash; defaults to a fixed string |
| `PGSSL=disable` | no | Turns TLS off for a local database |

Until `DATABASE_URL` is set the API answers `503 UNAVAILABLE`, the page detects
it on load and stays in its browser-local preview mode — it never claims an
entry was recorded when it was not.

### Running migrations by hand

The CLI is still there for local work and for a database you have already
connected to. It reads the same `schema_migrations` table as the API, so the two
never disagree:

```bash
DATABASE_URL="postgres://..." node db/scripts/migrate.mjs          # apply
DATABASE_URL="postgres://..." node db/scripts/migrate.mjs --plan   # list only
```

After adding a migration, regenerate the embedded copy — a test fails if you
forget:

```bash
node db/scripts/embed-schema.mjs
```

(`psql -f` on individual files still works, but it will not record what has
run, and a later migration will be silently missed.)

## Schema

`airdrop_entries` — one row per entry, `amount` is OMC credited (20 today).

| Column | Notes |
|---|---|
| `address` | lower-case 0x address, CHECK-constrained to 20-byte hex |
| `day_key` | the UTC+8 calendar day the entry belongs to |
| `source` | `wallet` (own entry, max 5) or `referral` (inviter bonus, max 5) |
| `referrer` | inviter address, only on `referral` rows |
| `ref_code` | the participant's `OMC-XXXXXXXX` invite code, stored so a code can be resolved to a wallet later |
| `message`, `signature` | the signed text and its signature, kept for audit |
| `ip_hash` | salted SHA-256 of the client IP — spot multi-wallet farming, not keep a visitor's address |

Two partial unique indexes make duplicates physically impossible:
one own-entry per `(address, day_key)`, and one `(address, referrer)` per invite.

Caps (5 + 5) are enforced in `website/api/_lib/store.js` inside a
`pg_advisory_xact_lock(hashtext(address))` transaction, so two tabs clicking at
the same instant cannot both pass the daily check. The indexes are the backstop.

### 002 — the credit ledger

`airdrop_entries` records events. `airdrop_allocations` records money owed: per
wallet, own entries and referral bonus, the per-entry rate that produced the
total, and a status.

- `refresh_airdrop_allocation(address)` — upsert one wallet's credit row from
  its events. Called inside the registration transaction, so an entry can never
  commit without its credit row.
- `freeze_airdrop_allocations()` — run once at the claim cutoff. Sets
  `status = 'frozen'` and stamps `frozen_at`; from then on refresh leaves the
  amount alone even as new entries arrive. Idempotent.
- `airdrop_totals` — wallets, entries and OMC owed, for the public ticker.

Why a second table instead of a view: a view cannot be frozen, and the claim
amount has to stop moving on 2027-01-01. Frozen means committed; a view over a
live table is a promise to keep promising.

The database enforces the arithmetic, not just the API:
`total_amount = base_amount + bonus_amount` and
`total_entries = base_entries + referral_entries` are CHECK constraints.

## API

`GET /api/airdrop/summary` → service status + caps.
`GET /api/airdrop/summary?address=0x…` → that wallet's entries.
`POST /api/airdrop/entry` → `{ address, message, signature, referrer?, code? }`.

The server rebuilds the canonical message from the parsed fields and requires an
exact match, then recovers the signer with `verifyMessage` and requires it to
equal the claimed address. The message carries the UTC+8 day, so a signature
harvested today cannot register an entry tomorrow (`STALE_MESSAGE`).

Response codes: `OK`, `LIMIT_DAILY`, `LIMIT_TOTAL`, `STALE_MESSAGE`,
`BAD_SIGNATURE`, `BAD_MESSAGE`, `BAD_REQUEST`, `UNAVAILABLE`, `SERVER_ERROR`.

## Tests

```bash
cd db && npm install && npm test
```

The tests execute the real migration against [PGlite](https://pglite.dev), a
Postgres compiled to WASM, so the CHECK constraints, partial unique indexes and
advisory locks are exercised for real rather than mocked.

## Not done yet

- The three "follow the socials" tasks are still verified in the browser only;
  the server has no way to confirm a retweet, so it does not try to pretend it
  can. Sybil review still needs a human pass before the claim window opens.
- `referral` rows are only created when an invite arrives as a wallet address
  (`?ref=0x…`). The site's short-code invites (`?ref=OMC-XXXXXXXX`) are stored
  in `ref_code` and can be attributed later by joining codes to addresses.
