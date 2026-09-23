/**
 * SEED DATA ONLY. The `campaigns` table is authoritative at runtime; edit the
 * live campaign in /admin. This generates supabase/seed.sql for new
 * environments (`npm run db:seed:generate`).
 *
 * Unknown operational dates stay null. Never invent them.
 */
export const foundingCampaignSeed = {
  slug: "clawson-founding-edition",
  name: "Founder’s Edition",
  market: "Clawson",
  state: "Michigan",
  status: "OPEN",
  isActive: true,
  priceCents: 35000,
  maxAdvertisers: 20,
  // Approximate planning number. Final USPS carrier routes are NOT locked.
  plannedReach: 5800,
  reachIsEstimated: true,
  includedRevisions: 1,
  reservationMinutes: 30,
} as const;
