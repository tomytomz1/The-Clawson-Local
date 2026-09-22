import type { CampaignConfig } from "@/types/campaign";

const number = new Intl.NumberFormat("en-US");

/** "$350" — drops cents when whole dollars. */
export function formatCampaignPrice(campaign: CampaignConfig): string {
  return formatCents(campaign.priceCents);
}

export function formatCents(cents: number): string {
  const whole = cents % 100 === 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(cents / 100);
}

export function formatReachCount(campaign: CampaignConfig): string {
  return number.format(campaign.plannedReach);
}

/**
 * Qualified reach phrase for body copy.
 * Estimated: "approximately 5,800 Clawson residences"
 * Verified:  "5,812 Clawson residences"
 */
export function getReachLabel(
  campaign: CampaignConfig,
  opts: { market?: boolean } = {},
): string {
  const market = opts.market === false ? "" : `${campaign.marketName} `;
  const count = formatReachCount(campaign);
  return campaign.reachIsEstimated
    ? `approximately ${count} ${market}residences`
    : `${count} ${market}residences`;
}

/** "planned for approximately 5,800 Clawson residences" / "mailed to 5,812 …" */
export function getPlannedReachPhrase(campaign: CampaignConfig): string {
  return campaign.reachIsEstimated
    ? `planned for ${getReachLabel(campaign)}`
    : `delivered to ${getReachLabel(campaign)}`;
}

/** Word used with the per-residence figure: "planned" while estimated. */
export function getResidenceQualifier(campaign: CampaignConfig): string {
  return campaign.reachIsEstimated ? "planned residence" : "residence";
}

/** "About 6¢" — cost per residence derived from price and reach. */
export function getCostPerResidenceLabel(campaign: CampaignConfig): string {
  if (campaign.plannedReach <= 0) return "";
  const cents = campaign.priceCents / campaign.plannedReach;
  if (cents < 100) return `About ${Math.round(cents)}¢`;
  return `About ${formatCents(Math.round(cents))}`;
}

export function getEditionLabel(campaign: CampaignConfig): string {
  return `${campaign.marketName} ${campaign.campaignName}`;
}

export function formatRevisions(campaign: CampaignConfig): string {
  const n = campaign.includedRevisions;
  const words = ["no", "one", "two", "three"];
  const word = words[n] ?? String(n);
  return `${word} included revision${n === 1 ? "" : "s"}`;
}

/** Formats an ISO date or returns null when the value is still unknown. */
export function formatCampaignDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Detroit",
  });
}

export function isCheckoutOpen(campaign: CampaignConfig): boolean {
  return campaign.status === "OPEN";
}
