-- 003_airdrop_per_entry_40.sql
--
-- perEntry moves from 20 to 40 OMC.
--
-- Why
--   The claim fee is 0.01 BNB and it is not refundable (contracts/params.json
--   airdrop.claimCost). At 20 OMC per entry a base claim was 100 OMC, which is
--   worth $5.00 at a $0.05 listing — less than the $7.42 fee. A claim that
--   costs more than it pays does not get made, so the pool would have stayed
--   full while the campaign reported a successful launch. At 40 OMC the base
--   claim is 200 OMC and the fee is 74% of it rather than 148%; the pool still
--   covers 100,000 claimers, which is the honest ceiling for this project.
--
-- Why a migration rather than editing 002
--   002 is already recorded in schema_migrations on the deployed database, so an
--   edit to it would never run. The default rate inside the function has to be
--   replaced in place, and rows computed at the old rate have to be recomputed
--   while they are still accruing.
--
-- Freezing still wins: a row with status = 'frozen' is never touched, so this
-- migration cannot change an amount that has already been committed to a claim.

create or replace function refresh_airdrop_allocation(p_address text)
returns airdrop_allocations
language plpgsql
as $$
declare
  v_row    airdrop_allocations;
  v_base   integer := 0;
  v_bonus  integer := 0;
  v_rate   numeric(30,0) := 40;
begin
  if p_address !~ '^0x[0-9a-f]{40}$' then
    raise exception 'address must be lower-case 0x-prefixed hex (got %)', p_address
      using errcode = '22023';
  end if;

  /* The rate comes from the entries themselves — each entry stores the amount it
     was promised — so the default below only applies to a wallet with no entries
     at all. */
  select coalesce(count(*) filter (where source = 'wallet'), 0),
         coalesce(count(*) filter (where source = 'referral'), 0),
         coalesce(max(amount), 40)
    into v_base, v_bonus, v_rate
    from airdrop_entries
   where address = p_address;

  insert into airdrop_allocations as a (
    address, base_entries, referral_entries, total_entries,
    per_entry, base_amount, bonus_amount, total_amount, rules_version
  ) values (
    p_address, v_base, v_bonus, v_base + v_bonus,
    v_rate, v_base * v_rate, v_bonus * v_rate, (v_base + v_bonus) * v_rate, 2
  )
  on conflict (address) do update set
    base_entries     = excluded.base_entries,
    referral_entries = excluded.referral_entries,
    total_entries    = excluded.total_entries,
    per_entry        = excluded.per_entry,
    base_amount      = excluded.base_amount,
    bonus_amount     = excluded.bonus_amount,
    total_amount     = excluded.total_amount,
    rules_version    = excluded.rules_version,
    computed_at      = now()
  where a.status = 'accruing';

  select * into v_row from airdrop_allocations where address = p_address;
  return v_row;
end;
$$;

-- Each entry stores the rate it was promised, so the function reads the rate back
-- from the entries rather than assuming the default. That is what makes the
-- upgrade below safe to run against a wallet that registered at the old rate.

-- Upgrade entries written at the old rate. The campaign has not launched, so this
-- is normally a no-op; it exists so a database seeded during testing does not
-- carry two different promises into the same claim window. Entries are re-rated
-- upward only — nobody's balance falls because of this migration — and the
-- allocation rows are then recomputed from the entries that back them.
update airdrop_entries set amount = 40 where amount = 20;

do $$
declare
  r record;
begin
  for r in select distinct address from airdrop_entries loop
    perform refresh_airdrop_allocation(r.address);
  end loop;
end;
$$;
