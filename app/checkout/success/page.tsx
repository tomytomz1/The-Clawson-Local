import type { Metadata } from "next";
import Link from "next/link";
import { AutoRefresh } from "@/components/checkout/auto-refresh";
import { PageHeader } from "@/components/ui/page-header";
import { site } from "@/config/site";
import { formatCents } from "@/lib/campaign/format";
import { getReservationBySession } from "@/lib/checkout/reservations";

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
};

/**
 * Stripe redirects here after payment. This page only READS state: the
 * webhook is what marks a reservation paid, so until it has, the buyer sees a
 * short "Confirming your payment…" state that re-checks itself.
 */
export default async function CheckoutSuccessPage({
  searchParams,
}: PageProps<"/checkout/success">) {
  const { session_id } = await searchParams;
  const reservation =
    typeof session_id === "string"
      ? await getReservationBySession(session_id)
      : null;

  if (!reservation) {
    return (
      <PageHeader eyebrow="Checkout" title="We couldn’t find that checkout.">
        <p>
          If you completed a payment, it will still be confirmed. Questions?{" "}
          <a
            href={`mailto:${site.email.public}`}
            className="text-accent underline underline-offset-4"
          >
            {site.email.public}
          </a>
        </p>
      </PageHeader>
    );
  }

  const edition =
    `${reservation.marketName} ${reservation.campaignName}`.trim();

  if (reservation.status === "PAID") {
    return (
      <>
        <PageHeader
          eyebrow={`${site.name} • ${edition}`}
          title="Payment confirmed. Your category is secured."
        >
          <p>We&apos;ll collect your ad materials in the next step.</p>
        </PageHeader>
        <div className="container-page pb-16">
          <div className="max-w-3xl">
            <dl className="grid gap-4 border-2 border-ink bg-card p-6 sm:grid-cols-2">
              {[
                ["Business", reservation.businessName ?? "—"],
                ["Category", reservation.categoryName],
                ["Edition", edition],
                ["Paid", `${formatCents(reservation.amountCents)} one time`],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs font-semibold tracking-wider text-ink-muted uppercase">
                    {k}
                  </dt>
                  <dd className="mt-1 font-serif text-xl font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-6 text-ink-soft">
              Keep this page for your records. Questions?{" "}
              <a
                href={`mailto:${site.email.public}`}
                className="text-accent underline underline-offset-4"
              >
                {site.email.public}
              </a>
            </p>
          </div>
        </div>
      </>
    );
  }

  if (reservation.status === "HELD" || reservation.status === "PROCESSING") {
    return (
      <PageHeader
        eyebrow={`${site.name} • ${edition}`}
        title="Confirming your payment…"
      >
        <p>
          {reservation.categoryName} is held for you while Stripe confirms the
          payment. This usually takes a few seconds.
          {reservation.status === "PROCESSING" &&
            " Your payment method can take a few days to settle; the category stays held for you until it does."}
        </p>
        {reservation.status === "HELD" && <AutoRefresh />}
      </PageHeader>
    );
  }

  return (
    <PageHeader
      eyebrow={`${site.name} • ${edition}`}
      title="This checkout did not complete."
    >
      <p>
        {reservation.status === "REFUND_REQUIRED"
          ? "Your payment arrived after this category was no longer available. We will refund you in full and be in touch."
          : `No payment was taken for ${reservation.categoryName}.`}{" "}
        <Link
          href={`/category/${reservation.categorySlug}`}
          className="text-accent underline underline-offset-4"
        >
          Check {reservation.categoryName} availability
        </Link>
      </p>
    </PageHeader>
  );
}
