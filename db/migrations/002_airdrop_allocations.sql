-- 002_airdrop_allocations.sql
--
-- The credit ledger behind the airdrop.
--
-- airdrop_entries (001) records events: "this wallet signed for day N". This
-- table records the resulting credit: how many OMC that wallet is owed, split
-- into its own entries and its referral bonus, with the rules version that
-- produced the number.
--
-- Why a second table rather than a view
--   1. A view recomputes; it cannot be frozen. The claim window opens on
--      2027-01-01 and the amount owed has to stop moving on that date. A
--      row with status = 'frozen' is the commitment; a view over a mutable
--      entries table is a promise to keep promising.
--   2. The accounting is the part that gets argued about. Keeping the split
--      (base vs bonus) and the per-entry rate next to the total means an
--      answer to "why do I have 120 OMC" survives even if the caps change.
--   3. It is the table a claim merkle root is built from, so it needs to be
--      a real, indexable, dumpable thing.
--
-- Relationship to staking: it is deliberately not enforced here. A tier-1
-- bond is USD 250 (contracts/params.json) and a maximum airdrop is 100 OMC,
-- so the old "free airdrop -> free stake -> free emission" loop closes on
-- price alone. A lock would add friction to an attack that no longer pays.

create table if not exists airdrop_allocations (
  address           text primary key check (address ~ '^0x[0-9a-f]{40}$'),
  base_entries      integer       not null check (base_entries >= 0),
  referral_entries  integer       not null check (referral_entries >= 0),
  total_entries     integer       not null check (total_entries = base_entries + referral_entries),
  per_entry         numeric(30,0) not null check (per_entry > 0),
  base_amount       numeric(30,0) not null check (base_amount >= 0),
  bonus_amount      numeric(30,0) not null check (bonus_amount >= 0),
  total_amount      numeric(30,0) not null check (total_amount = base_amount + bonus_amount),
  rules_version     integer       not null default 1,
  status            text          not null default 'accruing' check (status in ('accruing', 'frozen')),
  computed_at       timestamptz   not null default now(),
  frozen_at         timestamptz,
  constraint airdrop_frozen_shape check ((status = 'frozen') = (frozen_at is not null))
);

create index if not exists airdrop_allocations_status_idx on airdrop_allocations (status);
create index if not exists airdrop_allocations_amount_idx on airdrop_allocations (total_amount desc);

-- Recompute one wallet from airdrop_entries. Safe to call repeatedly: it is a
-- straight upsert, and a frozen row is left untouched so the claim amount
-- cannot move after the cutoff.
create or replace function refresh_airdrop_allocation(p_address text)
returns airdrop_allocations
language plpgsql
as $$
declare
  v_row    airdrop_allocations;
  v_base   integer := 0;
  v_bonus  integer := 0;
  v_rate   numeric(30,0) := 20;
begin
  if p_address !~ '^0x[0-9a-f]{40}$' then
    raise exception 'address must be lower-case 0x-prefixed hex (got %)', p_address
      using errcode = '22023';
  end if;

  select coalesce(count(*) filter (where source = 'wallet'), 0),
         coalesce(count(*) filter (where source = 'referral'), 0),
         coalesce(max(amount), 20)
    into v_base, v_bonus, v_rate
    from airdrop_entries
   where address = p_address;

  insert into airdrop_allocations as a (
    address, base_entries, referral_entries, total_entries,
    per_entry, base_amount, bonus_amount, total_amount, rules_version
  ) values (
    p_address, v_base, v_bonus, v_base + v_bonus,
    v_rate, v_base * v_rate, v_bonus * v_rate, (v_base + v_bonus) * v_rate, 1
  )
  on conflict (address) do update set
    base_entries     = excluded.base_entries,
    referral_entries = excluded.referral_entries,
    total_entries    = excluded.total_entries,
    per_entry        = excluded.per_entry,
    base_amount      = excluded.base_amount,
    bonus_amount     = excluded.bonus_amount,
    total_amount     = excluded.total_amount,
    computed_at      = now()
  where a.status = 'accruing';

  select * into v_row from airdrop_allocations where address = p_address;
  return v_row;
end;
$$;

-- Close the books. Run once, at or just before the claim window opens.
-- Returns the number of rows frozen; re-running is a no-op for rows already
-- frozen.
create or replace function freeze_airdrop_allocations()
returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  update airdrop_allocations
     set status = 'frozen', frozen_at = now()
   where status = 'accruing';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Totals for the public progress ticker: rows and OMC owed so far.
create or replace view airdrop_totals as
select
  count(*)              as wallets,
  coalesce(sum(total_entries), 0)  as entries,
  coalesce(sum(total_amount), 0)   as amount,
  count(*) filter (where status = 'frozen') > 0 as is_frozen
from airdrop_allocations;
