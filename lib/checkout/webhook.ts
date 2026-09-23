import type Stripe from "stripe";
import { site } from "@/config/site";
import { firstRow, type Rpc } from "./rpc";

/**
 * Stripe webhook processing. The webhook is the only thing that turns a
 * reservation into a sale; browser redirects never do.
 *
 * Idempotency is two-layered:
 * 1. stripe_webhook_events de-duplicates deliveries of the same event id.
 * 2. fulfill_reservation is itself idempotent per Checkout Session, so the same
 *    payment arriving under different events still produces exactly one sale.
 */

export const HANDLED_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
] as const;

/** A problem with the event itself; retrying will not help, so Stripe gets 200. */
export class PermanentWebhookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentWebhookError";
  }
}

const PERMANENT_DB_ERRORS = [
  "reservation_not_found",
  "session_mismatch",
  "campaign_mismatch",
  "category_mismatch",
  "amount_mismatch",
  "currency_mismatch",
  "invalid_release_status",
];

export type WebhookOutcome = {
  status: "processed" | "ignored" | "failed" | "duplicate";
  /** HTTP status to return to Stripe: 500 asks Stripe to retry. */
  httpStatus: 200 | 500;
  detail: string;
  reservationId?: string;
};

type FulfillRow = { outcome: "fulfilled" | "already_paid" | "refund_required"; advertiser_id: string | null };

function sessionIds(session: Stripe.Checkout.Session) {
  const md = session.metadata ?? {};
  const reservationId = md.reservation_id;
  if (!reservationId) throw new PermanentWebhookError("metadata_missing_reservation_id");
  if (session.client_reference_id !== reservationId) throw new PermanentWebhookError("metadata_mismatch_client_reference_id");
  if (!md.campaign_id || !md.category_id) throw new PermanentWebhookError("metadata_missing_campaign_or_category");
  return { reservationId, campaignId: md.campaign_id, categoryId: md.category_id };
}

function idOf(v: string | { id: string } | null | undefined): string | null {
  if (!v) return null;
  return typeof v === "string" ? v : v.id;
}

async function fulfill(session: Stripe.Checkout.Session, rpc: Rpc): Promise<{ detail: string; reservationId: string }> {
  const ids = sessionIds(session);
  if (session.payment_status !== "paid") {
    throw new PermanentWebhookError(`session_not_paid:${session.payment_status}`);
  }
  if (session.amount_total == null || !session.currency) throw new PermanentWebhookError("session_missing_amount");

  const businessName = session.custom_fields?.find((f) => f.key === "business_name")?.text?.value ?? null;
  const email = session.customer_details?.email ?? session.customer_email ?? null;
  if (!email) throw new PermanentWebhookError("session_missing_email");

  const row = firstRow(
    await rpc<FulfillRow[]>("fulfill_reservation", {
      p_reservation_id: ids.reservationId,
      p_session_id: session.id,
      p_campaign_id: ids.campaignId,
      p_category_id: ids.categoryId,
      p_amount_total: session.amount_total,
      p_currency: session.currency,
      p_payment_intent_id: idOf(session.payment_intent),
      p_customer_email: email,
      p_business_name: businessName,
      p_stripe_customer_id: idOf(session.customer),
      p_terms_accepted: session.consent?.terms_of_service === "accepted",
      p_terms_version: site.termsVersion,
    }),
  );
  if (!row) throw new Error("fulfill_reservation returned nothing");
  if (row.outcome === "refund_required") {
    // Recorded on the reservation; surfaced as a failed event so it is noticed.
    throw new PermanentWebhookError("refund_required: paid after the category was no longer available");
  }
  return { detail: row.outcome, reservationId: ids.reservationId };
}

async function dispatch(event: Stripe.Event, rpc: Rpc): Promise<{ status: "processed" | "ignored"; detail: string; reservationId?: string }> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.payment_status === "paid") return { status: "processed", ...(await fulfill(session, rpc)) };
      if (session.payment_status === "unpaid") {
        // Delayed payment method: keep the hold until async success/failure.
        const { reservationId } = sessionIds(session);
        const held = await rpc<boolean>("mark_reservation_processing", {
          p_reservation_id: reservationId,
          p_session_id: session.id,
          p_hold_days: 14,
        });
        return { status: "processed", detail: held ? "awaiting_async_payment" : "not_held", reservationId };
      }
      throw new PermanentWebhookError(`unexpected_payment_status:${session.payment_status}`);
    }
    case "checkout.session.async_payment_succeeded":
      return { status: "processed", ...(await fulfill(event.data.object, rpc)) };
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired": {
      const session = event.data.object;
      const { reservationId } = sessionIds(session);
      const released = await rpc<boolean>("release_reservation", {
        p_reservation_id: reservationId,
        p_status: event.type === "checkout.session.expired" ? "EXPIRED" : "FAILED",
        p_reason: event.type === "checkout.session.expired" ? "checkout session expired" : "async payment failed",
        p_session_id: session.id,
      });
      return { status: "processed", detail: released ? "released" : "already_finished", reservationId };
    }
    default:
      return { status: "ignored", detail: `unhandled event type ${event.type}` };
  }
}

/** Process one verified Stripe event with event-level de-duplication. */
export async function processStripeEvent(
  event: Stripe.Event,
  deps: { rpc: Rpc; expectLivemode: boolean },
): Promise<WebhookOutcome> {
  const { rpc } = deps;
  const proceed = await rpc<boolean>("begin_webhook_event", {
    p_event_id: event.id,
    p_type: event.type,
    p_livemode: event.livemode,
  });
  if (!proceed) return { status: "duplicate", httpStatus: 200, detail: "event already handled" };

  const finish = (status: string, reservationId?: string, error?: string) =>
    rpc("finish_webhook_event", {
      p_event_id: event.id,
      p_status: status,
      p_reservation_id: reservationId ?? null,
      p_error: error ?? null,
    });

  if (event.livemode !== deps.expectLivemode) {
    const detail = `livemode=${event.livemode} event sent to a ${deps.expectLivemode ? "live" : "test"} deployment`;
    await finish("ignored", undefined, detail);
    return { status: "ignored", httpStatus: 200, detail };
  }

  try {
    const result = await dispatch(event, rpc);
    await finish(result.status, result.reservationId);
    return { ...result, httpStatus: 200 };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const permanent = err instanceof PermanentWebhookError || PERMANENT_DB_ERRORS.some((c) => message.includes(c));
    let reservationId: string | undefined;
    try {
      reservationId = event.type.startsWith("checkout.session.")
        ? ((event.data.object as Stripe.Checkout.Session).metadata?.reservation_id ?? undefined)
        : undefined;
      // Only link the event to a reservation id that parses as a UUID.
      if (reservationId && !/^[0-9a-f-]{36}$/i.test(reservationId)) reservationId = undefined;
    } catch {
      reservationId = undefined;
    }
    await finish("failed", reservationId, message).catch((e) => console.error("[webhook] could not record failure", e));
    console.error(`[webhook] ${event.type} ${event.id} failed (${permanent ? "permanent" : "will retry"}): ${message}`);
    return { status: "failed", httpStatus: permanent ? 200 : 500, detail: message, reservationId };
  }
}
