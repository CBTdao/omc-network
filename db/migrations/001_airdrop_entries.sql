-- 001_airdrop_entries.sql
--
-- Server-side ledger for the OMC community airdrop.
--
-- Why this exists: the airdrop page used to accumulate entries in
-- localStorage only. That meant a wallet's entries vanished when the browser
-- was cleared, could not be resumed on another device, and could not be
-- audited at claim time. Entries are now recorded against the signing wallet.
--
-- Conventions
--   address   lower-case 0x-prefixed, 20-byte hex
--   day_key   the UTC+8 calendar day the entry belongs to, so the "1 entry
--             per day" rule survives timezone changes and DST-free arithmetic
--   source    'wallet'   the participant's own entry (max 5 per wallet)
--             'referral' the bonus credited to an inviter (max 5 per wallet)
--   amount    OMC credited by that row, fixed at 20 today
--
-- Caps are enforced in the API inside a per-address advisory lock; the unique
-- indexes below are the backstop that makes a duplicate physically impossible.

create table if not exists airdrop_entries (
  id          bigserial primary key,
  address     text          not null check (address ~ '^0x[0-9a-f]{40}$'),
  day_key     date          not null,
  amount      numeric(30,0) not null default 20 check (amount > 0),
  source      text          not null default 'wallet' check (source in ('wallet', 'referral')),
  referrer    text          check (referrer is null or referrer ~ '^0x[0-9a-f]{40}$'),
  ref_code    text          check (ref_code is null or ref_code ~ '^OMC-[A-Z0-9]{8}$'),
  message     text          not null,
  signature   text          not null,
  ip_hash     text,
  created_at  timestamptz   not null default now(),
  constraint airdrop_referral_shape check ((source = 'referral') = (referrer is not null))
);

-- One own-entry per wallet per UTC+8 day.
create unique index if not exists airdrop_one_entry_per_day
  on airdrop_entries (address, day_key)
  where source = 'wallet';

-- A given invitee can only ever credit the same inviter once.
create unique index if not exists airdrop_referral_pair_once
  on airdrop_entries (address, referrer)
  where source = 'referral';

create index if not exists airdrop_address_idx on airdrop_entries (address);
create index if not exists airdrop_day_idx on airdrop_entries (day_key);

-- Per-wallet view used by the API when reporting accumulated status.
create or replace view airdrop_wallet_status as
select
  address,
  count(*) filter (where source = 'wallet')                as base_entries,
  count(*) filter (where source = 'referral')              as referral_entries,
  count(*)                                                 as total_entries,
  coalesce(sum(amount), 0)                                 as total_amount,
  max(day_key)                                             as last_day
from airdrop_entries
group by address;
