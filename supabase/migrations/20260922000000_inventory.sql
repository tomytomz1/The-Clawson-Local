-- Phase 2: campaigns, categories and campaign inventory.
--
-- Design notes
-- * Exclusivity is enforced by the database, not the app: at most one HELD or
--   SOLD row per (campaign, conflict_key) via a partial unique index.
-- * The public site reads inventory only through campaign_inventory(), which
--   derives the effective status (conflict propagation, expired holds,
--   sold-out closure, manual closure). It exposes no advertiser data.
-- * The paid-advertiser cap is enforced in a trigger that locks the campaign
--   row, so concurrent sales serialize.

-- ---------------------------------------------------------------- types

create type public.campaign_status as enum ('PRELAUNCH', 'OPEN', 'SOLD_OUT', 'PRODUCTION', 'MAILED');
create type public.inventory_status as enum ('AVAILABLE', 'HELD', 'SOLD', 'CLOSED');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------- campaigns

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(name) between 1 and 120),
  market text not null check (length(market) between 1 and 80),
  state text not null check (length(state) between 1 and 80),
  status public.campaign_status not null default 'PRELAUNCH',
  -- Exactly one campaign is the one the public site sells.
  is_active boolean not null default false,
  price_cents integer not null check (price_cents > 0),
  max_advertisers integer not null check (max_advertisers > 0),
  -- Planning number until USPS carrier routes are locked.
  planned_reach integer not null check (planned_reach > 0),
  reach_is_estimated boolean not null default true,
  -- Verified delivery count; required once reach is no longer an estimate.
  verified_reach integer check (verified_reach > 0),
  included_revisions integer not null default 1 check (included_revisions between 0 and 10),
  reservation_minutes integer not null default 30 check (reservation_minutes between 5 and 240),
  -- Unknown operational dates stay null until confirmed.
  sales_open_at timestamptz,
  sales_close_at timestamptz,
  asset_deadline date,
  proof_deadline date,
  print_date date,
  mailing_date date,
  outside_fulfillment_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint verified_reach_required check (reach_is_estimated or verified_reach is not null)
);

create unique index campaigns_one_active on public.campaigns (is_active) where is_active;

create trigger campaigns_updated_at before update on public.campaigns
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- categories

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  display_name text not null check (length(display_name) between 1 and 80),
  -- Lower-case name used inside sentences ("plumbing").
  short_name text not null check (length(short_name) between 1 and 80),
  -- Categories sharing a conflict_key compete; only one can be sold per edition.
  conflict_key text not null check (conflict_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  -- Alternate names that belong to this conflict group (for search/admin).
  aliases text[] not null default '{}',
  description text,
  -- Category-specific landing line. Null uses the shared template line.
  landing_page_copy text,
  priority integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index categories_conflict_key on public.categories (conflict_key);

create trigger categories_updated_at before update on public.categories
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- campaign inventory

create table public.campaign_categories (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete restrict,
  -- Copied from categories by trigger so exclusivity can be indexed.
  conflict_key text not null,
  status public.inventory_status not null default 'AVAILABLE',
  hold_expires_at timestamptz,
  -- Foreign keys are added when reservations/advertisers tables arrive (Phase 3).
  reservation_id uuid,
  advertiser_id uuid,
  sold_at timestamptz,
  manually_closed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, category_id),
  constraint held_requires_expiry check (status <> 'HELD' or hold_expires_at is not null),
  constraint sold_requires_timestamp check (status <> 'SOLD' or sold_at is not null)
);

-- The exclusivity guarantee: one live claim per conflict group per campaign.
create unique index campaign_categories_one_claim_per_conflict
  on public.campaign_categories (campaign_id, conflict_key)
  where status in ('HELD', 'SOLD');

create index campaign_categories_campaign on public.campaign_categories (campaign_id, status);

create trigger campaign_categories_updated_at before update on public.campaign_categories
  for each row execute function public.set_updated_at();

-- Keep conflict_key in sync with the category.
create or replace function public.campaign_categories_sync_conflict_key()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  select c.conflict_key into new.conflict_key from public.categories c where c.id = new.category_id;
  return new;
end;
$$;

create trigger campaign_categories_conflict_key
  before insert or update of category_id, conflict_key on public.campaign_categories
  for each row execute function public.campaign_categories_sync_conflict_key();

create or replace function public.categories_propagate_conflict_key()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.conflict_key is distinct from old.conflict_key then
    update public.campaign_categories set conflict_key = new.conflict_key where category_id = new.id;
  end if;
  return new;
end;
$$;

create trigger categories_conflict_key_changed
  after update of conflict_key on public.categories
  for each row execute function public.categories_propagate_conflict_key();

-- Enforce the paid-advertiser cap and flip the campaign to SOLD_OUT at the cap.
create or replace function public.campaign_categories_enforce_cap()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_max integer;
  v_sold integer;
begin
  if new.status <> 'SOLD' or (tg_op = 'UPDATE' and old.status = 'SOLD') then
    return new;
  end if;

  -- Serialize concurrent sales for this campaign.
  select max_advertisers into v_max from public.campaigns where id = new.campaign_id for update;

  select count(*) into v_sold
  from public.campaign_categories
  where campaign_id = new.campaign_id and status = 'SOLD' and id <> new.id;

  if v_sold >= v_max then
    raise exception 'campaign % has reached its maximum of % advertisers', new.campaign_id, v_max
      using errcode = 'check_violation';
  end if;

  if v_sold + 1 >= v_max then
    update public.campaigns set status = 'SOLD_OUT'
    where id = new.campaign_id and status in ('PRELAUNCH', 'OPEN');
  end if;

  return new;
end;
$$;

create trigger campaign_categories_cap
  before insert or update of status on public.campaign_categories
  for each row execute function public.campaign_categories_enforce_cap();

-- Every campaign has an inventory row for every category (and vice versa).
create or replace function public.campaigns_create_inventory()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.campaign_categories (campaign_id, category_id, conflict_key)
  select new.id, c.id, c.conflict_key from public.categories c
  on conflict (campaign_id, category_id) do nothing;
  return new;
end;
$$;

create trigger campaigns_inventory after insert on public.campaigns
  for each row execute function public.campaigns_create_inventory();

create or replace function public.categories_create_inventory()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.campaign_categories (campaign_id, category_id, conflict_key)
  select cp.id, new.id, new.conflict_key from public.campaigns cp
  where cp.status not in ('PRODUCTION', 'MAILED')
  on conflict (campaign_id, category_id) do nothing;
  return new;
end;
$$;

create trigger categories_inventory after insert on public.categories
  for each row execute function public.categories_create_inventory();

-- ---------------------------------------------------------------- public read API

-- Effective, public-safe inventory for one campaign. The single place where
-- public category status is decided.
create or replace function public.campaign_inventory(p_campaign_id uuid)
returns table (
  category_id uuid,
  slug text,
  display_name text,
  short_name text,
  conflict_key text,
  description text,
  landing_page_copy text,
  priority integer,
  status public.inventory_status
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with cp as (
    select * from public.campaigns where id = p_campaign_id
  ),
  inv as (
    select * from public.campaign_categories where campaign_id = p_campaign_id
  ),
  sold as (
    select distinct conflict_key from inv where status = 'SOLD'
  ),
  held as (
    select distinct conflict_key from inv where status = 'HELD' and hold_expires_at > now()
  ),
  closed_campaign as (
    select (cp.status in ('SOLD_OUT', 'PRODUCTION', 'MAILED')
            or (select count(*) from inv where status = 'SOLD') >= cp.max_advertisers) as closed
    from cp
  )
  select
    cat.id,
    cat.slug,
    cat.display_name,
    cat.short_name,
    cat.conflict_key,
    cat.description,
    cat.landing_page_copy,
    cat.priority,
    (case
      when cat.conflict_key in (select conflict_key from sold) then 'SOLD'
      when (select closed from closed_campaign) then 'CLOSED'
      when coalesce(i.manually_closed, false) or i.status = 'CLOSED' then 'CLOSED'
      when cat.conflict_key in (select conflict_key from held) then 'HELD'
      else 'AVAILABLE'
    end)::public.inventory_status
  from public.categories cat
  left join inv i on i.category_id = cat.id
  where cat.active and exists (select 1 from cp)
  order by cat.priority, cat.display_name;
$$;

-- Paid advertisers for a campaign (one SOLD row per advertiser).
create or replace function public.campaign_sold_count(p_campaign_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::integer from public.campaign_categories
  where campaign_id = p_campaign_id and status = 'SOLD';
$$;

-- ---------------------------------------------------------------- security

alter table public.campaigns enable row level security;
alter table public.categories enable row level security;
alter table public.campaign_categories enable row level security;

-- Public (anon/authenticated) may read campaign config and active categories.
-- They may not read raw inventory rows and may not write anything.
revoke all on public.campaigns, public.categories, public.campaign_categories from anon, authenticated;
grant select on public.campaigns, public.categories to anon, authenticated;

create policy "Public can read the active campaign" on public.campaigns
  for select to anon, authenticated using (is_active);

create policy "Public can read active categories" on public.categories
  for select to anon, authenticated using (active);

-- campaign_categories: no policies for anon/authenticated => no access.

revoke execute on function public.campaign_inventory(uuid) from public;
revoke execute on function public.campaign_sold_count(uuid) from public;
grant execute on function public.campaign_inventory(uuid) to anon, authenticated, service_role;
grant execute on function public.campaign_sold_count(uuid) to anon, authenticated, service_role;

revoke execute on function public.campaigns_create_inventory() from public;
revoke execute on function public.categories_create_inventory() from public;
