export type CampaignStatus =
  | "PRELAUNCH"
  | "OPEN"
  | "SOLD_OUT"
  | "PRODUCTION"
  | "MAILED";

export type CampaignConfig = {
  id: string;
  slug: string;
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
