import { NextResponse } from "next/server";
import { getReservationForBuyer } from "@/lib/checkout/reservations";
import { isSameOrigin, serverRpc, stripeGateway } from "@/lib/checkout/server";

/**
 * Buyer gives up a hold from the cancel page. The Checkout Session is expired
 * first so it can no longer be paid; then the category is released. If Stripe
 * says the Session already completed, nothing is released (the webhook will
 * settle it).
 */
export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const form = await request.formData().catch(() => null);
  const id = String(form?.get("reservation") ?? "");
  const reservation = await getReservationForBuyer(id);
  if (!reservation) return NextResponse.redirect(`${origin}/categories`, 303);
  const done = () => NextResponse.redirect(`${origin}/checkout/cancel?reservation=${reservation.id}`, 303);

  if (reservation.status !== "HELD") return done();
  try {
    if (reservation.sessionId) await stripeGateway().expireSession(reservation.sessionId);
    await serverRpc()("release_reservation", {
      p_reservation_id: reservation.id,
      p_status: "RELEASED",
      p_reason: "released by buyer",
      p_session_id: reservation.sessionId,
    });
  } catch (err) {
    console.error("[checkout] release failed", err);
  }
  return done();
}
