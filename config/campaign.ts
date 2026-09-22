import type { CampaignConfig } from "@/types/campaign";

/**
 * Single source of truth for the current campaign offer.
 *
 * Marketing components must read these values through the helpers in
 * `lib/campaign` rather than hard-coding prices, counts or dates.
 *
 * Phase 2 moves this into the `campaigns` table; this object then becomes
 * the seed / fallback.
 */
export const campaign: CampaignConfig = {
  id: "clawson-founding-edition",
  slug: "founding-edition",
  brandName: "The Clawson Local",
  marketName: "Clawson",
  state: "Michigan",
  campaignName: "Founding Edition",

  // Online checkout is not live yet. Switch to "OPEN" once Stripe checkout ships.
  status: "PRELAUNCH",

  priceCents: 35000,
  maxAdvertisers: 20,

  // Approximate planning number. Final USPS carrier routes are NOT locked.
  plannedReach: 5800,
  reachIsEstimated: true,

  includedRevisions: 1,
  reservationMinutes: 30,

  // ---- UNKNOWN: fill in only once confirmed ----
  salesOpenAt: null,
  salesCloseAt: null, // FINAL SALES DEADLINE
  assetDeadline: null, // FINAL ASSET DEADLINE
  proofDeadline: null, // FINAL PROOF DEADLINE
  printDate: null, // FINAL PRINT DATE
  mailingDate: null, // FINAL MAILING DATE
  outsideFulfillmentDate: null, // FINAL OUTSIDE FULFILLMENT DATE
};
