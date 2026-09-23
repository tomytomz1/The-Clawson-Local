-- Phase 3: minimal abuse guard for checkout holds.
--
-- Rules (enforced inside reserve_category, under the same campaign row lock
-- that already serializes every hold decision, plus per-client and per-IP
-- advisory locks, so concurrent requests cannot race past them):
--   1. A browser (client_hash) may own at most ONE active hold (HELD or
--      PROCESSING, not yet expired). PAID / EXPIRED / RELEASED / FAILED /
--      REFUND_REQUIRED reservations do not count.
--   2. An IP fingerprint (ip_hash) may create at most p_ip_limit NEW holds
--      (default 3) in a rolling p_ip_window_minutes window (default 60).
--
-- Only HMAC-SHA256 hex digests are stored, computed by the server with a
-- dedicated secret (HOLD_ABUSE_SECRET). The raw browser token and the raw IP
-- address never reach the database. Digests are cleared after one day.
--
-- Both parameters are optional at the SQL level so the service role can still
-- create holds for administrative purposes; the web checkout endpoint always
-- supplies them and refuses to run without its secret.

alter table public.reservations
  add column client_hash text check (client_hash ~ '^[0-9a-f]{64}$'),
  add column ip_hash text check (ip_hash ~ '^[0-9a-f]{64}$');

-- Only the two enforcement queries need indexes.
create index reservations_client_active on public.reservations (client_hash)
  where client_hash is not null and status in ('HELD', 'PROCESSING');
create index reservations_ip_recent on public.reservations (ip_hash, created_at)
  where ip_hash is not null;

drop function public.reserve_category(uuid, uuid, integer);

-- Same contract as before (see 20260924000000_checkout.sql), plus the guard.
-- Additional errors:
--   client_has_active_hold
--   rate_limited:<seconds until the oldest counted hold leaves the window>
create function public.reserve_category(
  p_campaign_id uuid,
  p_category_id uuid,
  p_hold_minutes integer default 35,
  p_client_hash text default null,
  p_ip_hash text default null,
  p_ip_limit integer default 3,
  p_ip_window_minutes integer default 60
)
returns table (
  reservation_id uuid,
  expires_at timestamptz,
  amount_cents integer,
  currency text,
  conflict_key text,
  category_slug text,
  category_name text,
  campaign_name text
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_campaign public.campaigns%rowtype;
  v_category public.categories%rowtype;
  v_row public.campaign_categories%rowtype;
  v_sold integer;
  v_holds integer;
  v_recent integer;
  v_oldest timestamptz;
  v_res public.reservations%rowtype;
begin
  if p_hold_minutes not between 1 and 240 then
    raise exception 'invalid_hold_minutes' using errcode = 'P0001';
  end if;
  if p_ip_limit < 1 or p_ip_window_minutes < 1 then
    raise exception 'invalid_rate_limit' using errcode = 'P0001';
  end if;

  -- 1. Serialize every inventory decision for this campaign.
  select * into v_campaign from public.campaigns where id = p_campaign_id for update;
  if not found then
    raise exception 'campaign_not_found' using errcode = 'P0001';
  end if;
  -- Also serialize per browser and per IP across campaigns (taken after the
  -- campaign lock by every caller, so the lock order is always the same).
  if p_client_hash is not null then
    perform pg_advisory_xact_lock(hashtextextended('hold-client:' || p_client_hash, 0));
  end if;
  if p_ip_hash is not null then
    perform pg_advisory_xact_lock(hashtextextended('hold-ip:' || p_ip_hash, 0));
  end if;

  -- 2. Campaign must be selling.
  if v_campaign.status <> 'OPEN' then
    raise exception 'campaign_not_open' using errcode = 'P0001';
  end if;

  -- 3. Category must be active.
  select * into v_category from public.categories where id = p_category_id and active;
  if not found then
    raise exception 'category_not_found' using errcode = 'P0001';
  end if;

  -- 4. Drop expired holds before judging anything.
  perform public.release_expired_holds(p_campaign_id);

  -- Abuse guard 1: one active hold per browser.
  if p_client_hash is not null and exists (
    select 1 from public.reservations r
     where r.client_hash = p_client_hash
       and r.status in ('HELD', 'PROCESSING')
       and r.expires_at > now()
  ) then
    raise exception 'client_has_active_hold' using errcode = 'P0001';
  end if;

  -- Abuse guard 2: at most p_ip_limit new holds per IP per rolling window.
  if p_ip_hash is not null then
    select count(*), min(r.created_at) into v_recent, v_oldest
      from public.reservations r
     where r.ip_hash = p_ip_hash
       and r.created_at > now() - make_interval(mins => p_ip_window_minutes);
    if v_recent >= p_ip_limit then
      raise exception 'rate_limited:%',
        greatest(1, ceil(extract(epoch from (v_oldest + make_interval(mins => p_ip_window_minutes) - now())))::integer)
        using errcode = 'P0001';
    end if;
  end if;

  select * into v_row from public.campaign_categories
   where campaign_id = p_campaign_id and category_id = p_category_id
   for update;
  if not found then
    raise exception 'category_not_found' using errcode = 'P0001';
  end if;
  if v_row.manually_closed or v_row.status = 'CLOSED' then
    raise exception 'category_closed' using errcode = 'P0001';
  end if;

  -- 5. No sale in the conflict group.
  if exists (
    select 1 from public.campaign_categories
     where campaign_id = p_campaign_id and conflict_key = v_category.conflict_key and status = 'SOLD'
  ) then
    raise exception 'category_sold' using errcode = 'P0001';
  end if;

  -- 6. No live hold in the conflict group.
  if exists (
    select 1 from public.campaign_categories
     where campaign_id = p_campaign_id and conflict_key = v_category.conflict_key
       and status = 'HELD' and hold_expires_at > now()
  ) then
    raise exception 'category_held' using errcode = 'P0001';
  end if;

  -- 7. Capacity: paid advertisers plus live holds must stay under the maximum.
  select count(*) filter (where status = 'SOLD'),
         count(*) filter (where status = 'HELD' and hold_expires_at > now())
    into v_sold, v_holds
    from public.campaign_categories
   where campaign_id = p_campaign_id;
  if v_sold + v_holds >= v_campaign.max_advertisers then
    raise exception 'campaign_full' using errcode = 'P0001';
  end if;

  -- Data minimization: abuse digests are only needed for about an hour.
  update public.reservations
     set client_hash = null, ip_hash = null
   where campaign_id = p_campaign_id
     and created_at < now() - interval '1 day'
     and (client_hash is not null or ip_hash is not null);

  -- 8. Create the reservation at the campaign's price.
  insert into public.reservations (campaign_id, category_id, conflict_key, amount_cents, currency, expires_at,
                                   client_hash, ip_hash)
  values (p_campaign_id, p_category_id, v_category.conflict_key, v_campaign.price_cents, 'usd',
          now() + make_interval(mins => p_hold_minutes), p_client_hash, p_ip_hash)
  returning * into v_res;

  -- 9-10. Hold the inventory row for this reservation.
  update public.campaign_categories
     set status = 'HELD', hold_expires_at = v_res.expires_at, reservation_id = v_res.id,
         advertiser_id = null, sold_at = null
   where id = v_row.id;

  -- 11.
  return query select v_res.id, v_res.expires_at, v_res.amount_cents, v_res.currency, v_res.conflict_key,
                      v_category.slug, v_category.display_name, v_campaign.name;
end;
$$;

-- The browser's current active hold, so a double-click or retry can be sent
-- back to its existing Checkout Session instead of creating another hold.
create function public.client_active_reservation(p_client_hash text)
returns table (
  reservation_id uuid,
  category_slug text,
  checkout_url text,
  session_expires_at timestamptz,
  expires_at timestamptz
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select r.id, c.slug, r.stripe_checkout_url, r.stripe_session_expires_at, r.expires_at
    from public.reservations r
    join public.categories c on c.id = r.category_id
   where r.client_hash = p_client_hash
     and r.status in ('HELD', 'PROCESSING')
     and r.expires_at > now()
   order by r.created_at desc
   limit 1;
$$;

revoke execute on function public.reserve_category(uuid, uuid, integer, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.reserve_category(uuid, uuid, integer, text, text, integer, integer) to service_role;
revoke execute on function public.client_active_reservation(text) from public, anon, authenticated;
grant execute on function public.client_active_reservation(text) to service_role;
