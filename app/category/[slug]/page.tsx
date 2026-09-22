import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ClaimPanel } from "@/components/inventory/claim-panel";
import { FaqList } from "@/components/marketing/faq-list";
import { MailerMockup } from "@/components/marketing/mailer-mockup";
import {
  AdDesignSection,
  CoverageSection,
  FinalCtaSection,
  FounderSection,
  FulfillmentSection,
  HowItWorksSection,
  IncludesSection,
  MultiChannelSection,
  RoiSection,
  SharedCostSection,
} from "@/components/marketing/sections";
import { StickyCta } from "@/components/marketing/sticky-cta";
import { Section } from "@/components/ui/section";
import { postalRoutes } from "@/config/postal-routes";
import { formatCampaignPrice, getActiveCampaign, getPlannedReachPhrase } from "@/lib/campaign";
import { getFaq, KEY_FAQ_IDS } from "@/lib/campaign/faq";
import { getCategoryLandingLine } from "@/lib/categories";
import { formatAvailability, getCampaignInventory, getCategoryBySlug } from "@/lib/inventory";

export async function generateMetadata({ params }: PageProps<"/category/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const campaign = await getActiveCampaign();
  const category = await getCategoryBySlug(campaign, slug);
  if (!category) return {};
  return {
    title: { absolute: `${campaign.marketName} ${category.displayName} Advertising | ${campaign.brandName}` },
    description: `Category-exclusive ${category.displayName} advertising on ${campaign.brandName} ${campaign.campaignName}, ${getPlannedReachPhrase(campaign)}. ${formatCampaignPrice(campaign)} one time, ad design included.`,
    alternates: { canonical: `/category/${category.slug}` },
  };
}

export default async function CategoryPage({ params }: PageProps<"/category/[slug]">) {
  const { slug } = await params;
  const campaign = await getActiveCampaign();
  // Inactive or unknown categories are not in the inventory => 404.
  const { items } = await getCampaignInventory(campaign);
  const item = items.find((i) => i.category.slug === slug);
  if (!item) notFound();
  const { category } = item;

  const name = category.displayName;
  const price = formatCampaignPrice(campaign);
  const faq = getFaq(campaign).filter((f) => KEY_FAQ_IDS.includes(f.id));
  const slots = [name, ...items.map((i) => i.category.displayName).filter((n) => n !== name)];
  const claimable = item.status === "AVAILABLE";

  return (
    <>
      <section aria-labelledby="category-heading" className="bg-paper">
        <div className="container-page grid gap-10 py-8 sm:py-14 lg:grid-cols-[1.25fr_1fr] lg:gap-14">
          <div>
            <p className="eyebrow">
              {campaign.brandName} • {campaign.campaignName}
            </p>
            <h1 id="category-heading" className="headline mt-3 text-[2.1rem] leading-[1.05] sm:text-5xl lg:text-6xl">
              Be the only {name} business on the {campaign.marketName} {campaign.campaignName}.
            </h1>
            <p className="mt-5 max-w-xl font-serif text-xl text-ink-soft italic sm:text-2xl">
              {getCategoryLandingLine(category, campaign.marketName)}
            </p>
            <p className="mt-5 max-w-xl text-lg text-ink-soft">
              {campaign.brandName} is an oversized local mailer {getPlannedReachPhrase(campaign)}, shared by a
              limited group of non-competing businesses. One business per category. {price} one time. Ad design
              included.
            </p>
            <div className="mt-8 hidden lg:block">
              <MailerMockup campaign={campaign} slots={slots} highlight={name} />
            </div>
          </div>
          <div className="lg:pt-2">
            <div className="lg:sticky lg:top-24">
              <ClaimPanel campaign={campaign} item={item} />
            </div>
          </div>
        </div>
      </section>

      <SharedCostSection campaign={campaign} ctaHref="#claim" />
      <IncludesSection campaign={campaign} ctaHref="#claim" />
      <AdDesignSection ctaHref="#claim" />
      <HowItWorksSection campaign={campaign} />
      <FulfillmentSection campaign={campaign} />
      <RoiSection />
      <MultiChannelSection />
      <CoverageSection campaign={campaign} routes={postalRoutes} />
      <FounderSection />

      <Section id="faq" title="Questions advertisers ask first.">
        <FaqList items={faq} />
      </Section>

      <FinalCtaSection
        campaign={campaign}
        ctaHref="#claim"
        ctaLabel={claimable ? `Claim ${name}` : "Join Waitlist"}
      />

      <StickyCta
        label={`${name}: ${formatAvailability(item.status)}`}
        detail={claimable ? `${price} one time` : undefined}
        href={item.status === "SOLD" || item.status === "CLOSED" ? "#waitlist" : "#claim"}
        action={claimable ? "Claim" : item.status === "HELD" ? "Details" : "Join waitlist"}
      />
    </>
  );
}
