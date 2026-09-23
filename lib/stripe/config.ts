import "server-only";
import Stripe from "stripe";

/**
 * Server-only Stripe client. Keys never use a NEXT_PUBLIC_ prefix and are never
 * sent to the browser (Checkout is a Stripe-hosted redirect, so no publishable
 * key is needed).
 *
 * Phase 3 is test mode only: a live key is refused unless STRIPE_ALLOW_LIVE is
 * explicitly "true".
 */
export class StripeNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeNotConfiguredError";
  }
}

export function stripeKeyStatus(key = process.env.STRIPE_SECRET_KEY): "missing" | "test" | "live" | "live_blocked" {
  if (!key) return "missing";
  if (/^(sk|rk)_test_/.test(key)) return "test";
  if (/^(sk|rk)_live_/.test(key)) return process.env.STRIPE_ALLOW_LIVE === "true" ? "live" : "live_blocked";
  return "missing";
}

/** True when self-service checkout can run in this environment. */
export function isStripeCheckoutEnabled(): boolean {
  const s = stripeKeyStatus();
  return s === "test" || s === "live";
}

let client: Stripe | undefined;

export function getStripe(): Stripe {
  const status = stripeKeyStatus();
  if (status === "missing") throw new StripeNotConfiguredError("STRIPE_SECRET_KEY is not configured");
  if (status === "live_blocked") throw new StripeNotConfiguredError("Live Stripe keys are disabled for this deployment");
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY!, {
    maxNetworkRetries: 2,
    timeout: 20_000,
    appInfo: { name: "The Clawson Local" },
    ...mockServerOptions(),
  });
  return client;
}

export function getWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new StripeNotConfiguredError("STRIPE_WEBHOOK_SECRET is not configured");
  return secret;
}

/** Livemode events are only accepted by a deployment running a live key. */
export function expectedLivemode(): boolean {
  return stripeKeyStatus() === "live";
}

/**
 * Local testing only: point the SDK at stripe-mock (STRIPE_MOCK_URL, e.g.
 * http://localhost:12111). Ignored on Vercel so a stray variable can never
 * redirect real payments.
 */
function mockServerOptions(): Partial<Stripe.StripeConfig> {
  const url = process.env.STRIPE_MOCK_URL;
  if (!url || process.env.VERCEL) return {};
  const u = new URL(url);
  return { host: u.hostname, port: Number(u.port), protocol: u.protocol.replace(":", "") as "http" | "https" };
}
