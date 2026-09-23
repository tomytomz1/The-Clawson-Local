-- Phase 4: post-payment advertiser intake.
--
-- * One intake per PAID advertiser, reached through an unguessable link. The
--   link token is HMAC(INTAKE_TOKEN_SECRET, advertiser id), computed by the
--   server; only its SHA-256 (token_hash) is stored. The server can always
--   re-derive the link (success page, admin) without the raw token living in
--   the database.
-- * Intake status (NOT_STARTED -> IN_PROGRESS -> SUBMITTED) is separate from
--   payment status; reservations and inventory are untouched.
-- * Uploaded files live in a PRIVATE Storage bucket under server-generated
--   paths intakes/<intake id>/<kind>/<uuid>.<ext>. The browser never chooses a
--   path; it only receives a short-lived signed upload URL for one new object.
-- * All tables: RLS on, no policies, no anon/authenticated grants. All
--   functions: SECURITY INVOKER, executable by service_role only. Every
--   function that acts for an advertiser takes the token hash, so changing an
--   id in a URL can never reach another advertiser's data.

create type public.intake_status as enum ('NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED');
create type public.intake_design_choice as enum ('BUILD_FOR_ME', 'FINISHED_ARTWORK');
create type public.intake_asset_kind as enum ('logo', 'photo', 'artwork');
create type public.intake_asset_status as enum ('PENDING', 'READY', 'REPLACED', 'DELETED');

create table public.advertiser_intakes (
  id uuid primary key default gen_random_uuid(),
  advertiser_id uuid not null unique references public.advertisers (id) on delete cascade,
  reservation_id uuid not null unique references public.reservations (id) on delete restrict,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  status public.intake_status not null default 'NOT_STARTED',
  design_choice public.intake_design_choice,
  business_name text check (length(business_name) <= 200),
  contact_name text check (length(contact_name) <= 200),
  contact_email text check (length(contact_email) <= 254),
  phone text check (length(phone) <= 40),
  website_url text check (length(website_url) <= 500),
  headline text check (length(headline) <= 200),
  offer text check (length(offer) <= 500),
  call_to_action text check (length(call_to_action) <= 200),
  qr_url text check (length(qr_url) <= 500),
  notes text check (length(notes) <= 2000),
  started_at timestamptz,
  submitted_at timestamptz,
  last_saved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint submitted_has_time check (status <> 'SUBMITTED' or submitted_at is not null)
);

create trigger advertiser_intakes_updated_at before update on public.advertiser_intakes
  for each row execute function public.set_updated_at();

create table public.intake_assets (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null references public.advertiser_intakes (id) on delete cascade,
  kind public.intake_asset_kind not null,
  status public.intake_asset_status not null default 'PENDING',
  -- Server-generated; never derived from the uploaded filename.
  storage_path text not null unique check (storage_path ~ '^intakes/[0-9a-f-]{36}/(logo|photo|artwork)/[0-9a-f-]{36}\.(png|jpg|svg|pdf|webp)$'),
  -- Sanitized, for display only.
  original_filename text not null check (length(original_filename) between 1 and 120),
  content_type text not null check (content_type in ('image/png', 'image/jpeg', 'image/svg+xml', 'application/pdf', 'image/webp')),
  size_bytes bigint not null check (size_bytes > 0),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  constraint path_matches_intake check (storage_path like 'intakes/' || intake_id::text || '/%')
);

create index intake_assets_intake on public.intake_assets (intake_id, kind, status);

-- ---------------------------------------------------------------- private bucket

-- Created only where Supabase Storage exists (not in plain-Postgres tests).
-- Private: no public URLs, and no storage.objects policies are added, so only
-- the service role (server) can read or write. Size/type limits are enforced
-- by Storage itself as a backstop to the server's checks.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage')
     and exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'storage' and c.relname = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('intake-assets', 'intake-assets', false, 52428800,
            array['image/png', 'image/jpeg', 'image/svg+xml', 'application/pdf', 'image/webp'])
    on conflict (id) do update
      set public = false,
          file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;

-- ---------------------------------------------------------------- functions

-- Create (or re-key) the intake for a PAID advertiser. Idempotent.
-- Refuses advertisers without a PAID reservation.
create or replace function public.ensure_advertiser_intake(p_advertiser_id uuid, p_token_hash text)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_res public.reservations%rowtype;
  v_adv public.advertisers%rowtype;
  v_id uuid;
begin
  select * into v_res from public.reservations
   where advertiser_id = p_advertiser_id and status = 'PAID'
   order by paid_at desc limit 1;
  if not found then
    raise exception 'advertiser_not_paid' using errcode = 'P0001';
  end if;
  select * into v_adv from public.advertisers where id = p_advertiser_id;

  insert into public.advertiser_intakes (advertiser_id, reservation_id, token_hash, business_name, contact_email)
  values (p_advertiser_id, v_res.id, p_token_hash, v_adv.business_name, v_adv.contact_email)
  on conflict (advertiser_id) do update
    set token_hash = excluded.token_hash  -- follows a rotated INTAKE_TOKEN_SECRET
  returning id into v_id;
  return v_id;
end;
$$;

-- Everything the intake page needs, by token hash. Returns nothing unless the
-- advertiser's reservation is PAID.
create or replace function public.get_intake(p_token_hash text)
returns table (
  intake_id uuid,
  status public.intake_status,
  design_choice public.intake_design_choice,
  business_name text,
  contact_name text,
  contact_email text,
  phone text,
  website_url text,
  headline text,
  offer text,
  call_to_action text,
  qr_url text,
  notes text,
  submitted_at timestamptz,
  last_saved_at timestamptz,
  category_name text,
  campaign_name text,
  market text
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select i.id, i.status, i.design_choice, i.business_name, i.contact_name, i.contact_email, i.phone,
         i.website_url, i.headline, i.offer, i.call_to_action, i.qr_url, i.notes, i.submitted_at,
         i.last_saved_at, c.display_name, cp.name, cp.market
    from public.advertiser_intakes i
    join public.reservations r on r.id = i.reservation_id and r.status = 'PAID'
    join public.categories c on c.id = r.category_id
    join public.campaigns cp on cp.id = r.campaign_id
   where i.token_hash = p_token_hash;
$$;

-- Ready assets for the intake page.
create or replace function public.get_intake_assets(p_token_hash text)
returns table (asset_id uuid, kind public.intake_asset_kind, original_filename text, content_type text, size_bytes bigint, confirmed_at timestamptz)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select a.id, a.kind, a.original_filename, a.content_type, a.size_bytes, a.confirmed_at
    from public.intake_assets a
    join public.advertiser_intakes i on i.id = a.intake_id
    join public.reservations r on r.id = i.reservation_id and r.status = 'PAID'
   where i.token_hash = p_token_hash and a.status = 'READY'
   order by a.kind, a.confirmed_at;
$$;

-- Save (and optionally submit) the intake. Text fields are validated by the
-- server first; the database re-checks the submit requirements. One row per
-- advertiser, so repeated saves/submits never create duplicates.
create or replace function public.save_intake(
  p_token_hash text,
  p_submit boolean,
  p_design_choice public.intake_design_choice,
  p_business_name text,
  p_contact_name text,
  p_contact_email text,
  p_phone text,
  p_website_url text,
  p_headline text,
  p_offer text,
  p_call_to_action text,
  p_qr_url text,
  p_notes text
)
returns public.intake_status
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_intake public.advertiser_intakes%rowtype;
  v_missing text[] := '{}';
begin
  select i.* into v_intake
    from public.advertiser_intakes i
    join public.reservations r on r.id = i.reservation_id and r.status = 'PAID'
   where i.token_hash = p_token_hash
   for update of i;
  if not found then
    raise exception 'intake_not_found' using errcode = 'P0001';
  end if;

  update public.advertiser_intakes
     set design_choice = p_design_choice,
         business_name = nullif(btrim(p_business_name), ''),
         contact_name = nullif(btrim(p_contact_name), ''),
         contact_email = nullif(btrim(p_contact_email), ''),
         phone = nullif(btrim(p_phone), ''),
         website_url = nullif(btrim(p_website_url), ''),
         headline = nullif(btrim(p_headline), ''),
         offer = nullif(btrim(p_offer), ''),
         call_to_action = nullif(btrim(p_call_to_action), ''),
         qr_url = nullif(btrim(p_qr_url), ''),
         notes = nullif(btrim(p_notes), ''),
         started_at = coalesce(started_at, now()),
         last_saved_at = now(),
         status = case when status = 'NOT_STARTED' then 'IN_PROGRESS'::public.intake_status else status end
   where id = v_intake.id
  returning * into v_intake;

  if not p_submit then
    return v_intake.status;
  end if;

  if v_intake.design_choice is null then v_missing := array_append(v_missing, 'design_choice'); end if;
  if v_intake.business_name is null then v_missing := array_append(v_missing, 'business_name'); end if;
  if v_intake.contact_name is null then v_missing := array_append(v_missing, 'contact_name'); end if;
  if v_intake.contact_email is null then v_missing := array_append(v_missing, 'contact_email'); end if;
  if v_intake.phone is null then v_missing := array_append(v_missing, 'phone'); end if;
  if v_intake.design_choice = 'BUILD_FOR_ME' then
    if v_intake.headline is null then v_missing := array_append(v_missing, 'headline'); end if;
    if v_intake.call_to_action is null then v_missing := array_append(v_missing, 'call_to_action'); end if;
    if not exists (select 1 from public.intake_assets where intake_id = v_intake.id and kind = 'logo' and status = 'READY') then
      v_missing := array_append(v_missing, 'logo');
    end if;
  elsif v_intake.design_choice = 'FINISHED_ARTWORK' then
    if not exists (select 1 from public.intake_assets where intake_id = v_intake.id and kind = 'artwork' and status = 'READY') then
      v_missing := array_append(v_missing, 'artwork');
    end if;
  end if;
  if array_length(v_missing, 1) > 0 then
    raise exception 'intake_incomplete:%', array_to_string(v_missing, ',') using errcode = 'P0001';
  end if;

  update public.advertiser_intakes
     set status = 'SUBMITTED', submitted_at = coalesce(submitted_at, now())
   where id = v_intake.id;
  return 'SUBMITTED';
end;
$$;

-- Register a pending upload at a server-generated path (the server then hands
-- the browser a signed upload URL for exactly that path). Limits: one pending
-- upload spree per intake (20 pending max) and at most 3 ready photos.
create or replace function public.create_intake_asset(
  p_token_hash text,
  p_kind public.intake_asset_kind,
  p_asset_id uuid,
  p_extension text,
  p_original_filename text,
  p_content_type text,
  p_size_bytes bigint
)
returns text
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_intake_id uuid;
  v_path text;
begin
  select i.id into v_intake_id
    from public.advertiser_intakes i
    join public.reservations r on r.id = i.reservation_id and r.status = 'PAID'
   where i.token_hash = p_token_hash
   for update of i;
  if not found then
    raise exception 'intake_not_found' using errcode = 'P0001';
  end if;
  if p_kind = 'photo' and (select count(*) from public.intake_assets where intake_id = v_intake_id and kind = 'photo' and status = 'READY') >= 3 then
    raise exception 'too_many_photos' using errcode = 'P0001';
  end if;
  if (select count(*) from public.intake_assets where intake_id = v_intake_id and status = 'PENDING' and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'too_many_pending_uploads' using errcode = 'P0001';
  end if;

  v_path := 'intakes/' || v_intake_id || '/' || p_kind || '/' || p_asset_id || '.' || p_extension;
  insert into public.intake_assets (id, intake_id, kind, storage_path, original_filename, content_type, size_bytes)
  values (p_asset_id, v_intake_id, p_kind, v_path, p_original_filename, p_content_type, p_size_bytes);
  return v_path;
end;
$$;

-- One asset of this intake (any status), for the server's post-upload check.
create or replace function public.get_intake_asset(p_token_hash text, p_asset_id uuid)
returns table (asset_id uuid, kind public.intake_asset_kind, status public.intake_asset_status, storage_path text, content_type text, size_bytes bigint)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select a.id, a.kind, a.status, a.storage_path, a.content_type, a.size_bytes
    from public.intake_assets a
    join public.advertiser_intakes i on i.id = a.intake_id
    join public.reservations r on r.id = i.reservation_id and r.status = 'PAID'
   where i.token_hash = p_token_hash and a.id = p_asset_id;
$$;

-- Mark an uploaded asset READY after the server verified the stored object.
-- For logo and artwork, a new file replaces the previous one; the replaced
-- paths are returned so the server can delete those objects.
create or replace function public.confirm_intake_asset(p_token_hash text, p_asset_id uuid, p_size_bytes bigint)
returns table (replaced_path text)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_asset public.intake_assets%rowtype;
begin
  select a.* into v_asset
    from public.intake_assets a
    join public.advertiser_intakes i on i.id = a.intake_id
    join public.reservations r on r.id = i.reservation_id and r.status = 'PAID'
   where i.token_hash = p_token_hash and a.id = p_asset_id
   for update of a;
  if not found then
    raise exception 'asset_not_found' using errcode = 'P0001';
  end if;
  if v_asset.status = 'READY' then
    return;  -- idempotent
  end if;
  if v_asset.status <> 'PENDING' then
    raise exception 'asset_not_pending' using errcode = 'P0001';
  end if;
  if v_asset.kind = 'photo' and (select count(*) from public.intake_assets where intake_id = v_asset.intake_id and kind = 'photo' and status = 'READY') >= 3 then
    raise exception 'too_many_photos' using errcode = 'P0001';
  end if;

  if v_asset.kind in ('logo', 'artwork') then
    return query
      update public.intake_assets
         set status = 'REPLACED'
       where intake_id = v_asset.intake_id and kind = v_asset.kind and status = 'READY'
      returning storage_path;
  end if;

  update public.intake_assets
     set status = 'READY', confirmed_at = now(), size_bytes = p_size_bytes
   where id = v_asset.id;
end;
$$;

-- Remove an asset (advertiser clicked Remove, or verification failed).
-- Returns the storage path to delete, or null if not this intake's asset.
create or replace function public.delete_intake_asset(p_token_hash text, p_asset_id uuid)
returns text
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_path text;
begin
  update public.intake_assets a
     set status = 'DELETED'
    from public.advertiser_intakes i
    join public.reservations r on r.id = i.reservation_id and r.status = 'PAID'
   where a.intake_id = i.id and i.token_hash = p_token_hash and a.id = p_asset_id
     and a.status in ('PENDING', 'READY')
  returning a.storage_path into v_path;
  return v_path;
end;
$$;

-- ---------------------------------------------------------------- security

alter table public.advertiser_intakes enable row level security;
alter table public.intake_assets enable row level security;
revoke all on public.advertiser_intakes, public.intake_assets from public, anon, authenticated;
grant select, insert, update, delete on public.advertiser_intakes, public.intake_assets to service_role;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.ensure_advertiser_intake(uuid, text)',
    'public.get_intake(text)',
    'public.get_intake_assets(text)',
    'public.save_intake(text, boolean, public.intake_design_choice, text, text, text, text, text, text, text, text, text, text)',
    'public.create_intake_asset(text, public.intake_asset_kind, uuid, text, text, text, bigint)',
    'public.get_intake_asset(text, uuid)',
    'public.confirm_intake_asset(text, uuid, bigint)',
    'public.delete_intake_asset(text, uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
