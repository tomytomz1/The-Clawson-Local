import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { site } from "@/config/site";

export const metadata: Metadata = {
  title: "Privacy",
  description: "How The Clawson Local handles advertiser information.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  const sections: [string, string][] = [
    [
      "What we collect",
      "When you purchase a placement we collect the business and contact information you provide at checkout and in the advertiser intake form, plus the files you upload for your ad. Payment card details are entered on our payment processor's hosted checkout page and are not stored by us.",
    ],
    [
      "Analytics and marketing measurement",
      "We use Google Analytics to understand site usage and marketing performance, including page visits, category interest, checkout starts, purchases, traffic sources and campaign parameters such as UTM tags. We configure analytics so private checkout identifiers and advertiser contact information are not intentionally sent to Google Analytics.",
    ],
    [
      "How we use it",
      "We use your information to fulfill your placement: to build your ad, send proofs, send transactional updates about the edition, keep records of approvals, and understand which marketing channels bring advertisers to the site.",
    ],
    [
      "QR tracking",
      "If your ad uses a tracked QR link, we record the scan time and link used so we can report engagement to you. We do not use QR scans to collect personal information about residents.",
    ],
    [
      "Sharing",
      "We share information only with the service providers needed to run the site and fulfill the edition, such as analytics, payment processing, email delivery, hosting, printing and mailing providers. We do not sell your information.",
    ],
    [
      "Contact",
      `Questions or requests about your information: ${site.email.public}.`,
    ],
  ];
  return (
    <>
      <PageHeader eyebrow="Privacy" title="Privacy Policy" />
      <div className="container-page max-w-3xl space-y-8 pb-16">
        {sections.map(([h, body]) => (
          <section key={h}>
            <h2 className="headline text-2xl">{h}</h2>
            <p className="mt-2 text-ink-soft">{body}</p>
          </section>
        ))}
      </div>
    </>
  );
}
