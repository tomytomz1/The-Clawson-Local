-- Phase 2 hardening.
--
-- * Internal trigger functions are not part of the public RPC surface.
--   Supabase's default privileges grant EXECUTE on new public functions to
--   anon/authenticated directly, so revoking from PUBLIC alone is not enough.
--   Triggers still fire: trigger functions run regardless of the caller's
--   EXECUTE privilege. campaign_inventory() and campaign_sold_count() stay
--   public on purpose (safe, read-only inventory and count).
-- * Cover the campaign_categories.category_id foreign key with an index.

revoke execute on function public.campaigns_create_inventory() from public, anon, authenticated;
revoke execute on function public.categories_create_inventory() from public, anon, authenticated;
grant execute on function public.campaigns_create_inventory() to service_role;
grant execute on function public.categories_create_inventory() to service_role;

create index if not exists campaign_categories_category on public.campaign_categories (category_id);
