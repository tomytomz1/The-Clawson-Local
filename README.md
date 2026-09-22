# The Clawson Local

Production site and self-service advertiser funnel for The Clawson Local, a category-exclusive shared-direct-mail product serving Clawson, Michigan.

Stack: Next.js (App Router) · TypeScript · Tailwind CSS. Planned for later phases: Postgres/Supabase, Stripe Checkout, Resend.

## Develop

```bash
npm install
npm run dev     # http://localhost:3000
npm run build
npm run lint
```

## Where things live

| Path | Purpose |
| --- | --- |
| `config/campaign.ts` | Offer: price, max advertisers, planned reach, `reachIsEstimated`, status, dates |
| `config/site.ts` | Brand, contact emails, founder, and unconfirmed business facts (legal name, address, phone) |
| `config/categories.ts` | Seed categories with `conflictKey` and aliases |
| `config/postal-routes.ts` | USPS carrier routes (empty until routes are locked) |
| `lib/campaign` | Copy helpers (`getReachLabel`, `formatCampaignPrice`, cost per residence) and the FAQ |
| `lib/inventory` | Category status derivation (AVAILABLE / HELD / SOLD / CLOSED) and campaign progress |
| `components/marketing` | Homepage and category-page sections |

Change price, reach or advertiser count in `config/campaign.ts` only. Components never hard-code them.

## Unconfirmed values (never invent them)

These are `null` in config and show as "to be published" until set: final USPS routes, verified residence count, sales, asset, proof, print, mailing and outside fulfillment dates, legal business name, mailing address, phone, and print/mail vendor. The final mailer design is also still open.

When routes are locked, add them to `config/postal-routes.ts`, update `plannedReach`, and set `reachIsEstimated: false`. Copy then drops "approximately" automatically.

## Build phases

1. Foundation: config, design system, homepage, category template ✅
2. Data + inventory: database, live category status, admin basics
3. Checkout: reservations, 30-minute holds, Stripe, webhooks
4. Post-purchase: success page, intake, uploads
5. Proofing
6. Transactional email
7. Analytics, attribution, QA
