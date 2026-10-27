-- 004_airdrop_per_entry_20.sql
--
-- perEntry returns from 40 to 20 OMC: 1,000,000 slots instead of 500,000.
--
-- Why
--   003 raised the payload to 40 because a 100 OMC base claim ($5.00 at a $0.05
--   listing) was smaller than the 0.01 BNB fee. That reasoning treated the fee as
--   a purchase price, which is not what it is. The fee is a flat entrance charge
--   per entry (contracts/params.json airdrop.claimCost.chargePer = "entry"): it is
--   not indexed to the token price, so a smaller allocation does not make the
--   charge unpayable — it makes the campaign reach twice as many wallets with the
--   same 2% of supply.
--
--   The pool is also meant to be spread thin. 40 OMC per entry concentrates 2% of
--   supply into 500,000 slots; 20 OMC into 1,000,000. First come, first served, so
--   the per-wallet cap of 10 entries reserves nothing.
--
-- Why a migration rather than editing 003
--   003 is recorded in schema_migrations on the deployed database, so an edit to
--   it would never run. The default rate inside the function has to be replaced in
--   place, and rows written at the 40 OMC rate have to be re-rated.
--
-- On re-rating downward
--   003 only ever raised a balance. This migration lowers one, which is normally
--   the thing a migration must never do. It is safe here for a specific reason:
--   the claim window opens on 2027-01-01 and nothing has been claimed, so no
--   amount has been promised to anyone in exchange for anything. The rule changed
--   before the campaign opened, so the whole pool is re-rated together rather than
--   leaving two promises in one ledger. `status = 'frozen'` rows are still never
--   touched — freeze happens at claim, and after this migration any new freeze
--   records the 20 OMC rate.

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

  /* The rate comes from the entries themselves — each entry stores the amount it
     was promised — so the default below only applies to a wallet with no entries
     at all. */
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
    v_rate, v_base * v_rate, v_bonus * v_rate, (v_base + v_bonus) * v_rate, 3
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

-- Re-rate every entry to 20 OMC, whatever rate it was written at, then rebuild
-- the allocation rows from those entries. The campaign has not opened, so this
-- re-rates promises that were never redeemable.
update airdrop_entries set amount = 20 where amount <> 20;

do $$
declare
  r record;
begin
  for r in select distinct address from airdrop_entries loop
    perform refresh_airdrop_allocation(r.address);
  end loop;
end;
$$;
