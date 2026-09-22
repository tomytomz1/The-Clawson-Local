import { site } from "@/config/site";
import { formatCampaignPrice, isCheckoutOpen } from "@/lib/campaign";
import type { CategoryInventory } from "@/lib/inventory";
import type { CampaignConfig } from "@/types/campaign";
import { StatusBadge } from "./status-badge";

function waitlistHref(name: string, campaign: CampaignConfig) {
  const subject = `Waitlist: ${name} — ${campaign.brandName} ${campaign.campaignName}`;
  return `mailto:${site.email.public}?subject=${encodeURIComponent(subject)}`;
}

/**
 * Above-the-fold purchase box for a category page. Status comes from the
 * inventory layer; the checkout form (terms acceptance + Stripe redirect) is
 * wired in Phase 3.
 */
export function ClaimPanel({ campaign, item }: { campaign: CampaignConfig; item: CategoryInventory }) {
  const { category, status } = item;
  const name = category.displayName;
  const price = formatCampaignPrice(campaign);
  const count = campaign.plannedReach.toLocaleString("en-US");
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
        {status === "SOLD" && (
          <p className="mb-4 font-serif text-2xl font-semibold">{name} has been claimed.</p>
        )}
        {status === "CLOSED" && (
          <p className="mb-4 font-serif text-2xl font-semibold">{name} is closed for this edition.</p>
        )}
        {status === "HELD" && (
          <p className="mb-4 text-ink-soft">
            Another business is completing checkout for this category. If checkout isn&apos;t completed within{" "}
            {campaign.reservationMinutes} minutes, it becomes available again.
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
          {/* Phase 3 adds the terms-acceptance form that starts Stripe Checkout when OPEN. */}
          {status === "AVAILABLE" && (
            <>
              <button type="button" className="btn-primary w-full" disabled aria-describedby="checkout-note">
                Claim {name}
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
            <a id="waitlist" href={waitlistHref(name, campaign)} className="btn-secondary w-full">
              Join Waitlist
            </a>
          )}
          {status === "HELD" && (
            <p className="text-sm font-semibold text-warn">Checkout in progress</p>
          )}
        </div>
        {status === "AVAILABLE" && (
          <p className="mt-3 text-center text-xs text-ink-muted">No sales call required.</p>
        )}
      </div>
    </div>
  );
}
