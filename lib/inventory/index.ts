import "server-only";
import { connection } from "next/server";
import { cache } from "react";
import { mapInventoryCategory, type InventoryRow } from "@/lib/db/mappers";
import { DataUnavailableError, getPublicClient } from "@/lib/db/supabase";
import type { CampaignConfig, Category } from "@/types/campaign";
import { getCampaignProgress, type CampaignProgress, type CategoryInventory } from "./progress";

export * from "./progress";

export type CampaignInventory = {
  items: CategoryInventory[];
  progress: CampaignProgress;
};

/**
 * Live inventory for a campaign. Status is derived in Postgres
 * (campaign_inventory()) — conflict groups, expired holds, sold-out and
 * manual closure — so the app never decides availability itself.
 * Throws on failure; there is no fallback inventory.
 */
export const getCampaignInventory = cache(async (campaign: CampaignConfig): Promise<CampaignInventory> => {
  await connection();
  try {
    const db = getPublicClient();
    const [inv, sold] = await Promise.all([
      db.rpc("campaign_inventory", { p_campaign_id: campaign.id }),
      db.rpc("campaign_sold_count", { p_campaign_id: campaign.id }),
    ]);
    if (inv.error) throw inv.error;
    if (sold.error) throw sold.error;
    const items = ((inv.data ?? []) as InventoryRow[]).map((row) => ({ category: mapInventoryCategory(row), status: row.status }));
    return { items, progress: getCampaignProgress(campaign, Number(sold.data ?? 0)) };
  } catch (err) {
    console.error("[data] getCampaignInventory failed", err);
    throw new DataUnavailableError("Inventory unavailable", { cause: err });
  }
});

/** Active category + live status by slug, or null (inactive/unknown => 404). */
export async function getCategoryAvailability(
  campaign: CampaignConfig,
  slug: string,
): Promise<CategoryInventory | null> {
  const { items } = await getCampaignInventory(campaign);
  return items.find((i) => i.category.slug === slug) ?? null;
}

export async function getCategoryBySlug(campaign: CampaignConfig, slug: string): Promise<Category | null> {
  return (await getCategoryAvailability(campaign, slug))?.category ?? null;
}
