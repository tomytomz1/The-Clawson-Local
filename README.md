# The Clawson Local

Production site and self-service advertiser funnel for The Clawson Local, a category-exclusive shared-direct-mail product serving Clawson, Michigan.

Stack: Next.js (App Router) · TypeScript · Tailwind CSS · Supabase (Postgres). Planned: Stripe Checkout (Phase 3), Resend (Phase 6).

## Develop

```bash
npm install
cp .env.example .env.local   # fill in Supabase + admin values
npm run dev                   # http://localhost:3000
npm run build
npm run lint
npm test                      # unit + database tests
```

`npm run test:db` needs a local Postgres (see `TEST_DATABASE_URL`). It creates a throwaway database, applies the migration and seed, and tests exclusivity, conflict groups, holds, the advertiser cap and RLS. It is skipped if no Postgres is reachable.

## Where things live

| Path | Purpose |
| --- | --- |
| `supabase/migrations/` | Schema, inventory rules, RLS. **Source of truth for availability logic.** |
| `supabase/seed.sql` | Generated seed (Founding Edition + 30 categories). Regenerate with `npm run db:seed:generate`. |
| `config/seed/` | Seed inputs only. Runtime values come from the database. |
| `config/site.ts` | Static brand/contact facts and unconfirmed business details (legal name, address, phone) |
| `config/postal-routes.ts` | USPS carrier routes (empty until routes are locked) |
| `lib/campaign` | `getActiveCampaign()` + copy helpers (`getReachLabel`, `formatCampaignPrice`, …) |
| `lib/inventory` | `getCampaignInventory()`, `getCategoryAvailability()`, `getCategoryBySlug()`, `getCampaignProgress()` |
| `lib/db` | Server-only Supabase clients and row mappers |
| `lib/admin` + `app/admin` | Utilitarian admin (HTTP Basic auth) |

Marketing components never query the database; pages call `lib/*` and pass plain data down.

## How inventory works

- **Campaign values** (price, max advertisers, reach, status, dates) live in the `campaigns` row and are edited in `/admin`.
- **Exclusivity** is by `conflict_key`, enforced by a partial unique index: at most one HELD or SOLD row per conflict group per campaign.
- **Public status** comes from the `campaign_inventory()` Postgres function: a sale marks every category in its conflict group as claimed; expired holds become available; manual closes show as closed; reaching `max_advertisers` (or status SOLD_OUT/PRODUCTION/MAILED) closes everything unsold.
- **Advertiser cap**: a trigger locks the campaign row on every sale, rejects sales beyond `max_advertisers`, and sets the campaign to SOLD_OUT at the cap.
- **Progress** is paid advertisers / `max_advertisers` (e.g. "7 of 20 positions claimed"), never categories sold / total categories.
- **Failure mode**: if the database is unreachable, inventory pages show "Availability temporarily unavailable" with no purchase path. There is no static fallback.

## Unconfirmed values (never invent them)

Nullable in the database and shown as "to be published" until set in `/admin`: sales deadline, asset/proof deadlines, print date, mailing date, outside fulfillment date, verified reach. In `config/site.ts`: legal business name, mailing address, phone, print/mail vendor. USPS routes go in `config/postal-routes.ts`. The final mailer design is also still open.

When routes are locked: enter the verified count in `/admin` and untick "Reach is an estimate". Copy drops "approximately" automatically.

## Supabase setup (once per environment)

1. Create a Supabase project.
2. SQL Editor → run `supabase/migrations/20260922000000_inventory.sql`, then `supabase/seed.sql`. (Or `supabase db push` with the CLI.)
3. Add the env vars from `.env.example` to Vercel (Production and Preview) and redeploy.

## Build phases

1. Foundation: config, design system, homepage, category template ✅
2. Data + inventory: database, live category status, admin basics ✅
3. Checkout: reservations, 30-minute holds, Stripe, webhooks
4. Post-purchase: success page, intake, uploads
5. Proofing
6. Transactional email
7. Analytics, attribution, QA
