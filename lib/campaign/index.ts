import "server-only";
import { connection } from "next/server";
import { cache } from "react";
import { CAMPAIGN_COLUMNS, mapCampaign, type CampaignRow } from "@/lib/db/mappers";
import { DataUnavailableError, getPublicClient } from "@/lib/db/supabase";
import type { CampaignConfig } from "@/types/campaign";

export * from "./format";

/**
 * The campaign the public site is selling, read from the database on every
 * request. Throws DataUnavailableError (rendered by app/error.tsx) rather than
 * falling back to static values: stale campaign data must never drive sales.
 */
export const getActiveCampaign = cache(async (): Promise<CampaignConfig> => {
  await connection();
  try {
    const { data, error } = await getPublicClient()
      .from("campaigns")
      .select(CAMPAIGN_COLUMNS)
      .eq("is_active", true)
      .maybeSingle<CampaignRow>();
    if (error) throw error;
    if (!data) throw new DataUnavailableError("No active campaign");
    return mapCampaign(data);
  } catch (err) {
    console.error("[data] getActiveCampaign failed", err);
    throw err instanceof DataUnavailableError
      ? err
      : new DataUnavailableError("Campaign data unavailable", { cause: err });
  }
});
