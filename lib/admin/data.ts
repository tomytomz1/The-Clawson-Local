import "server-only";
import { CAMPAIGN_COLUMNS, mapCampaign, type CampaignRow, type InventoryRow } from "@/lib/db/mappers";
import { getAdminClient } from "@/lib/db/supabase";
import { getCampaignProgress } from "@/lib/inventory/progress";
import type { CampaignConfig, InventoryStatus } from "@/types/campaign";

export type AdminCategoryRow = {
  categoryId: string;
  slug: string;
  displayName: string;
  conflictKey: string;
  aliases: string[];
  priority: number;
  active: boolean;
  storedStatus: InventoryStatus | null;
  manuallyClosed: boolean;
  holdExpiresAt: string | null;
  soldAt: string | null;
  /** Public status from campaign_inventory(); null when the category is inactive. */
  effectiveStatus: InventoryStatus | null;
};

type CategoryDbRow = {
  id: string;
  slug: string;
  display_name: string;
  conflict_key: string;
  aliases: string[];
  priority: number;
  active: boolean;
};

type CampaignCategoryDbRow = {
  category_id: string;
  status: InventoryStatus;
  manually_closed: boolean;
  hold_expires_at: string | null;
  sold_at: string | null;
};

export async function getAdminCampaign(): Promise<CampaignConfig | null> {
  const { data, error } = await getAdminClient()
    .from("campaigns")
    .select(CAMPAIGN_COLUMNS)
    .eq("is_active", true)
    .maybeSingle<CampaignRow>();
  if (error) throw error;
  return data ? mapCampaign(data) : null;
}

export async function getAdminInventory(campaign: CampaignConfig) {
  const db = getAdminClient();
  const [cats, inv, eff, sold] = await Promise.all([
    db.from("categories").select("id, slug, display_name, conflict_key, aliases, priority, active").order("priority"),
    db
      .from("campaign_categories")
      .select("category_id, status, manually_closed, hold_expires_at, sold_at")
      .eq("campaign_id", campaign.id),
    db.rpc("campaign_inventory", { p_campaign_id: campaign.id }),
    db.rpc("campaign_sold_count", { p_campaign_id: campaign.id }),
  ]);
  for (const r of [cats, inv, eff, sold]) if (r.error) throw r.error;

  const invBy = new Map(((inv.data ?? []) as CampaignCategoryDbRow[]).map((r) => [r.category_id, r]));
  const effBy = new Map(((eff.data ?? []) as InventoryRow[]).map((r) => [r.category_id, r.status]));

  const rows: AdminCategoryRow[] = ((cats.data ?? []) as CategoryDbRow[]).map((c) => {
    const i = invBy.get(c.id);
    return {
      categoryId: c.id,
      slug: c.slug,
      displayName: c.display_name,
      conflictKey: c.conflict_key,
      aliases: c.aliases,
      priority: c.priority,
      active: c.active,
      storedStatus: i?.status ?? null,
      manuallyClosed: i?.manually_closed ?? false,
      holdExpiresAt: i?.hold_expires_at ?? null,
      soldAt: i?.sold_at ?? null,
      effectiveStatus: effBy.get(c.id) ?? null,
    };
  });

  const soldCount = Number(sold.data ?? 0);
  return { rows, soldCount, progress: getCampaignProgress(campaign, soldCount) };
}
