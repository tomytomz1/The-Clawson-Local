import "server-only";
import { connection } from "next/server";
import { getAdminClient } from "@/lib/db/supabase";

export type BuyerReservationStatus = "HELD" | "PROCESSING" | "PAID" | "EXPIRED" | "RELEASED" | "FAILED" | "REFUND_REQUIRED";

/** What the buyer's own success/cancel page may show. No emails or Stripe ids beyond their session. */
export type BuyerReservation = {
  id: string;
  status: BuyerReservationStatus;
  sessionId: string | null;
  checkoutUrl: string | null;
  expiresAt: string;
  amountCents: number;
  currency: string;
  businessName: string | null;
  categoryName: string;
  categorySlug: string;
  campaignName: string;
  marketName: string;
};

type Row = {
  id: string;
  status: BuyerReservationStatus;
  stripe_checkout_session_id: string | null;
  stripe_checkout_url: string | null;
  expires_at: string;
  amount_cents: number;
  currency: string;
  business_name: string | null;
  categories: { display_name: string; slug: string } | null;
  campaigns: { name: string; market: string } | null;
};

const COLUMNS =
  "id, status, stripe_checkout_session_id, stripe_checkout_url, expires_at, amount_cents, currency, business_name, categories(display_name, slug), campaigns(name, market)";

function map(r: Row): BuyerReservation {
  return {
    id: r.id,
    status: r.status,
    sessionId: r.stripe_checkout_session_id,
    checkoutUrl: r.stripe_checkout_url,
    expiresAt: r.expires_at,
    amountCents: r.amount_cents,
    currency: r.currency,
    businessName: r.business_name,
    categoryName: r.categories?.display_name ?? "Your category",
    categorySlug: r.categories?.slug ?? "",
    campaignName: r.campaigns?.name ?? "",
    marketName: r.campaigns?.market ?? "",
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** By Stripe Checkout Session id (from the success redirect). */
export async function getReservationBySession(sessionId: string): Promise<BuyerReservation | null> {
  await connection();
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) return null;
  const { data, error } = await getAdminClient()
    .from("reservations")
    .select(COLUMNS)
    .eq("stripe_checkout_session_id", sessionId)
    .maybeSingle<Row>();
  if (error) throw error;
  return data ? map(data) : null;
}

/** By reservation id (from the cancel redirect; the id is an unguessable UUID). */
export async function getReservationForBuyer(id: string): Promise<BuyerReservation | null> {
  await connection();
  if (!UUID.test(id)) return null;
  const { data, error } = await getAdminClient().from("reservations").select(COLUMNS).eq("id", id).maybeSingle<Row>();
  if (error) throw error;
  return data ? map(data) : null;
}
