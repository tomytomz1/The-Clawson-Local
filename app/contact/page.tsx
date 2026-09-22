import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { site } from "@/config/site";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact The Clawson Local.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <>
      <PageHeader eyebrow="Contact" title="Talk to a real person.">
        <p>
          Email is the fastest way to reach us. A call is available if you need one, but it isn&apos;t required to
          purchase.
        </p>
      </PageHeader>
      <div className="container-page max-w-3xl pb-16">
        <div className="border-2 border-ink bg-card p-6">
          <p className="font-serif text-lg font-semibold">
            {site.founder.name}, {site.name}
          </p>
          <p className="text-ink-soft">{site.servingLine}</p>
          <a
            href={`mailto:${site.email.public}`}
            className="mt-4 inline-block text-xl font-semibold text-accent underline underline-offset-4"
          >
            {site.email.public}
          </a>
          {site.phone && <p className="mt-2">{site.phone}</p>}
          {site.mailingAddress && <p className="mt-2 whitespace-pre-line text-ink-soft">{site.mailingAddress}</p>}
        </div>
      </div>
    </>
  );
}
