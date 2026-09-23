import { NextResponse } from "next/server";
import { getActiveCampaign } from "@/lib/campaign";
import { getCampaignInventory } from "@/lib/inventory";
import { isSameOrigin, serverRpc, stripeGateway } from "@/lib/checkout/server";
import { CheckoutError, startCheckout } from "@/lib/checkout/start";
import { isStripeCheckoutEnabled } from "@/lib/stripe/config";

const TERMS_URL = "https://theclawsonlocal.com/terms";

/**
 * "Claim for $350": hold the category in the database, then send the buyer to
 * Stripe Checkout. The only input is the category slug; price, campaign and
 * everything Stripe sees come from the database.
 */
export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  const form = await request.formData().catch(() => null);
  const slug = String(form?.get("category") ?? "");
  const back = (code: string) =>
    NextResponse.redirect(`${origin}/category/${encodeURIComponent(slug)}?checkout=${code}#claim`, 303);

  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  if (!isStripeCheckoutEnabled()) return back("unavailable");

  try {
    const campaign = await getActiveCampaign();
    const { items } = await getCampaignInventory(campaign);
    const item = items.find((i) => i.category.slug === slug);
    if (!item) return back("category_not_found");

    const result = await startCheckout(
      { campaignId: campaign.id, categoryId: item.category.id, brandName: campaign.brandName, origin, termsUrl: TERMS_URL },
      { rpc: serverRpc(), stripe: stripeGateway() },
    );
    return NextResponse.redirect(result.url, 303);
  } catch (err) {
    if (err instanceof CheckoutError) {
      if (err.code === "checkout_failed") console.error("[checkout] could not start checkout", err.cause);
      return back(err.code);
    }
    console.error("[checkout] unexpected error", err);
    return back("checkout_failed");
  }
}
