import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { site } from "@/config/site";
import { getReservationForBuyer } from "@/lib/checkout/reservations";

export const metadata: Metadata = {
  title: "Checkout not completed",
  robots: { index: false, follow: false },
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Detroit" });
}

/**
 * Stripe's "back" link lands here. Shows the reservation's REAL state: a hold
 * that is still alive is described as held, not as available.
 */
export default async function CheckoutCancelPage({ searchParams }: PageProps<"/checkout/cancel">) {
  const { reservation: id } = await searchParams;
  const r = typeof id === "string" ? await getReservationForBuyer(id) : null;

  if (!r) {
    return (
      <PageHeader eyebrow="Checkout" title="Payment was not completed.">
        <p>
          No payment was taken.{" "}
          <Link href="/categories" className="text-accent underline underline-offset-4">
            See available categories
          </Link>
        </p>
      </PageHeader>
    );
  }

  const categoryLink = (
    <Link href={`/category/${r.categorySlug}`} className="text-accent underline underline-offset-4">
      {r.categoryName}
    </Link>
  );

  if (r.status === "PAID" || r.status === "PROCESSING") {
    return (
      <PageHeader eyebrow="Checkout" title="Your payment is already in.">
        <p>
          {r.status === "PAID" ? "This checkout was paid" : "This checkout is being confirmed"}, so {r.categoryName} is
          secured for you.{" "}
          {r.sessionId && (
            <Link href={`/checkout/success?session_id=${r.sessionId}`} className="text-accent underline underline-offset-4">
              View confirmation
            </Link>
          )}
        </p>
      </PageHeader>
    );
  }

  if (r.status === "HELD" && new Date(r.expiresAt) > new Date()) {
    return (
      <>
        <PageHeader eyebrow="Checkout" title="Payment was not completed.">
          <p>
            No payment was taken. {r.categoryName} is still held for you until about {formatTime(r.expiresAt)}{" "}
            (Clawson time), then it becomes available to other businesses again.
          </p>
        </PageHeader>
        <div className="container-page flex flex-col items-start gap-4 pb-16 sm:flex-row sm:items-center">
          {r.checkoutUrl && (
            <a href={r.checkoutUrl} className="btn-primary">
              Return to checkout
            </a>
          )}
          <form action="/api/checkout/release" method="post">
            <input type="hidden" name="reservation" value={r.id} />
            <button type="submit" className="btn-secondary">
              Release {r.categoryName}
            </button>
          </form>
        </div>
      </>
    );
  }

  return (
    <PageHeader eyebrow="Checkout" title="Payment was not completed.">
      <p>
        No payment was taken, and your hold on {categoryLink} has ended. Check its current availability, or email{" "}
        <a href={`mailto:${site.email.public}`} className="text-accent underline underline-offset-4">
          {site.email.public}
        </a>
        .
      </p>
    </PageHeader>
  );
}
