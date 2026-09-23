import { NextResponse } from "next/server";
import { serverRpc } from "@/lib/checkout/server";
import { processStripeEvent } from "@/lib/checkout/webhook";
import { expectedLivemode, getWebhookSecret } from "@/lib/stripe/config";
import { verifyStripeEvent } from "@/lib/stripe/verify";

/**
 * Stripe webhook: the source of truth for payment. Verifies the signature
 * against the RAW body with STRIPE_WEBHOOK_SECRET before anything else.
 * 400 = bad signature (Stripe will not be trusted), 500 = transient failure
 * (Stripe retries), 200 = handled, duplicate, ignored or permanently refused.
 */
export async function POST(request: Request) {
  let secret: string;
  try {
    secret = getWebhookSecret();
  } catch {
    console.error("[webhook] STRIPE_WEBHOOK_SECRET is not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const rawBody = await request.text();
  let event;
  try {
    event = verifyStripeEvent(rawBody, request.headers.get("stripe-signature"), secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    const outcome = await processStripeEvent(event, { rpc: serverRpc(), expectLivemode: expectedLivemode() });
    return NextResponse.json({ received: true, status: outcome.status }, { status: outcome.httpStatus });
  } catch (err) {
    // Could not even record the event (e.g. database unreachable): ask Stripe to retry.
    console.error("[webhook] processing error", err);
    return NextResponse.json({ error: "Temporary failure" }, { status: 500 });
  }
}
