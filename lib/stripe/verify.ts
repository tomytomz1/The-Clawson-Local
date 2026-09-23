import Stripe from "stripe";

/**
 * Verify a Stripe webhook signature against the RAW request body and return
 * the parsed event. Throws on a missing, bad or stale signature. Needs only the webhook secret, not an API key.
 */
export function verifyStripeEvent(rawBody: string, signature: string | null, secret: string): Stripe.Event {
  if (!signature) throw new Error("Missing Stripe-Signature header");
  return Stripe.webhooks.constructEvent(rawBody, signature, secret);
}
