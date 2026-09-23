import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { PageHeader } from "@/components/ui/page-header";
import { site } from "@/config/site";
import { intakeDeps } from "@/lib/intake/server";
import { getIntake } from "@/lib/intake/service";

export const metadata: Metadata = {
  title: "Materials received",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function IntakeSubmittedPage({ params }: PageProps<"/intake/[token]/submitted">) {
  await connection();
  const { token } = await params;
  const data = await getIntake(token, intakeDeps());
  if (!data) notFound();
  if (data.intake.status !== "SUBMITTED") redirect(`/intake/${token}`);
  const { intake, assets } = data;
  const submittedAt = intake.submittedAt
    ? new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeStyle: "short", timeZone: "America/Detroit" }).format(new Date(intake.submittedAt))
    : "";

  return (
    <>
      <PageHeader eyebrow={`${site.name} • ${intake.categoryName}`} title="Thanks — we have your ad materials.">
        <p>
          We&apos;ll use these materials to create your ad and send you a proof before anything prints.
          {intake.fields.contact_email && <> The proof goes to {intake.fields.contact_email}.</>}
        </p>
      </PageHeader>
      <div className="container-page pb-16">
        <div className="max-w-3xl">
          <dl className="grid gap-4 border-2 border-ink bg-card p-6 sm:grid-cols-2">
            {[
              ["Business", intake.fields.business_name ?? "—"],
              ["Ad", intake.fields.design_choice === "FINISHED_ARTWORK" ? "Your finished artwork" : "We build it for you"],
              ["Files", `${assets.length} uploaded`],
              ["Submitted", submittedAt],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs font-semibold tracking-wider text-ink-muted uppercase">{k}</dt>
                <dd className="mt-1 font-serif text-xl font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-6 text-ink-soft">
            Need to change something?{" "}
            <Link href={`/intake/${token}`} className="text-accent underline underline-offset-4">
              Update your materials
            </Link>{" "}
            or email{" "}
            <a href={`mailto:${site.email.public}`} className="text-accent underline underline-offset-4">
              {site.email.public}
            </a>
            .
          </p>
        </div>
      </div>
    </>
  );
}
