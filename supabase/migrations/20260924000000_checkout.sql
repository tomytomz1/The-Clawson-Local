-- Phase 3: Stripe Checkout with atomic category reservations.
--
-- Design notes
-- * Every write that decides who owns a category (reserve, attach a Checkout
--   Session, release, fulfill) runs in one of the functions below and locks
--   the campaign row FIRST. That single lock serializes all inventory
--   decisions for a campaign, so capacity checks (SOLD + active holds) cannot
--   race. Lock order everywhere: campaign -> reservation -> inventory row.
-- * The Phase 2 partial unique index (one HELD/SOLD claim per conflict key)
--   and the Phase 2 cap trigger (max paid advertisers, SOLD_OUT flip) stay the
--   final backstops; nothing here duplicates them.
-- * The Stripe webhook is the only path to PAID/SOLD. Browser redirects never
--   change state.
-- * These tables are internal: RLS on, no policies, no grants to anon or
--   authenticated. The functions are SECURITY INVOKER and executable only by
--   service_role (the server).

-- ---------------------------------------------------------------- types

create type public.reservation_status as enum (
  'HELD',            -- category held while the buyer is in Stripe Checkout
  'PROCESSING',      -- Checkout completed, delayed payment method still settling
  'PAID',            -- webhook verified payment; category SOLD
  'EXPIRED',         -- hold ran out / Checkout Session expired
  'RELEASED',        -- released early (Checkout creation failed, buyer released it)
  'FAILED',          -- delayed payment failed
  'REFUND_REQUIRED'  -- paid, but the category could not be granted (manual refund)
);

-- ---------------------------------------------------------------- advertisers

-- Minimal record created only after a verified payment. Intake fields arrive
-- in a later phase.
create table public.advertisers (
  id uuid primary key default gen_random_uuid(),
  business_name text not null check (length(business_name) between 1 and 200),
  contact_email text not null check (contact_email ~ '^[^@\s]+@[^@\s]+$'),
  stripe_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger advertisers_updated_at before update on public.advertisers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- reservations

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete restrict,
  category_id uuid not null references public.categories (id) on delete restrict,
  conflict_key text not null,
  status public.reservation_status not null default 'HELD',
  -- Copied from the campaign at reservation time; the browser never sets it.
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'usd' check (currency ~ '^[a-z]{3}$'),
  -- When the hold on the category ends (Checkout Session expiry + grace).
  expires_at timestamptz not null,
  stripe_checkout_session_id text unique,
  stripe_checkout_url text,
  stripe_session_expires_at timestamptz,
  stripe_payment_intent_id text unique,
  stripe_customer_id text,
  customer_email text,
  business_name text,
  terms_accepted boolean not null default false,
  terms_accepted_at timestamptz,
  terms_version text,
  advertiser_id uuid references public.advertisers (id) on delete restrict,
  failure_reason text,
  paid_at timestamptz,
  expired_at timestamptz,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint paid_is_complete check (
    status <> 'PAID'
    or (paid_at is not null and advertiser_id is not null and stripe_checkout_session_id is not null)
  )
);

-- Backstops mirroring the inventory rules.
create unique index reservations_one_live_per_conflict
  on public.reservations (campaign_id, conflict_key)
  where status in ('HELD', 'PROCESSING');
create unique index reservations_one_paid_per_conflict
  on public.reservations (campaign_id, conflict_key)
  where status = 'PAID';
create index reservations_campaign_status on public.reservations (campaign_id, status, expires_at);
create index reservations_category on public.reservations (category_id);
create index reservations_advertiser on public.reservations (advertiser_id);

create trigger reservations_updated_at before update on public.reservations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- webhook idempotency

-- One row per Stripe event id. No payloads are stored (they contain customer
-- data); only what is needed to de-duplicate and debug.
create table public.stripe_webhook_events (
  event_id text primary key,
  type text not null,
  livemode boolean not null default false,
  status text not null default 'processing' check (status in ('processing', 'processed', 'ignored', 'failed')),
  attempts integer not null default 1,
  reservation_id uuid references public.reservations (id) on delete set null,
  error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index stripe_webhook_events_reservation on public.stripe_webhook_events (reservation_id);

-- ---------------------------------------------------------------- real foreign keys on inventory

alter table public.campaign_categories
  add constraint campaign_categories_reservation_fk
    foreign key (reservation_id) references public.reservations (id) on delete set null,
  add constraint campaign_categories_advertiser_fk
    foreign key (advertiser_id) references public.advertisers (id) on delete restrict;

create index campaign_categories_reservation on public.campaign_categories (reservation_id);
create index campaign_categories_advertiser on public.campaign_categories (advertiser_id);

-- ---------------------------------------------------------------- helpers

-- Release raw HELD inventory rows and HELD reservations whose hold has run out.
-- Callers must already hold the campaign row lock.
create or replace function public.release_expired_holds(p_campaign_id uuid)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  update public.campaign_categories
     set status = 'AVAILABLE', hold_expires_at = null, reservation_id = null
   where campaign_id = p_campaign_id
     and status = 'HELD'
     and (hold_expires_at is null or hold_expires_at <= now());
  get diagnostics v_count = row_count;

  update public.reservations
     set status = 'EXPIRED', expired_at = now(), failure_reason = coalesce(failure_reason, 'hold expired')
   where campaign_id = p_campaign_id
     and status in ('HELD', 'PROCESSING')
     and expires_at <= now();

  return v_count;
end;
$$;

-- ---------------------------------------------------------------- reserve

-- Atomically hold one category for checkout. Raises with one of these
-- messages when the category cannot be held:
--   campaign_not_found, campaign_not_open, category_not_found,
--   category_closed, category_sold, category_held, campaign_full
create or replace function public.reserve_category(
  p_campaign_id uuid,
  p_category_id uuid,
  p_hold_minutes integer default 35
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
  v_res public.reservations%rowtype;
begin
  if p_hold_minutes not between 1 and 240 then
    raise exception 'invalid_hold_minutes' using errcode = 'P0001';
  end if;

  -- 1. Serialize every inventory decision for this campaign.
  select * into v_campaign from public.campaigns where id = p_campaign_id for update;
  if not found then
    raise exception 'campaign_not_found' using errcode = 'P0001';
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

  -- 4. Drop expired holds before judging availability.
  perform public.release_expired_holds(p_campaign_id);

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

  -- 8. Create the reservation at the campaign's price.
  insert into public.reservations (campaign_id, category_id, conflict_key, amount_cents, currency, expires_at)
  values (p_campaign_id, p_category_id, v_category.conflict_key, v_campaign.price_cents, 'usd',
          now() + make_interval(mins => p_hold_minutes))
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

-- ---------------------------------------------------------------- attach Checkout Session

-- Record the Stripe Checkout Session and align the hold with its expiry
-- (plus a grace period, so a payment Stripe accepts right before expiry is
-- confirmed while this reservation still owns the category).
create or replace function public.attach_checkout_session(
  p_reservation_id uuid,
  p_session_id text,
  p_checkout_url text,
  p_session_expires_at timestamptz,
  p_grace_seconds integer default 300
)
returns timestamptz
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_campaign_id uuid;
  v_res public.reservations%rowtype;
  v_expires timestamptz := p_session_expires_at + make_interval(secs => p_grace_seconds);
begin
  select campaign_id into v_campaign_id from public.reservations where id = p_reservation_id;
  if not found then
    raise exception 'reservation_not_found' using errcode = 'P0001';
  end if;
  perform 1 from public.campaigns where id = v_campaign_id for update;
  select * into v_res from public.reservations where id = p_reservation_id for update;

  if v_res.status <> 'HELD' then
    raise exception 'reservation_not_held' using errcode = 'P0001';
  end if;

  update public.reservations
     set stripe_checkout_session_id = p_session_id,
         stripe_checkout_url = p_checkout_url,
         stripe_session_expires_at = p_session_expires_at,
         expires_at = v_expires
   where id = p_reservation_id;

  update public.campaign_categories
     set hold_expires_at = v_expires
   where reservation_id = p_reservation_id and status = 'HELD';
  if not found then
    raise exception 'reservation_not_held' using errcode = 'P0001';
  end if;

  return v_expires;
end;
$$;

-- ---------------------------------------------------------------- release

-- End a HELD/PROCESSING reservation without a sale and free its category.
-- Only touches the inventory row if it still belongs to THIS reservation, so
-- a late event for an old reservation can never release a newer hold.
-- Returns false (no-op) if the reservation is already finished.
create or replace function public.release_reservation(
  p_reservation_id uuid,
  p_status public.reservation_status,
  p_reason text,
  p_session_id text default null
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_campaign_id uuid;
  v_res public.reservations%rowtype;
begin
  if p_status not in ('EXPIRED', 'RELEASED', 'FAILED') then
    raise exception 'invalid_release_status' using errcode = 'P0001';
  end if;

  select campaign_id into v_campaign_id from public.reservations where id = p_reservation_id;
  if not found then
    return false;
  end if;
  perform 1 from public.campaigns where id = v_campaign_id for update;
  select * into v_res from public.reservations where id = p_reservation_id for update;

  if p_session_id is not null and v_res.stripe_checkout_session_id is distinct from p_session_id then
    raise exception 'session_mismatch' using errcode = 'P0001';
  end if;

  if v_res.status not in ('HELD', 'PROCESSING') then
    return false;
  end if;

  update public.reservations
     set status = p_status,
         failure_reason = p_reason,
         expired_at = case when p_status = 'EXPIRED' then now() else expired_at end,
         released_at = case when p_status <> 'EXPIRED' then now() else released_at end
   where id = p_reservation_id;

  update public.campaign_categories
     set status = 'AVAILABLE', hold_expires_at = null, reservation_id = null
   where reservation_id = p_reservation_id and status = 'HELD';

  return true;
end;
$$;

-- ---------------------------------------------------------------- delayed payment in progress

-- Checkout completed but the payment has not settled (delayed methods).
-- Keep the category held until Stripe reports success or failure.
create or replace function public.mark_reservation_processing(
  p_reservation_id uuid,
  p_session_id text,
  p_hold_days integer default 14
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_campaign_id uuid;
  v_res public.reservations%rowtype;
  v_expires timestamptz := now() + make_interval(days => p_hold_days);
begin
  select campaign_id into v_campaign_id from public.reservations where id = p_reservation_id;
  if not found then
    raise exception 'reservation_not_found' using errcode = 'P0001';
  end if;
  perform 1 from public.campaigns where id = v_campaign_id for update;
  select * into v_res from public.reservations where id = p_reservation_id for update;

  if v_res.stripe_checkout_session_id is distinct from p_session_id then
    raise exception 'session_mismatch' using errcode = 'P0001';
  end if;
  if v_res.status <> 'HELD' then
    return false;
  end if;

  update public.campaign_categories
     set hold_expires_at = v_expires
   where reservation_id = p_reservation_id and status = 'HELD';
  if not found then
    return false;
  end if;

  update public.reservations set status = 'PROCESSING', expires_at = v_expires where id = p_reservation_id;
  return true;
end;
$$;

-- ---------------------------------------------------------------- fulfill

-- Called only after the webhook verified a paid Checkout Session.
-- Idempotent: a second call for the same session returns 'already_paid'.
-- Raises on any mismatch between the session and the reservation:
--   reservation_not_found, campaign_mismatch, category_mismatch,
--   amount_mismatch, currency_mismatch, session_mismatch
-- Returns 'refund_required' (and records it) if the category can no longer be
-- granted to this buyer.
create or replace function public.fulfill_reservation(
  p_reservation_id uuid,
  p_session_id text,
  p_campaign_id uuid,
  p_category_id uuid,
  p_amount_total integer,
  p_currency text,
  p_payment_intent_id text,
  p_customer_email text,
  p_business_name text,
  p_stripe_customer_id text,
  p_terms_accepted boolean,
  p_terms_version text
)
returns table (outcome text, advertiser_id uuid)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_campaign_id uuid;
  v_campaign public.campaigns%rowtype;
  v_res public.reservations%rowtype;
  v_row public.campaign_categories%rowtype;
  v_sold integer;
  v_holds integer;
  v_owned boolean;
  v_adv uuid;
begin
  select r.campaign_id into v_campaign_id from public.reservations r where r.id = p_reservation_id;
  if not found then
    raise exception 'reservation_not_found' using errcode = 'P0001';
  end if;
  select * into v_campaign from public.campaigns where id = v_campaign_id for update;
  select * into v_res from public.reservations r where r.id = p_reservation_id for update;

  -- Verify the session matches what we reserved.
  if v_res.stripe_checkout_session_id is distinct from p_session_id then
    raise exception 'session_mismatch' using errcode = 'P0001';
  end if;
  if v_res.campaign_id <> p_campaign_id then
    raise exception 'campaign_mismatch' using errcode = 'P0001';
  end if;
  if v_res.category_id <> p_category_id then
    raise exception 'category_mismatch' using errcode = 'P0001';
  end if;
  if v_res.amount_cents <> p_amount_total then
    raise exception 'amount_mismatch' using errcode = 'P0001';
  end if;
  if v_res.currency <> lower(p_currency) then
    raise exception 'currency_mismatch' using errcode = 'P0001';
  end if;

  -- Idempotency.
  if v_res.status = 'PAID' then
    return query select 'already_paid'::text, v_res.advertiser_id;
    return;
  end if;
  if v_res.status = 'REFUND_REQUIRED' then
    return query select 'refund_required'::text, null::uuid;
    return;
  end if;

  select * into v_row from public.campaign_categories
   where campaign_id = v_res.campaign_id and category_id = v_res.category_id
   for update;

  -- Does this reservation still own the category?
  v_owned := v_row.reservation_id = v_res.id and v_row.status = 'HELD';

  if not v_owned then
    -- The hold lapsed before the payment was confirmed. Re-claim only if
    -- nobody else has the conflict group and a campaign slot is still free.
    perform public.release_expired_holds(v_res.campaign_id);
    select * into v_row from public.campaign_categories where id = v_row.id for update;
    select count(*) filter (where status = 'SOLD'),
           count(*) filter (where status = 'HELD' and hold_expires_at > now())
      into v_sold, v_holds
      from public.campaign_categories where campaign_id = v_res.campaign_id;
    if v_row.status <> 'AVAILABLE'
       or v_row.manually_closed
       or v_campaign.status not in ('OPEN', 'PRELAUNCH')
       or exists (
         select 1 from public.campaign_categories
          where campaign_id = v_res.campaign_id and conflict_key = v_res.conflict_key
            and (status = 'SOLD' or (status = 'HELD' and hold_expires_at > now()))
       )
       or v_sold + v_holds >= v_campaign.max_advertisers then
      update public.reservations
         set status = 'REFUND_REQUIRED',
             failure_reason = 'paid after the hold ended and the category was no longer available',
             stripe_payment_intent_id = p_payment_intent_id,
             customer_email = p_customer_email,
             business_name = p_business_name,
             stripe_customer_id = p_stripe_customer_id
       where id = v_res.id;
      return query select 'refund_required'::text, null::uuid;
      return;
    end if;
  end if;

  insert into public.advertisers (business_name, contact_email, stripe_customer_id)
  values (coalesce(nullif(btrim(p_business_name), ''), 'Unknown business'), p_customer_email, p_stripe_customer_id)
  returning id into v_adv;

  update public.reservations
     set status = 'PAID',
         paid_at = now(),
         advertiser_id = v_adv,
         stripe_payment_intent_id = p_payment_intent_id,
         stripe_customer_id = p_stripe_customer_id,
         customer_email = p_customer_email,
         business_name = p_business_name,
         terms_accepted = coalesce(p_terms_accepted, false),
         terms_accepted_at = case when p_terms_accepted then now() else null end,
         terms_version = p_terms_version
   where id = v_res.id;

  -- The Phase 2 cap trigger enforces the maximum and flips SOLD_OUT at the cap.
  update public.campaign_categories
     set status = 'SOLD', sold_at = now(), hold_expires_at = null,
         reservation_id = v_res.id, advertiser_id = v_adv
   where id = v_row.id;

  return query select 'fulfilled'::text, v_adv;
end;
$$;

-- ---------------------------------------------------------------- webhook event bookkeeping

-- Returns true if this delivery should be processed. A retry of a failed
-- event, or of one stuck in 'processing' for over 5 minutes, is re-processed;
-- processed/ignored events and in-flight duplicates are skipped.
create or replace function public.begin_webhook_event(p_event_id text, p_type text, p_livemode boolean)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_row public.stripe_webhook_events%rowtype;
begin
  insert into public.stripe_webhook_events (event_id, type, livemode)
  values (p_event_id, p_type, p_livemode)
  on conflict (event_id) do nothing;
  if found then
    return true;
  end if;

  select * into v_row from public.stripe_webhook_events where event_id = p_event_id for update;
  if v_row.status in ('processed', 'ignored') then
    return false;
  end if;
  if v_row.status = 'processing' and v_row.received_at > now() - interval '5 minutes' then
    return false;
  end if;

  update public.stripe_webhook_events
     set status = 'processing', attempts = attempts + 1, received_at = now(), error = null
   where event_id = p_event_id;
  return true;
end;
$$;

create or replace function public.finish_webhook_event(
  p_event_id text,
  p_status text,
  p_reservation_id uuid default null,
  p_error text default null
)
returns void
language sql
security invoker
set search_path = public, pg_temp
as $$
  update public.stripe_webhook_events
     set status = p_status,
         -- Only link reservations that exist (metadata on a bad event may not).
         reservation_id = coalesce((select r.id from public.reservations r where r.id = p_reservation_id), reservation_id),
         error = left(p_error, 1000),
         processed_at = now()
   where event_id = p_event_id;
$$;

-- ---------------------------------------------------------------- security

alter table public.advertisers enable row level security;
alter table public.reservations enable row level security;
alter table public.stripe_webhook_events enable row level security;

revoke all on public.advertisers, public.reservations, public.stripe_webhook_events from public, anon, authenticated;
grant select, insert, update, delete on public.advertisers, public.reservations, public.stripe_webhook_events to service_role;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.release_expired_holds(uuid)',
    'public.reserve_category(uuid, uuid, integer)',
    'public.attach_checkout_session(uuid, text, text, timestamptz, integer)',
    'public.release_reservation(uuid, public.reservation_status, text, text)',
    'public.mark_reservation_processing(uuid, text, integer)',
    'public.fulfill_reservation(uuid, text, uuid, uuid, integer, text, text, text, text, text, boolean, text)',
    'public.begin_webhook_event(text, text, boolean)',
    'public.finish_webhook_event(text, text, uuid, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
