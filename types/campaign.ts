export type CampaignStatus =
  | "PRELAUNCH"
  | "OPEN"
  | "SOLD_OUT"
  | "PRODUCTION"
  | "MAILED";

export const CAMPAIGN_STATUSES: CampaignStatus[] = ["PRELAUNCH", "OPEN", "SOLD_OUT", "PRODUCTION", "MAILED"];

/** Campaign as the application sees it. Loaded from the `campaigns` table. */
export type CampaignConfig = {
  id: string;
  slug: string;
  /** From static site config (brand is not per-campaign). */
  brandName: string;
  marketName: string;
  state: string;
  campaignName: string;
  status: CampaignStatus;
  priceCents: number;
  maxAdvertisers: number;
  /** Planning number until USPS carrier routes are locked. */
  plannedReach: number;
  /** When false, copy switches from "approximately" to the verified count. */
  reachIsEstimated: boolean;
  /** Verified delivery count; set once routes are locked. */
  verifiedReach: number | null;
  includedRevisions: number;
  reservationMinutes: number;
  /** Unknown values stay null until confirmed. Never invent them. */
  salesOpenAt: string | null;
  salesCloseAt: string | null;
  assetDeadline: string | null;
  proofDeadline: string | null;
  printDate: string | null;
  mailingDate: string | null;
  outsideFulfillmentDate: string | null;
};

export type InventoryStatus = "AVAILABLE" | "HELD" | "SOLD" | "CLOSED";

export type Category = {
  id: string;
  slug: string;
  displayName: string;
  /** Lower-case name used inside sentences, e.g. "plumbing". */
  shortName: string;
  conflictKey: string;
  description: string | null;
  /** Category-specific landing line. Null uses the shared template line. */
  landingLine: string | null;
  priority: number;
};

export type PostalRoute = {
  routeId: string;
  campaignId: string;
  routeCode: string;
  zipCode: string;
  residentialCount: number;
  businessCount: number;
  totalCount: number;
  selected: boolean;
};
