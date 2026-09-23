import { site } from "@/config/site";
import { formatCampaignPrice, formatReachCount, isCheckoutOpen } from "@/lib/campaign/format";
import type { CategoryInventory } from "@/lib/inventory/progress";
import type { CampaignConfig } from "@/types/campaign";
import { waitlistHref } from "@/lib/campaign/waitlist";
import { StatusBadge } from "./status-badge";

const CHECKOUT_MESSAGES: Record<string, string> = {
  category_held: "Another business started checkout for this category a moment ago. It is temporarily held.",
  category_sold: "This category was just claimed.",
  category_closed: "This category is closed for this edition.",
  campaign_full: "All positions in this edition are claimed or being checked out right now.",
  campaign_not_open: "Online checkout for this edition is not open.",
  category_not_found: "This category is not available.",
  unavailable: "Online checkout is not available right now. Please email us to claim this category.",
  checkout_failed: "We couldn't start checkout. Nothing was charged and the category was not held. Please try again.",
  active_hold: "You already have an active checkout hold. Complete or cancel that checkout before claiming another category.",
};

/**
 * Above-the-fold purchase box for a category page. Status comes from the
 * database (campaign_inventory); it is never updated optimistically. "Claim"
 * posts to /api/checkout, which holds the category and redirects to Stripe.
 */
export function ClaimPanel({
  campaign,
  item,
  checkoutEnabled = false,
  checkoutError,
  activeHoldId,
}: {
  campaign: CampaignConfig;
  item: CategoryInventory;
  checkoutEnabled?: boolean;
  checkoutError?: string;
  /** The buyer's own active reservation, when checkoutError is "active_hold". */
  activeHoldId?: string;
}) {
  const { category, status } = item;
  const name = category.displayName;
  const price = formatCampaignPrice(campaign);
  const count = formatReachCount(campaign);
  const facts = [
    `${price} one time`,
    campaign.reachIsEstimated ? `Approximately ${count} planned residences` : `${count} residences`,
    "Ad design included",
    "Category exclusive",
    "No recurring charge",
  ];

  return (
    <div id="claim" className="border-2 border-ink bg-card shadow-[6px_6px_0_0_rgba(27,26,23,0.9)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink px-5 py-3">
        <p className="text-sm font-bold tracking-wider uppercase">{name} status</p>
        <StatusBadge status={status} />
      </div>
      <div className="p-5 sm:p-6">
        {checkoutError && CHECKOUT_MESSAGES[checkoutError] && (
          <p role="alert" className="mb-4 border-l-4 border-warn bg-warn-tint px-3 py-2 text-sm font-medium">
            {CHECKOUT_MESSAGES[checkoutError]}
            {checkoutError === "active_hold" && activeHoldId && (
              <>
                {" "}
                <a href={`/checkout/cancel?reservation=${activeHoldId}`} className="underline underline-offset-2">
                  View your checkout
                </a>
              </>
            )}
          </p>
        )}
        {status === "SOLD" && (
          <p className="mb-4 font-serif text-2xl font-semibold">{name} has been claimed.</p>
        )}
        {status === "CLOSED" && (
          <p className="mb-4 font-serif text-2xl font-semibold">{name} is closed for this edition.</p>
        )}
        {status === "HELD" && (
          <p className="mb-4 text-ink-soft">
            {name} is temporarily held: another advertiser is currently checking out. If they don&apos;t complete
            payment within about {campaign.reservationMinutes} minutes, it becomes available again.
          </p>
        )}

        <ul className="space-y-2">
          {facts.map((f, i) => (
            <li key={f} className={`flex gap-3 ${i === 0 ? "font-serif text-3xl font-bold" : ""}`}>
              {i > 0 && (
                <span aria-hidden="true" className="font-bold text-accent">
                  ✓
                </span>
              )}
              <span>{f}</span>
            </li>
          ))}
        </ul>

        <div className="mt-6">
          {status === "AVAILABLE" && checkoutEnabled && isCheckoutOpen(campaign) && (
            <form action="/api/checkout" method="post">
              <input type="hidden" name="category" value={category.slug} />
              <button type="submit" className="btn-primary w-full" aria-describedby="checkout-note">
                Claim for {price}
              </button>
              <p id="checkout-note" className="mt-3 text-sm text-ink-soft">
                Secure checkout by Stripe. {name} is held for you for about {campaign.reservationMinutes} minutes
                while you pay; it is yours once payment is confirmed.
              </p>
            </form>
          )}
          {status === "AVAILABLE" && !(checkoutEnabled && isCheckoutOpen(campaign)) && (
            <>
              <button type="button" className="btn-primary w-full" disabled aria-describedby="checkout-note">
                Claim for {price}
              </button>
              <p id="checkout-note" className="mt-3 text-sm text-ink-soft">
                {isCheckoutOpen(campaign)
                  ? "Secure online checkout is being connected."
                  : `Online checkout for the ${campaign.campaignName} opens soon.`}{" "}
                Payment secures the category, so categories are not held before then. Questions?{" "}
                <a href={`mailto:${site.email.public}`} className="text-accent underline underline-offset-4">
                  {site.email.public}
                </a>
              </p>
            </>
          )}
          {(status === "SOLD" || status === "CLOSED") && (
            <a id="waitlist" href={waitlistHref(campaign, name)} className="btn-secondary w-full">
              Join Waitlist
            </a>
          )}
          {status === "HELD" && (
            <p className="text-sm font-semibold text-warn">Temporarily held — check back soon</p>
          )}
        </div>
        {status === "AVAILABLE" && (
          <p className="mt-3 text-center text-xs text-ink-muted">No sales call required.</p>
        )}
      </div>
    </div>
  );
}
