import type { CampaignConfig, Category } from "@/types/campaign";

export function makeCampaign(overrides: Partial<CampaignConfig> = {}): CampaignConfig {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    slug: "clawson-founding-edition",
    brandName: "The Clawson Local",
    marketName: "Clawson",
    state: "Michigan",
    campaignName: "Founder’s Edition",
    status: "PRELAUNCH",
    priceCents: 35000,
    maxAdvertisers: 20,
    plannedReach: 5800,
    reachIsEstimated: true,
    verifiedReach: null,
    includedRevisions: 1,
    reservationMinutes: 30,
    salesOpenAt: null,
    salesCloseAt: "2026-12-01T04:59:59Z",
    assetDeadline: null,
    proofDeadline: null,
    printDate: null,
    mailingDate: null,
    outsideFulfillmentDate: "2027-02-28",
    ...overrides,
  };
}

export function makeCategory(slug: string, displayName: string, conflictKey = slug): Category {
  return {
    id: `id-${slug}`,
    slug,
    displayName,
    shortName: displayName.toLowerCase(),
    conflictKey,
    description: null,
    landingLine: null,
    priority: 1,
  };
}
