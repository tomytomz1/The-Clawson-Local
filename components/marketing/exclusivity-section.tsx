import { InventoryTable } from "@/components/inventory/inventory-table";
import { ProgressMeter } from "@/components/inventory/progress-meter";
import { Section } from "@/components/ui/section";
import type { CampaignProgress, CategoryInventory } from "@/lib/inventory";
import type { CampaignConfig } from "@/types/campaign";

/** Section 5: exclusivity explanation + live inventory from the data layer. */
export function ExclusivitySection({
  campaign,
  items,
  progress,
}: {
  campaign: CampaignConfig;
  items: CategoryInventory[];
  progress: CampaignProgress;
}) {
  return (
    <Section id="availability" title="Your competitor can't buy the spot after you do.">
      <div className="grid gap-10 md:grid-cols-[1fr_18rem] md:items-end">
        <div className="prose-body max-w-2xl text-lg text-ink-soft">
          <p>{campaign.brandName} accepts one business from each category per edition.</p>
          <p>If Plumbing is claimed, another plumbing company cannot appear on the same edition.</p>
          <p className="font-semibold text-ink">Payment, not a form submission, secures the category.</p>
        </div>
        <ProgressMeter campaign={campaign} progress={progress} />
      </div>
      <div className="mt-10">
        <InventoryTable campaign={campaign} items={items} />
      </div>
      {campaign.status === "PRELAUNCH" && (
        <p className="mt-4 text-sm text-ink-muted">
          Online checkout for the {campaign.campaignName} is not open yet. Categories are not held before payment.
        </p>
      )}
    </Section>
  );
}
