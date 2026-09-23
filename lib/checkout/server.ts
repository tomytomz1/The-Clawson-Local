import "server-only";
import { getAdminClient } from "@/lib/db/supabase";
import { getStripe } from "@/lib/stripe/config";
import { supabaseRpc, type Rpc } from "./rpc";
import type { CheckoutGateway } from "./start";

/** Service-role database port. Server only; never reachable from the browser. */
export function serverRpc(): Rpc {
  return supabaseRpc(getAdminClient());
}

/** Real Stripe implementation of the checkout gateway. */
export function stripeGateway(): CheckoutGateway {
  const stripe = getStripe();
  return {
    createSession: (params, options) => stripe.checkout.sessions.create(params, options),
    expireSession: (id) => stripe.checkout.sessions.expire(id),
  };
}

/** Reject cross-site form posts: the request must come from this deployment. */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  return origin === new URL(request.url).origin;
}
