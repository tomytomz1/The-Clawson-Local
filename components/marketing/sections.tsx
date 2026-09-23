/**
 * Shared conversion sections used by the homepage and every category page.
 * Copy follows the product spec; all prices, counts and dates come from the
 * campaign config through lib/campaign helpers.
 */
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { Section } from "@/components/ui/section";
import { site } from "@/config/site";
import founderPhoto from "@/public/images/founder-tomas.webp";
import {
  formatCampaignDate,
  formatCampaignPrice,
  formatRevisions,
  getCostPerResidenceLabel,
  getReachLabel,
  getResidenceQualifier,
} from "@/lib/campaign/format";
import type { CampaignConfig, PostalRoute } from "@/types/campaign";

type P = { campaign: CampaignConfig };

function Check() {
  return (
    <span aria-hidden="true" className="mt-0.5 font-bold text-accent">
      ✓
    </span>
  );
}

function CtaRow({ href, label, note }: { href: string; label: string; note?: ReactNode }) {
  return (
    <div className="mt-10 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-5">
      <Link href={href} className="btn-primary">
        {label}
      </Link>
      {note && <p className="text-sm text-ink-muted">{note}</p>}
    </div>
  );
}

/* ---------- 2. Shared-cost economics ---------- */
export function SharedCostSection({ campaign, ctaHref }: P & { ctaHref: string }) {
  const reachSentence = campaign.reachIsEstimated
    ? `Planned distribution across ${getReachLabel(campaign)}.`
    : `Distribution across ${getReachLabel(campaign)}.`;
  const cols = [
    { h: "Local", t: reachSentence },
    { h: "Exclusive", t: "One business per category on each edition." },
    { h: "Simple", t: "You send us your information. We handle the ad, printing and mailing." },
  ];
  return (
    <Section id="shared-cost" title="Be seen locally without paying for the entire mailing yourself.">
      <div className="prose-body max-w-2xl text-lg text-ink-soft">
        <p>A large direct-mail campaign gets expensive when one business pays for the printing and mailing alone.</p>
        <p>
          {campaign.brandName} splits those costs across a limited group of non-competing businesses.
        </p>
        <p>
          You get your own placement, local household visibility and exclusive ownership of your category on the
          edition without funding the entire mailer yourself.
        </p>
      </div>
      <div className="mt-10 grid gap-px border-y-2 border-ink bg-rule sm:grid-cols-3">
        {cols.map((c) => (
          <div key={c.h} className="bg-paper py-6 sm:px-6 sm:first:pl-0">
            <h3 className="text-sm font-bold tracking-[0.14em] text-accent uppercase">{c.h}</h3>
            <p className="mt-2 font-serif text-xl leading-snug">{c.t}</p>
          </div>
        ))}
      </div>
      <CtaRow href={ctaHref} label="Check Availability" />
    </Section>
  );
}

/* ---------- 3. What the price includes ---------- */
export function IncludesSection({ campaign, ctaHref }: P & { ctaHref: string }) {
  const price = formatCampaignPrice(campaign);
  const reachItem = campaign.reachIsEstimated
    ? `planned distribution to ${getReachLabel(campaign)}`
    : `distribution to ${getReachLabel(campaign)}`;
  const items = [
    "one category-exclusive advertising placement",
    reachItem,
    "ad layout/design using the advertiser's supplied assets",
    "digital proof before printing",
    formatRevisions(campaign),
    "tracked QR destination if requested",
    "printing",
    "mailing",
    "mailing confirmation",
    "no long-term contract",
    "no recurring charge",
  ];
  return (
    <Section id="whats-included" tone="deep" title="One payment. We handle the rest.">
      <div className="grid gap-10 md:grid-cols-[minmax(0,18rem)_1fr] md:gap-16">
        <div className="border-y-2 border-ink py-6">
          <p className="font-serif text-6xl font-bold tracking-tight sm:text-7xl">{price}</p>
          <p className="mt-2 text-ink-soft">one-time {campaign.campaignName} placement</p>
        </div>
        <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {items.map((i) => (
            <li key={i} className="flex gap-3 text-lg">
              <Check />
              <span className="first-letter:uppercase">{i}</span>
            </li>
          ))}
        </ul>
      </div>
      <CtaRow href={ctaHref} label="See If My Category Is Open" note="No setup fee. No mandatory subscription." />
    </Section>
  );
}

/* ---------- 4. Cost per planned residence ---------- */
export function CostPerResidenceSection({ campaign }: P) {
  const label = getCostPerResidenceLabel(campaign);
  if (!label) return null;
  return (
    <section aria-label="Cost per residence" className="bg-paper">
      <div className="container-page border-t border-rule py-12 sm:py-16">
        <div className="grid gap-6 md:grid-cols-[1fr_1.4fr] md:items-center">
          <p className="headline text-4xl sm:text-5xl">
            {label} per {getResidenceQualifier(campaign)}.
          </p>
          <div>
            <p className="text-lg text-ink-soft">
              The shared-cost model makes large-format direct mail accessible without one advertiser funding the
              entire campaign.
            </p>
            {campaign.reachIsEstimated && (
              <p className="mt-3 text-sm text-ink-muted">
                Final delivery quantity is determined by the USPS carrier routes selected for the edition.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- 10. Ad design objection ---------- */
export function AdDesignSection({ ctaHref }: { ctaHref: string }) {
  const steps = ["Your logo + information", "We build the ad", "You review it", "You approve it", "We print"];
  return (
    <Section id="ad-design" title="You do not need to have an ad ready.">
      <div className="grid gap-12 md:grid-cols-2">
        <div className="prose-body text-lg text-ink-soft">
          <p>Already have finished artwork? Upload it.</p>
          <p>Don&apos;t have an ad? That&apos;s normal.</p>
          <p>
            Send us your logo, website, contact information and the message or offer you want Clawson residents to
            see. We&apos;ll build the ad and send you a proof.
          </p>
          <p className="font-serif text-2xl font-semibold text-ink">Nothing prints until you approve it.</p>
        </div>
        <ol className="flex flex-col items-stretch" aria-label="Ad design process">
          {steps.map((s, i) => (
            <li key={s} className="flex flex-col items-center">
              <span
                className={`w-full max-w-xs border px-4 py-3 text-center text-sm font-bold tracking-wider uppercase ${
                  i === steps.length - 1 ? "border-accent bg-accent text-white" : "border-ink bg-card"
                }`}
              >
                {s}
              </span>
              {i < steps.length - 1 && (
                <span aria-hidden="true" className="py-1 text-ink-muted">
                  ↓
                </span>
              )}
            </li>
          ))}
        </ol>
      </div>
      <CtaRow href={ctaHref} label="Claim My Category" />
    </Section>
  );
}

/* ---------- 11. How it works ---------- */
export function HowItWorksSection({ campaign }: P) {
  const price = formatCampaignPrice(campaign);
  const steps: [string, string][] = [
    ["Check your category", "See current availability."],
    ["Claim it", `Pay the ${price} one-time fee securely online.`],
    ["Send us your materials", "Logo, contact information, offer and optional photo."],
    ["We build your ad", "No design software required."],
    [
      "You approve it",
      campaign.includedRevisions > 0
        ? "Review your digital proof and request the included revision if needed."
        : "Review your digital proof.",
    ],
    ["We print and mail", "We handle production and postal fulfillment."],
    ["You receive confirmation", "We'll keep you updated when the edition enters production and mailing."],
  ];
  return (
    <Section id="how-it-works" tone="deep" title="Seven steps. That's it.">
      <ol className="grid gap-px border-y-2 border-ink bg-rule sm:grid-cols-2 lg:grid-cols-4">
        {steps.map(([h, t], i) => (
          <li key={h} className="bg-paper-deep py-5 sm:px-5">
            <span className="font-serif text-3xl font-bold text-accent">{i + 1}</span>
            <h3 className="mt-1 text-lg font-bold">{h}</h3>
            <p className="mt-1 text-ink-soft">{t}</p>
          </li>
        ))}
        <li className="flex items-center bg-ink px-5 py-5 text-paper">
          <p className="font-serif text-xl font-semibold">No sales call required at any step.</p>
        </li>
      </ol>
    </Section>
  );
}

/* ---------- 12. Trust / fulfillment ---------- */
export function FulfillmentSection({ campaign }: P) {
  const outside = formatCampaignDate(campaign.outsideFulfillmentDate);
  return (
    <Section id="what-youre-buying" title="Exactly what you're paying for. No vague marketing promises.">
      <div className="grid gap-10 md:grid-cols-2">
        <div className="text-lg text-ink-soft">
          <p>Your payment secures a defined advertising placement.</p>
          <p className="mt-4">You are paying for:</p>
          <ul className="mt-3 space-y-2 text-ink">
            {[
              `your approved advertisement on ${campaign.brandName}`,
              "category exclusivity on that edition",
              "production of the edition",
              `distribution to the selected ${campaign.marketName} postal routes`,
            ].map((i) => (
              <li key={i} className="flex gap-3">
                <Check />
                <span>{i}</span>
              </li>
            ))}
          </ul>
          <p className="mt-5">You&apos;re not buying a promise of a specific number of calls, leads or sales.</p>
        </div>
        <aside className="self-start border-2 border-ink bg-card p-6">
          <p className="eyebrow">Fulfillment policy</p>
          <p className="mt-3 font-serif text-xl leading-snug font-semibold">
            If we cannot fulfill the {campaign.campaignName} by the outside fulfillment date stated at checkout, you
            may choose a full refund or transfer your payment to the next edition.
          </p>
          <p className="mt-4 text-sm text-ink-muted">
            {outside
              ? `Outside fulfillment date for this edition: ${outside}.`
              : "The outside fulfillment date will be published here and shown at checkout before sales open."}
          </p>
        </aside>
      </div>
    </Section>
  );
}

/* ---------- 13. ROI expectations ---------- */
export function RoiSection() {
  return (
    <Section id="results" tone="ink" title="Will this guarantee me customers? No.">
      <div className="prose-body max-w-2xl text-lg text-paper/80">
        <p>
          No advertising channel can honestly guarantee that one placement will produce a specific number of
          customers.
        </p>
        <p>The Clawson Local is designed to help your business become more visible and familiar within the community.</p>
        <p>
          Results can also depend on your offer, reputation, timing, creative, follow-up and whether residents
          currently need what you sell.
        </p>
        <p>If you need guaranteed immediate leads, this probably isn&apos;t the right advertising product for you.</p>
      </div>
      <p className="mt-10 font-serif text-3xl font-semibold text-paper sm:text-4xl">
        The goal: be known before you&apos;re needed.
      </p>
    </Section>
  );
}

/* ---------- 14. Multi-channel ---------- */
export function MultiChannelSection() {
  return (
    <Section id="other-channels" title="Already running Google, Meta or another advertising channel? Good.">
      <div className="prose-body max-w-2xl text-lg text-ink-soft">
        <p>The Clawson Local isn&apos;t designed to replace every other way you market your business.</p>
        <p>It&apos;s another local touchpoint.</p>
        <p>
          Search advertising can reach someone while they&apos;re actively looking. Social advertising can reach them
          while they&apos;re scrolling. Direct mail gives your business a physical presence in the neighborhood
          you&apos;re trying to serve.
        </p>
        <p>Strong local businesses can use multiple channels together.</p>
      </div>
    </Section>
  );
}

/* ---------- 15. Coverage ---------- */
export function CoverageSection({ campaign, routes }: P & { routes: PostalRoute[] }) {
  const selected = routes.filter((r) => r.selected);
  const count = getReachLabel(campaign);
  return (
    <Section id="coverage" tone="deep" title="Where is it going?">
      <div className="grid gap-10 md:grid-cols-[1.3fr_1fr]">
        <figure>
          <div className="aspect-[4/3] w-full overflow-hidden border-2 border-ink bg-card">
            <iframe
              title={`Map of ${campaign.marketName}, ${campaign.state}`}
              src="https://www.openstreetmap.org/export/embed.html?bbox=-83.1720%2C42.5190%2C-83.1220%2C42.5480&layer=mapnik"
              className="h-full w-full"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          </div>
          <figcaption className="mt-2 text-xs text-ink-muted">
            {campaign.marketName}, {campaign.state}. Map data © OpenStreetMap contributors. Carrier-route boundaries
            will be shown once routes are selected.
          </figcaption>
        </figure>
        <div>
          <p className="font-serif text-2xl leading-snug font-semibold">
            {campaign.reachIsEstimated
              ? `Planned distribution: ${count}.`
              : `Distribution: ${count}.`}
          </p>
          {campaign.reachIsEstimated && (
            <p className="mt-4 text-lg text-ink-soft">
              Final delivery quantity will be based on the USPS carrier routes selected for the{" "}
              {campaign.campaignName} and will be published before printing.
            </p>
          )}
          <dl className="mt-6 divide-y divide-rule border-y border-ink text-sm">
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-ink-muted">Campaign area</dt>
              <dd className="font-medium">
                {campaign.marketName}, {campaign.state}
              </dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-ink-muted">Planned reach</dt>
              <dd className="font-medium">{count.replace(/^./, (c) => c.toUpperCase())}</dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-ink-muted">Verification status</dt>
              <dd className="font-medium">
                {campaign.reachIsEstimated ? "Estimate — carrier routes not yet locked" : "Verified"}
              </dd>
            </div>
          </dl>
          {selected.length > 0 && (
            <table className="mt-6 w-full text-left text-sm">
              <caption className="mb-2 text-left font-semibold">Selected USPS carrier routes</caption>
              <thead className="border-b border-ink text-xs text-ink-muted uppercase">
                <tr>
                  <th className="py-1.5 font-semibold">Route</th>
                  <th className="py-1.5 font-semibold">ZIP</th>
                  <th className="py-1.5 text-right font-semibold">Residential</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {selected.map((r) => (
                  <tr key={r.routeId}>
                    <td className="py-1.5">{r.routeCode}</td>
                    <td className="py-1.5">{r.zipCode}</td>
                    <td className="py-1.5 text-right">{r.residentialCount.toLocaleString("en-US")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Section>
  );
}

/* ---------- 16. Founder ---------- */
export function FounderSection() {
  const { founder } = site;
  return (
    <Section id="founder" title="A real local-media project. A real person behind it.">
      <div className="grid gap-10 md:grid-cols-[16rem_1fr] md:items-start">
        <div>
          <div className="aspect-[4/5] w-full max-w-64 overflow-hidden border-2 border-ink bg-paper-deep">
            <Image
              src={founderPhoto}
              alt={founder.photoAlt}
              placeholder="blur"
              sizes="256px"
              quality={50}
              className="h-full w-full object-cover"
            />
          </div>
          <address className="mt-4 text-sm leading-relaxed not-italic">
            <strong className="block font-serif text-lg">{founder.name}</strong>
            {site.name}
            <br />
            {site.servingLine}
            <br />
            <a href={`mailto:${site.email.public}`} className="text-accent underline underline-offset-4">
              {site.email.public}
            </a>
          </address>
        </div>
        <div className="prose-body max-w-2xl text-lg text-ink-soft">
          <p>I&apos;m {founder.name}, the person behind The Clawson Local.</p>
          <p>
            I created it to make local direct-mail visibility simpler for businesses serving Clawson: a limited group
            of non-competing businesses shares the cost of one large local mailing instead of each business paying for
            an entire campaign alone.
          </p>
          <p>You&apos;ll receive updates from me from checkout through mailing.</p>
        </div>
      </div>
    </Section>
  );
}

/* ---------- 47. Final CTA ---------- */
export function FinalCtaSection({ campaign, ctaHref, ctaLabel = "Check My Category" }: P & { ctaHref: string; ctaLabel?: string }) {
  const price = formatCampaignPrice(campaign);
  return (
    <section aria-labelledby="final-cta-heading" className="bg-paper">
      <div className="container-page rule-double py-16 text-center sm:py-24">
        <h2 id="final-cta-heading" className="headline mx-auto max-w-3xl text-3xl leading-tight sm:text-5xl">
          One business per category. When yours is claimed, it&apos;s gone for this edition.
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-lg text-ink-soft">
          Check current availability and review everything included before you pay.
        </p>
        <Link href={ctaHref} className="btn-primary mt-8">
          {ctaLabel}
        </Link>
        <p className="mt-4 text-sm text-ink-muted">
          {price} one time • No sales call required • No recurring charge
        </p>
      </div>
    </section>
  );
}
