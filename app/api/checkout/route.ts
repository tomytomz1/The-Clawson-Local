import { getActiveCampaign, isCheckoutOpen } from "@/lib/campaign";
import { getCampaignInventory } from "@/lib/inventory";
import { handleClaim } from "@/lib/checkout/claim";
import { serverRpc, stripeGateway } from "@/lib/checkout/server";
import { isStripeCheckoutEnabled } from "@/lib/stripe/config";

/**
 * "Claim for $350": hold the category in the database (behind the abuse
 * guard), then send the buyer to Stripe Checkout. See lib/checkout/claim.ts.
 */
export async function POST(request: Request) {
  return handleClaim(request, {
    rpc: serverRpc(),
    stripe: stripeGateway,
    checkoutEnabled: isStripeCheckoutEnabled(),
    abuseSecret: process.env.HOLD_ABUSE_SECRET,
    lookupCategory: async (slug) => {
      const campaign = await getActiveCampaign();
      // Fail closed if the customer-facing sales cutoff and outside
      // fulfillment date are missing, invalid or already passed.
      if (!isCheckoutOpen(campaign)) return null;
      const { items } = await getCampaignInventory(campaign);
      const item = items.find((i) => i.category.slug === slug);
      return item ? { campaignId: campaign.id, categoryId: item.category.id, brandName: campaign.brandName } : null;
    },
  });
}
