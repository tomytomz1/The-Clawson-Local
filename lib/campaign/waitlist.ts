import { site } from "@/config/site";
import type { CampaignConfig } from "@/types/campaign";

/** Waitlist is email-based until the waitlist table ships with checkout. */
export function waitlistHref(campaign: CampaignConfig, categoryName?: string): string {
  const subject = `Waitlist: ${categoryName ? `${categoryName} — ` : ""}${campaign.brandName} ${campaign.campaignName}`;
  return `mailto:${site.email.public}?subject=${encodeURIComponent(subject)}`;
}
