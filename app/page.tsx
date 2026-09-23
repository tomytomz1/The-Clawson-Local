import Link from "next/link";
import { FaqList } from "@/components/marketing/faq-list";
import { ExclusivitySection } from "@/components/marketing/exclusivity-section";
import { HERO_PHOTO, HeroBackdrop } from "@/components/marketing/hero-backdrop";
import { MailerMockup } from "@/components/marketing/mailer-mockup";
import {
  AdDesignSection,
  CostPerResidenceSection,
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
import { ProgressMeter } from "@/components/inventory/progress-meter";
import { Section } from "@/components/ui/section";
import { postalRoutes } from "@/config/postal-routes";
import { formatCampaignPrice, getActiveCampaign, getPlannedReachPhrase } from "@/lib/campaign";
import { waitlistHref } from "@/lib/campaign/waitlist";
import { getFaq, KEY_FAQ_IDS } from "@/lib/campaign/faq";
import { getCampaignInventory } from "@/lib/inventory";
import { site } from "@/config/site";

const CHECK = "#availability";

export default async function HomePage() {
  const campaign = await getActiveCampaign();
  const { items, progress } = await getCampaignInventory(campaign);
  const price = formatCampaignPrice(campaign);
  const faq = getFaq(campaign).filter((f) => KEY_FAQ_IDS.includes(f.id));

  return (
    <>
      {/* 1. Hero */}
      <section aria-labelledby="hero-heading" className="relative isolate overflow-hidden bg-paper">
        <div className="container-page grid gap-12 py-10 sm:py-16 lg:grid-cols-[1.15fr_1fr] lg:items-center lg:gap-16 lg:py-20">
          <div>
            <p className="eyebrow">
              {campaign.campaignName.replace(/ Edition$/, ` ${campaign.marketName} Edition`)} • Category-exclusive
              local advertising
            </p>
            <h1 id="hero-heading" className="headline mt-4 text-5xl leading-[1.02] sm:text-6xl lg:text-7xl">
              Own your category in {campaign.marketName}.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-ink-soft sm:text-xl">
              Put your business on an oversized local mailer {getPlannedReachPhrase(campaign)}. One business per
              category. {price} one time. Ad design included.
            </p>
            <div className="mt-8 flex flex-col items-start gap-2">
              <Link href={CHECK} className="btn-primary text-lg">
                Check Your Category
              </Link>
              <p className="text-sm text-ink-muted">No sales call required.</p>
            </div>
            <ul className="mt-10 grid grid-cols-2 gap-x-6 gap-y-2 border-t border-ink pt-4 text-sm font-medium sm:flex sm:flex-wrap sm:gap-x-8">
              {["Secure checkout", "Ad design included", "Proof before print", "Mailing confirmation provided"].map(
                (t) => (
                  <li key={t} className="flex items-center gap-2">
                    <span aria-hidden="true" className="text-accent">
                      ✓
                    </span>
                    {t}
                  </li>
                ),
              )}
            </ul>
          </div>
          <MailerMockup campaign={campaign} slots={items.map((i) => i.category.displayName)} />
        </div>
        <HeroBackdrop />
      </section>

      <SharedCostSection campaign={campaign} ctaHref={CHECK} />
      <IncludesSection campaign={campaign} ctaHref={CHECK} />
      <CostPerResidenceSection campaign={campaign} />
      <ExclusivitySection campaign={campaign} items={items} progress={progress} />
      <AdDesignSection ctaHref={CHECK} />
      <HowItWorksSection campaign={campaign} />
      <FulfillmentSection campaign={campaign} />
      <RoiSection />
      <MultiChannelSection />
      <CoverageSection campaign={campaign} routes={postalRoutes} />
      <FounderSection />

      {/* 17. Real campaign progress (no testimonials until they exist) */}
      <section aria-label="Campaign progress" className="bg-paper-deep">
        <div className="container-page max-w-3xl border-t border-rule py-12">
          <ProgressMeter campaign={campaign} progress={progress} />
        </div>
      </section>

      <Section id="faq" title="Questions advertisers ask first.">
        <FaqList items={faq} />
        <p className="mt-6">
          <Link href="/faq" className="font-semibold text-accent underline underline-offset-4">
            Read the full FAQ
          </Link>
        </p>
      </Section>

      <FinalCtaSection campaign={campaign} ctaHref={CHECK} />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Organization",
            name: site.name,
            url: site.url,
            email: site.email.public,
            areaServed: {
              "@type": "City",
              name: `${campaign.marketName}, ${campaign.state}`,
              geo: { "@type": "GeoCoordinates", latitude: site.geo.latitude, longitude: site.geo.longitude },
            },
            image: {
              "@type": "ImageObject",
              contentUrl: new URL(HERO_PHOTO.path, site.url).toString(),
              description: HERO_PHOTO.description,
              creator: { "@type": "Person", name: HERO_PHOTO.author },
              creditText: `${HERO_PHOTO.author}, ${HERO_PHOTO.license}`,
              license: HERO_PHOTO.licenseUrl,
              isBasedOn: HERO_PHOTO.sourceUrl,
              contentLocation: {
                "@type": "Place",
                name: "Downtown Clawson, 14 Mile Road & Main Street",
                address: {
                  "@type": "PostalAddress",
                  addressLocality: "Clawson",
                  addressRegion: "MI",
                  postalCode: site.geo.postalCode,
                  addressCountry: "US",
                },
                geo: { "@type": "GeoCoordinates", latitude: site.geo.latitude, longitude: site.geo.longitude },
              },
            },
          }),
        }}
      />

      {progress.soldOut ? (
        <StickyCta
          label={`${campaign.campaignName} is full`}
          detail={`${progress.claimed} of ${progress.max} positions claimed`}
          href={waitlistHref(campaign)}
          action="Waitlist"
        />
      ) : (
        <StickyCta
          label={`${progress.remaining} of ${progress.max} positions open`}
          detail={`${price} one time • Ad design included`}
          href={CHECK}
          action="Check"
        />
      )}
    </>
  );
}
