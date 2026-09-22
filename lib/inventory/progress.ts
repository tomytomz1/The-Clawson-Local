import type { CampaignConfig, Category, InventoryStatus } from "@/types/campaign";

export type CategoryInventory = {
  category: Category;
  status: InventoryStatus;
};

export type CampaignProgress = {
  claimed: number;
  max: number;
  remaining: number;
  percent: number;
  soldOut: boolean;
};

/**
 * Progress is paid advertisers / max advertisers — never categories sold /
 * total categories. The category pool is intentionally larger than the
 * number of positions.
 */
export function getCampaignProgress(campaign: CampaignConfig, paidAdvertisers: number): CampaignProgress {
  const max = campaign.maxAdvertisers;
  const claimed = Math.max(0, Math.min(paidAdvertisers, max));
  return {
    claimed,
    max,
    remaining: max - claimed,
    percent: max > 0 ? Math.round((claimed / max) * 100) : 0,
    soldOut: claimed >= max || campaign.status === "SOLD_OUT",
  };
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
