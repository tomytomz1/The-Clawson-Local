import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { getAdvertiserDetail } from "@/lib/admin/advertisers";

export const metadata: Metadata = {
  title: "Advertiser — Admin",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const fmt = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-US", { timeZone: "America/Detroit", dateStyle: "short", timeStyle: "short" }) : "—";

const FIELDS: [string, string][] = [
  ["design_choice", "Ad approach"],
  ["business_name", "Business name"],
  ["contact_name", "Contact name"],
  ["contact_email", "Contact email"],
  ["phone", "Phone"],
  ["website_url", "Website"],
  ["headline", "Headline"],
  ["offer", "Offer"],
  ["call_to_action", "Call to action"],
  ["qr_url", "QR destination"],
  ["notes", "Notes"],
];

const label = "text-xs font-semibold tracking-wide text-ink-muted uppercase";

export default async function AdvertiserDetailPage({ params }: PageProps<"/admin/advertisers/[id]">) {
  await connection();
  await requireAdmin();
  const { id } = await params;
  const a = await getAdvertiserDetail(id);
  if (!a) notFound();

  return (
    <div className="container-page space-y-8 py-8 text-sm">
      <header>
        <p className="eyebrow">
          <Link href="/admin" className="hover:underline">Admin</Link> /{" "}
          <Link href="/admin/advertisers" className="hover:underline">Advertisers</Link>
        </p>
        <h1 className="headline mt-1 text-3xl">{a.businessName ?? "Advertiser"}</h1>
      </header>

      <section className="grid gap-4 border-y-2 border-ink py-4 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Category", a.categoryName ?? "—"],
          ["Email", a.contactEmail ?? "—"],
          ["Payment", a.paymentStatus ?? "—"],
          ["Paid", fmt(a.paidAt)],
          ["Intake", a.intakeStatus],
          ["Submitted", fmt(a.submittedAt)],
        ].map(([k, v]) => (
          <div key={k}>
            <p className={label}>{k}</p>
            <p className="font-semibold break-words">{v}</p>
          </div>
        ))}
      </section>

      <section>
        <h2 className="headline mb-2 text-xl">Intake link</h2>
        {a.intakePath ? (
          <>
            <p className="font-mono text-xs break-all">
              <a href={a.intakePath} className="underline underline-offset-2" target="_blank" rel="noreferrer noopener">
                {a.intakePath}
              </a>
            </p>
            <p className="mt-1 text-ink-muted">Private to this advertiser. Prefix with the site address when sending it.</p>
          </>
        ) : (
          <p className="text-ink-muted">
            {a.paymentStatus === "PAID" ? "Intake is not configured (INTAKE_TOKEN_SECRET missing)." : "Available once payment is confirmed."}
          </p>
        )}
      </section>

      <section>
        <h2 className="headline mb-2 text-xl">Submitted details</h2>
        {a.intake ? (
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {FIELDS.map(([k, text]) => (
              <div key={k} className={k === "notes" || k === "offer" ? "sm:col-span-2" : ""}>
                <dt className={label}>{text}</dt>
                <dd className="mt-0.5 whitespace-pre-wrap break-words">{a.intake?.[k] || "—"}</dd>
              </div>
            ))}
            <div>
              <dt className={label}>Started / last saved</dt>
              <dd className="mt-0.5">
                {fmt(a.intake.started_at)} / {fmt(a.intake.last_saved_at)}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="text-ink-muted">Not started.</p>
        )}
      </section>

      <section>
        <h2 className="headline mb-2 text-xl">Files</h2>
        {a.assets.length === 0 ? (
          <p className="text-ink-muted">No files uploaded.</p>
        ) : (
          <ul className="divide-y divide-rule border-y border-rule">
            {a.assets.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="mr-2 inline-block w-16 text-xs font-semibold uppercase text-ink-muted">{f.kind}</span>
                  {f.filename} <span className="text-ink-muted">({f.contentType}, {(f.sizeBytes / 1024).toFixed(0)} KB)</span>
                </span>
                {f.downloadUrl ? (
                  <a href={f.downloadUrl} className="text-accent underline underline-offset-2" rel="noreferrer noopener">
                    Download
                  </a>
                ) : (
                  <span className="text-ink-muted">Unavailable</span>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-ink-muted">Download links are private and expire after 5 minutes; reload the page for fresh ones. Files always download and are never displayed in the browser.</p>
      </section>
    </div>
  );
}
