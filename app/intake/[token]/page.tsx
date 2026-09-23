import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { IntakeForm } from "@/components/intake/intake-form";
import { PageHeader } from "@/components/ui/page-header";
import { site } from "@/config/site";
import { intakeDeps } from "@/lib/intake/server";
import { getIntake } from "@/lib/intake/service";

export const metadata: Metadata = {
  title: "Submit your ad materials",
  robots: { index: false, follow: false },
  // The link is the credential: never leak it to other sites.
  referrer: "no-referrer",
};

/**
 * Advertiser intake, reached only through the private link shown after
 * payment. Unknown, malformed or unpaid links all get the same 404.
 */
export default async function IntakePage({ params }: PageProps<"/intake/[token]">) {
  await connection();
  const { token } = await params;
  const data = await getIntake(token, intakeDeps());
  if (!data) notFound();
  const { intake, assets } = data;
  const f = intake.fields;
  const edition = `${intake.market} ${intake.campaignName}`.trim();

  return (
    <>
      <PageHeader eyebrow={`${site.name} • ${edition}`} title="Submit your ad materials">
        <p>
          {intake.categoryName} is yours for the {edition}. Tell us what your ad should say and upload your logo or
          finished artwork. We&apos;ll send you a proof before anything prints.
        </p>
        <p className="mt-3 text-base">
          Keep this link private: anyone with it can view and change your materials. You can save and come back any time.
        </p>
      </PageHeader>
      <div className="container-page pb-16">
        <div className="max-w-3xl">
          <IntakeForm
            token={token}
            submitted={intake.status === "SUBMITTED"}
            initial={{
              design_choice: f.design_choice ?? "",
              business_name: f.business_name ?? "",
              contact_name: f.contact_name ?? "",
              contact_email: f.contact_email ?? "",
              phone: f.phone ?? "",
              website_url: f.website_url ?? "",
              headline: f.headline ?? "",
              offer: f.offer ?? "",
              call_to_action: f.call_to_action ?? "",
              qr_url: f.qr_url ?? "",
              notes: f.notes ?? "",
            }}
            initialAssets={assets.map((a) => ({ id: a.id, kind: a.kind, filename: a.filename, sizeBytes: a.sizeBytes }))}
          />
          <p className="mt-6 text-sm text-ink-soft">
            Questions?{" "}
            <a href={`mailto:${site.email.public}`} className="text-accent underline underline-offset-4">
              {site.email.public}
            </a>
          </p>
        </div>
      </div>
    </>
  );
}
