import type { Metadata } from "next";
import Link from "next/link";
import { FaqList } from "@/components/marketing/faq-list";
import { PageHeader } from "@/components/ui/page-header";
import { getActiveCampaign } from "@/lib/campaign";
import { getFaq } from "@/lib/campaign/faq";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Answers about pricing, reach, category exclusivity, proofs and fulfillment for The Clawson Local.",
  alternates: { canonical: "/faq" },
};

export default async function FaqPage() {
  const campaign = await getActiveCampaign();
  const faq = getFaq(campaign);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
  return (
    <>
      <PageHeader eyebrow="FAQ" title="Straight answers before you pay." />
      <div className="container-page max-w-4xl pb-16">
        <FaqList items={faq} />
        <div className="mt-10">
          <Link href="/categories" className="btn-primary">
            Check My Category
          </Link>
        </div>
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </>
  );
}
