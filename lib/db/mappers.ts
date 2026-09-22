import { site } from "@/config/site";
import type { CampaignConfig, CampaignStatus, Category, InventoryStatus } from "@/types/campaign";

/** Row shapes returned by Postgres/PostgREST. */
export type CampaignRow = {
  id: string;
  slug: string;
  name: string;
  market: string;
  state: string;
  status: CampaignStatus;
  is_active: boolean;
  price_cents: number;
  max_advertisers: number;
  planned_reach: number;
  reach_is_estimated: boolean;
  verified_reach: number | null;
  included_revisions: number;
  reservation_minutes: number;
  sales_open_at: string | null;
  sales_close_at: string | null;
  asset_deadline: string | null;
  proof_deadline: string | null;
  print_date: string | null;
  mailing_date: string | null;
  outside_fulfillment_date: string | null;
};

export type InventoryRow = {
  category_id: string;
  slug: string;
  display_name: string;
  short_name: string;
  conflict_key: string;
  description: string | null;
  landing_page_copy: string | null;
  priority: number;
  status: InventoryStatus;
};

export const CAMPAIGN_COLUMNS =
  "id, slug, name, market, state, status, is_active, price_cents, max_advertisers, planned_reach, reach_is_estimated, verified_reach, included_revisions, reservation_minutes, sales_open_at, sales_close_at, asset_deadline, proof_deadline, print_date, mailing_date, outside_fulfillment_date";

export function mapCampaign(row: CampaignRow): CampaignConfig {
  return {
    id: row.id,
    slug: row.slug,
    brandName: site.name,
    marketName: row.market,
    state: row.state,
    campaignName: row.name,
    status: row.status,
    priceCents: row.price_cents,
    maxAdvertisers: row.max_advertisers,
    plannedReach: row.planned_reach,
    reachIsEstimated: row.reach_is_estimated,
    verifiedReach: row.verified_reach,
    includedRevisions: row.included_revisions,
    reservationMinutes: row.reservation_minutes,
    salesOpenAt: row.sales_open_at,
    salesCloseAt: row.sales_close_at,
    assetDeadline: row.asset_deadline,
    proofDeadline: row.proof_deadline,
    printDate: row.print_date,
    mailingDate: row.mailing_date,
    outsideFulfillmentDate: row.outside_fulfillment_date,
  };
}

export function mapInventoryCategory(row: InventoryRow): Category {
  return {
    id: row.category_id,
    slug: row.slug,
    displayName: row.display_name,
    shortName: row.short_name,
    conflictKey: row.conflict_key,
    description: row.description,
    landingLine: row.landing_page_copy,
    priority: row.priority,
  };
}
