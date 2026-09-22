import type { Metadata } from "next";
import Link from "next/link";
import { FounderSection } from "@/components/marketing/sections";
import { PageHeader } from "@/components/ui/page-header";
import { Pending } from "@/components/ui/pending";
import { site } from "@/config/site";
import { getActiveCampaign, getReachLabel } from "@/lib/campaign";

export const metadata: Metadata = {
  title: "About",
  description: "Who is behind The Clawson Local and how the shared-cost local mailer works.",
  alternates: { canonical: "/about" },
};

export default async function AboutPage() {
  const campaign = await getActiveCampaign();
  return (
    <>
      <PageHeader eyebrow="About" title={`About ${site.name}`}>
        <p>
          {site.name} is a category-exclusive, shared-cost local mailer serving {campaign.marketName},{" "}
          {campaign.state}. The {campaign.campaignName} is planned for {getReachLabel(campaign)}, with one business
          per category.
        </p>
        <p className="mt-3 font-serif italic">{site.consumerTagline}</p>
      </PageHeader>
      <FounderSection />
      <section className="container-page max-w-3xl border-t border-rule py-12">
        <h2 className="headline text-2xl">Business details</h2>
        <dl className="mt-4 divide-y divide-rule border-y border-ink text-sm">
          <div className="flex flex-wrap justify-between gap-2 py-3">
            <dt className="text-ink-muted">Legal business name</dt>
            <dd><Pending value={site.legalName} label="Legal name" /></dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2 py-3">
            <dt className="text-ink-muted">Mailing address</dt>
            <dd><Pending value={site.mailingAddress} label="Mailing address" /></dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2 py-3">
            <dt className="text-ink-muted">Email</dt>
            <dd>
              <a href={`mailto:${site.email.public}`} className="text-accent underline underline-offset-4">
                {site.email.public}
              </a>
            </dd>
          </div>
        </dl>
        <Link href="/categories" className="btn-primary mt-8">
          Check My Category
        </Link>
      </section>
    </>
  );
}
