import type { Category } from "@/lib/categories";
import { getActiveCategories } from "@/lib/categories";
import type { CampaignConfig, InventoryStatus } from "@/types/campaign";

/** A sale or checkout hold against a conflict key. */
export type InventoryClaim = {
  conflictKey: string;
  kind: "SOLD" | "HELD";
  holdExpiresAt?: Date | null;
};

export type CategoryInventory = {
  category: Category;
  status: InventoryStatus;
};

export type CampaignProgress = {
  claimed: number;
  max: number;
  remaining: number;
  percent: number;
};

/**
 * Pure derivation of category status from real claims. The same function is
 * used once claims come from the database (Phase 2), so there is exactly one
 * place where status is decided.
 */
export function deriveInventory(
  campaign: CampaignConfig,
  categories: Category[],
  claims: InventoryClaim[],
  now: Date = new Date(),
): CategoryInventory[] {
  const sold = new Set(claims.filter((c) => c.kind === "SOLD").map((c) => c.conflictKey));
  const held = new Set(
    claims
      .filter((c) => c.kind === "HELD" && (!c.holdExpiresAt || c.holdExpiresAt > now))
      .map((c) => c.conflictKey),
  );
  const campaignClosed =
    campaign.status === "SOLD_OUT" ||
    campaign.status === "PRODUCTION" ||
    campaign.status === "MAILED" ||
    sold.size >= campaign.maxAdvertisers;

  return categories.map((category) => {
    let status: InventoryStatus;
    if (sold.has(category.conflictKey)) status = "SOLD";
    else if (campaignClosed || category.manuallyClosed) status = "CLOSED";
    else if (held.has(category.conflictKey)) status = "HELD";
    else status = "AVAILABLE";
    return { category, status };
  });
}

export function getCampaignProgress(
  campaign: CampaignConfig,
  paidAdvertisers: number,
): CampaignProgress {
  const max = campaign.maxAdvertisers;
  const claimed = Math.min(paidAdvertisers, max);
  return {
    claimed,
    max,
    remaining: max - claimed,
    percent: max > 0 ? Math.round((claimed / max) * 100) : 0,
  };
}

/**
 * Phase 1: no payment system exists yet, so there are no sales or holds.
 * Phase 2 replaces this with a database query for SOLD campaign_categories
 * and ACTIVE unexpired reservations.
 */
async function loadClaims(): Promise<InventoryClaim[]> {
  return [];
}

export async function getCampaignInventory(campaign: CampaignConfig) {
  const [categories, claims] = await Promise.all([getActiveCategories(), loadClaims()]);
  const items = deriveInventory(campaign, categories, claims);
  const paid = new Set(claims.filter((c) => c.kind === "SOLD").map((c) => c.conflictKey)).size;
  return { items, progress: getCampaignProgress(campaign, paid) };
}

export async function getCategoryStatus(
  campaign: CampaignConfig,
  slug: string,
): Promise<CategoryInventory | null> {
  const { items } = await getCampaignInventory(campaign);
  return items.find((i) => i.category.slug === slug) ?? null;
}

export function formatAvailability(status: InventoryStatus): string {
  switch (status) {
    case "AVAILABLE":
      return "Available";
    case "HELD":
      return "Checkout in progress";
    case "SOLD":
      return "Claimed";
    case "CLOSED":
      return "Closed";
  }
}
