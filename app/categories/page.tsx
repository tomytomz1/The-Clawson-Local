import type { Metadata } from "next";
import { InventoryTable } from "@/components/inventory/inventory-table";
import { ProgressMeter } from "@/components/inventory/progress-meter";
import { PageHeader } from "@/components/ui/page-header";
import { formatCampaignPrice, getActiveCampaign } from "@/lib/campaign";
import { getCampaignInventory } from "@/lib/inventory";

export const metadata: Metadata = {
  title: "Advertiser Categories",
  description: "Live category availability for The Clawson Local Founding Edition. One business per category.",
  alternates: { canonical: "/categories" },
};

export default async function CategoriesPage() {
  const campaign = await getActiveCampaign();
  const { items, progress } = await getCampaignInventory(campaign);
  return (
    <>
      <PageHeader eyebrow={`${campaign.brandName} • ${campaign.campaignName}`} title="Check your category.">
        <p>
          One business per category. {formatCampaignPrice(campaign)} one time. Ad design included. Payment, not a form
          submission, secures the category.
        </p>
      </PageHeader>
      <div className="container-page pb-16">
        <div className="mb-8 max-w-sm">
          <ProgressMeter campaign={campaign} progress={progress} />
        </div>
        <InventoryTable campaign={campaign} items={items} initialCount={items.length} />
        <p className="mt-4 text-sm text-ink-muted">
          Related services that directly compete are grouped into one category, so exclusivity covers them too.
          Don&apos;t see your category? Email us and we&apos;ll tell you whether it can be added.
        </p>
      </div>
    </>
  );
}
