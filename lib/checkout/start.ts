import type Stripe from "stripe";
import { IP_HOLD_LIMIT, IP_WINDOW_MINUTES } from "./abuse";
import { firstRow, type Rpc } from "./rpc";

/** Stripe requires Checkout Sessions to live at least 30 minutes. */
export const CHECKOUT_MINUTES = 30;
/** Added to the 30-minute minimum so clock skew never puts us under it. */
export const CHECKOUT_BUFFER_SECONDS = 60;
/** Hold outlives the Session briefly so a last-second payment is still ours. */
export const HOLD_GRACE_SECONDS = 300;
/** Provisional hold while the Session is being created (replaced right after). */
export const PROVISIONAL_HOLD_MINUTES = 35;

export const RESERVE_ERRORS = [
  "campaign_not_found",
  "campaign_not_open",
  "category_not_found",
  "category_closed",
  "category_sold",
  "category_held",
  "campaign_full",
  "client_has_active_hold",
  "rate_limited",
] as const;
export type ReserveErrorCode = (typeof RESERVE_ERRORS)[number] | "checkout_failed";

export class CheckoutError extends Error {
  constructor(
    readonly code: ReserveErrorCode,
    options?: { cause?: unknown; retryAfterSeconds?: number },
  ) {
    super(code, options);
    this.name = "CheckoutError";
    this.retryAfterSeconds = options?.retryAfterSeconds;
  }
  /** Set for rate_limited: seconds until another hold may be created. */
  readonly retryAfterSeconds?: number;
}

export type ReservationRow = {
  reservation_id: string;
  expires_at: string;
  amount_cents: number;
  currency: string;
  conflict_key: string;
  category_slug: string;
  category_name: string;
  campaign_name: string;
};

/** The two Stripe calls the checkout flow makes; injectable for tests. */
export type CheckoutGateway = {
  createSession(
    params: Stripe.Checkout.SessionCreateParams,
    options: { idempotencyKey: string },
  ): Promise<Pick<Stripe.Checkout.Session, "id" | "url" | "expires_at">>;
  expireSession(sessionId: string): Promise<unknown>;
};

export type StartCheckoutInput = {
  campaignId: string;
  categoryId: string;
  brandName: string;
  /** Origin for success/cancel redirects (the deployment serving the request). */
  origin: string;
  /** Absolute URL of the advertiser terms shown next to the consent checkbox. */
  termsUrl: string;
  /** HMAC digests for the abuse guard (see lib/checkout/abuse.ts). */
  clientHash?: string;
  ipHash?: string;
};

export type StartCheckoutResult = { reservationId: string; sessionId: string; url: string; holdExpiresAt: string };

export function buildSessionParams(
  input: StartCheckoutInput,
  r: ReservationRow,
  nowMs: number,
): Stripe.Checkout.SessionCreateParams {
  const metadata = {
    reservation_id: r.reservation_id,
    campaign_id: input.campaignId,
    category_id: input.categoryId,
    category_slug: r.category_slug,
    conflict_key: r.conflict_key,
  };
  return {
    mode: "payment",
    // Card includes Apple Pay and Google Pay where the buyer's device supports them.
    payment_method_types: ["card"],
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: r.currency,
          // Always the campaign price read from the database, never from the browser.
          unit_amount: r.amount_cents,
          product_data: {
            name: `${r.category_name} — ${input.brandName} ${r.campaign_name}`,
            description: "One category-exclusive placement. One-time payment. Ad design included.",
          },
        },
      },
    ],
    expires_at: Math.floor(nowMs / 1000) + CHECKOUT_MINUTES * 60 + CHECKOUT_BUFFER_SECONDS,
    client_reference_id: r.reservation_id,
    metadata,
    payment_intent_data: { metadata, description: `${r.category_name} — ${r.campaign_name}` },
    customer_creation: "always",
    custom_fields: [
      {
        key: "business_name",
        label: { type: "custom", custom: "Business name" },
        type: "text",
        text: { minimum_length: 2, maximum_length: 100 },
        optional: false,
      },
    ],
    consent_collection: { terms_of_service: "required" },
    custom_text: {
      terms_of_service_acceptance: {
        message: `I agree to the [Advertiser Terms](${input.termsUrl}), including that results are not guaranteed.`,
      },
      submit: { message: `Payment secures ${r.category_name} for the ${r.campaign_name}.` },
    },
    success_url: `${input.origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${input.origin}/checkout/cancel?reservation=${r.reservation_id}`,
  };
}

/**
 * Hold the category in the database, then open a Stripe Checkout Session for
 * it. If Stripe fails, the hold is released immediately.
 */
export async function startCheckout(
  input: StartCheckoutInput,
  deps: { rpc: Rpc; stripe: CheckoutGateway; now?: () => number },
): Promise<StartCheckoutResult> {
  const now = deps.now ?? Date.now;

  let reservation: ReservationRow | null;
  try {
    reservation = firstRow(
      await deps.rpc<ReservationRow[]>("reserve_category", {
        p_campaign_id: input.campaignId,
        p_category_id: input.categoryId,
        p_hold_minutes: PROVISIONAL_HOLD_MINUTES,
        p_client_hash: input.clientHash ?? null,
        p_ip_hash: input.ipHash ?? null,
        p_ip_limit: IP_HOLD_LIMIT,
        p_ip_window_minutes: IP_WINDOW_MINUTES,
      }),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    const code = RESERVE_ERRORS.find((c) => message.includes(c));
    if (code === "rate_limited") {
      const seconds = Number(message.match(/rate_limited:(\d+)/)?.[1] ?? IP_WINDOW_MINUTES * 60);
      throw new CheckoutError(code, { cause: err, retryAfterSeconds: seconds });
    }
    if (code) throw new CheckoutError(code, { cause: err });
    throw err;
  }
  if (!reservation) throw new Error("reserve_category returned no reservation");

  const release = (reason: string) =>
    deps
      .rpc("release_reservation", {
        p_reservation_id: reservation.reservation_id,
        p_status: "RELEASED",
        p_reason: reason.slice(0, 500),
        p_session_id: null,
      })
      .catch((e) => console.error("[checkout] release after failure also failed", e));

  let session: Pick<Stripe.Checkout.Session, "id" | "url" | "expires_at">;
  try {
    session = await deps.stripe.createSession(buildSessionParams(input, reservation, now()), {
      idempotencyKey: `checkout-session-${reservation.reservation_id}`,
    });
    if (!session.url) throw new Error("Stripe returned a Checkout Session without a URL");
  } catch (err) {
    await release(`checkout_session_create_failed: ${err instanceof Error ? err.message : String(err)}`);
    throw new CheckoutError("checkout_failed", { cause: err });
  }

  try {
    const holdExpiresAt = await deps.rpc<string>("attach_checkout_session", {
      p_reservation_id: reservation.reservation_id,
      p_session_id: session.id,
      p_checkout_url: session.url,
      p_session_expires_at: new Date(session.expires_at * 1000).toISOString(),
      p_grace_seconds: HOLD_GRACE_SECONDS,
    });
    return { reservationId: reservation.reservation_id, sessionId: session.id, url: session.url, holdExpiresAt };
  } catch (err) {
    // The Session exists but we could not record it: close it so nobody can pay into a released hold.
    await deps.stripe.expireSession(session.id).catch((e) => console.error("[checkout] expire session failed", e));
    await release(`attach_checkout_session_failed: ${err instanceof Error ? err.message : String(err)}`);
    throw new CheckoutError("checkout_failed", { cause: err });
  }
}
