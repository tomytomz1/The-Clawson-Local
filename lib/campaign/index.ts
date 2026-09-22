import { campaign as campaignConfig } from "@/config/campaign";
import type { CampaignConfig } from "@/types/campaign";

export * from "./format";

/**
 * Returns the active campaign. Phase 1 reads static config; Phase 2 reads
 * the `campaigns` table and falls back to config.
 */
export async function getActiveCampaign(): Promise<CampaignConfig> {
  return campaignConfig;
}
