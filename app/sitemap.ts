import type { MetadataRoute } from "next";
import { site } from "@/config/site";
import { getActiveCampaign } from "@/lib/campaign";
import { getCampaignInventory } from "@/lib/inventory";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = ["", "/categories", "/faq", "/about", "/contact", "/terms", "/privacy"].map((p) => ({
    url: `${site.url}${p}`,
  }));
  try {
    const campaign = await getActiveCampaign();
    const { items } = await getCampaignInventory(campaign);
    return [...pages, ...items.map((i) => ({ url: `${site.url}/category/${i.category.slug}` }))];
  } catch {
    // Already logged by the data layer; still serve the static pages.
    return pages;
  }
}
