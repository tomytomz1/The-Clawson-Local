/**
 * Phase 3 checkout tests: the real migrations, the real checkout/webhook code
 * (lib/checkout) and a fake Stripe gateway, against local Postgres.
 * Skipped when no Postgres server is reachable (see tests/support/pg.ts).
 */
import type Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { buildSessionParams, CheckoutError, startCheckout, type CheckoutGateway } from "@/lib/checkout/start";
import { processStripeEvent } from "@/lib/checkout/webhook";
import type { Rpc } from "@/lib/checkout/rpc";
import { verifyStripeEvent } from "@/lib/stripe/verify";
import { createTestDatabase, pgReachable, pgRpc } from "../support/pg";

const canRun = await pgReachable();
const DB_NAME = `clawson_checkout_${process.pid}`;

let pool: Pool;
let drop: () => Promise<void>;
let rpc: Rpc;
let campaignId: string;

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows as T[];
const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await q<T>(sql, params))[0];
const categoryId = async (slug: string) => (await one<{ id: string }>("select id from categories where slug = $1", [slug])).id;
const statusOf = async (slug: string) =>
  (await one<{ status: string }>("select status::text from campaign_inventory($1) where slug = $2", [campaignId, slug]))?.status;
const count = async (table: string, where = "true") => Number((await one<{ n: string }>(`select count(*) n from ${table} where ${where}`)).n);

async function reserve(slug: string) {
  const rows = await rpc<{ reservation_id: string }[]>("reserve_category", {
    p_campaign_id: campaignId,
    p_category_id: await categoryId(slug),
    p_hold_minutes: 35,
  });
  return rows[0].reservation_id;
}

async function sellDirect(slugs: string[]) {
  for (const s of slugs) {
    await pool.query(
      "update campaign_categories set status = 'SOLD', sold_at = now() where campaign_id = $1 and category_id = (select id from categories where slug = $2)",
      [campaignId, s],
    );
  }
}

async function activeSlugs() {
  return (await q<{ slug: string }>("select slug from categories where active order by priority")).map((r) => r.slug);
}

/** Pretend the hold on a reservation already ran out. */
async function expireHold(reservationId: string) {
  await pool.query("update reservations set expires_at = now() - interval '1 minute' where id = $1", [reservationId]);
  await pool.query("update campaign_categories set hold_expires_at = now() - interval '1 minute' where reservation_id = $1", [reservationId]);
}

// ---------------------------------------------------------------- fake Stripe

let sessionSeq = 0;
function fakeGateway(opts: { fail?: boolean } = {}) {
  const created: Stripe.Checkout.SessionCreateParams[] = [];
  const expired: string[] = [];
  const gateway: CheckoutGateway = {
    async createSession(params) {
      if (opts.fail) throw new Error("Stripe API unavailable");
      created.push(params);
      sessionSeq += 1;
      return { id: `cs_test_${sessionSeq}`, url: `https://checkout.stripe.test/c/pay/cs_test_${sessionSeq}`, expires_at: params.expires_at! };
    },
    async expireSession(id) {
      expired.push(id);
    },
  };
  return { gateway, created, expired };
}

async function checkout(slug: string, gateway = fakeGateway().gateway) {
  return startCheckout(
    {
      campaignId,
      categoryId: await categoryId(slug),
      brandName: "The Clawson Local",
      origin: "https://preview.test",
      termsUrl: "https://theclawsonlocal.com/terms",
    },
    { rpc, stripe: gateway },
  );
}

let eventSeq = 0;
type SessionOverrides = Partial<Stripe.Checkout.Session> & { metadata?: Record<string, string> };

async function sessionFor(reservationId: string, overrides: SessionOverrides = {}): Promise<Stripe.Checkout.Session> {
  const r = await one<{ stripe_checkout_session_id: string; category_id: string; campaign_id: string; conflict_key: string }>(
    "select stripe_checkout_session_id, category_id, campaign_id, conflict_key from reservations where id = $1",
    [reservationId],
  );
  const { metadata, ...rest } = overrides;
  return {
    id: r.stripe_checkout_session_id,
    object: "checkout.session",
    client_reference_id: reservationId,
    metadata: {
      reservation_id: reservationId,
      campaign_id: r.campaign_id,
      category_id: r.category_id,
      conflict_key: r.conflict_key,
      ...metadata,
    },
    amount_total: 35000,
    currency: "usd",
    payment_status: "paid",
    status: "complete",
    payment_intent: `pi_test_${reservationId.slice(0, 8)}`,
    customer: `cus_test_${reservationId.slice(0, 8)}`,
    customer_details: { email: "owner@example.com" },
    custom_fields: [{ key: "business_name", type: "text", text: { value: "Acme Plumbing Co" } }],
    consent: { terms_of_service: "accepted", promotions: null },
    ...rest,
  } as unknown as Stripe.Checkout.Session;
}

function event(type: string, session: Stripe.Checkout.Session, id = `evt_test_${++eventSeq}`, livemode = false): Stripe.Event {
  return { id, object: "event", type, livemode, data: { object: session } } as unknown as Stripe.Event;
}

const deliver = (e: Stripe.Event) => processStripeEvent(e, { rpc, expectLivemode: false });

// ---------------------------------------------------------------- lifecycle

describe.skipIf(!canRun)("phase 3 checkout", () => {
  beforeEach(async () => {
    ({ pool, drop } = await createTestDatabase(DB_NAME));
    rpc = pgRpc(pool);
    campaignId = (await one<{ id: string }>("select id from campaigns where is_active")).id;
  });
  afterEach(async () => {
    await drop();
  });

  describe("atomic reservations", () => {
    it("1. two simultaneous reservations for the same category: exactly one succeeds", async () => {
      const results = await Promise.allSettled([reserve("plumbing"), reserve("plumbing")]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
      expect(String(rejected.reason)).toMatch(/category_held/);
      expect(await count("reservations", "status = 'HELD'")).toBe(1);
      expect(await statusOf("plumbing")).toBe("HELD");
    });

    it("2. two categories sharing a conflict key: exactly one succeeds", async () => {
      await pool.query(
        "insert into categories (slug, display_name, short_name, conflict_key, priority) values ('furnace-repair', 'Furnace Repair', 'furnace repair', 'hvac', 200)",
      );
      const results = await Promise.allSettled([reserve("hvac"), reserve("furnace-repair")]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(String((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason)).toMatch(/category_held/);
      expect(await statusOf("hvac")).toBe("HELD");
      expect(await statusOf("furnace-repair")).toBe("HELD");
    });

    it("3. an expired hold is released and the category can be reserved again", async () => {
      const first = await reserve("plumbing");
      await expect(reserve("plumbing")).rejects.toThrow(/category_held/);
      await expireHold(first);
      expect(await statusOf("plumbing")).toBe("AVAILABLE"); // public view already ignores expired holds
      const second = await reserve("plumbing");
      expect(second).not.toBe(first);
      expect((await one("select status::text s from reservations where id = $1", [first])).s).toBe("EXPIRED");
      expect((await one("select reservation_id from campaign_categories where reservation_id is not null")).reservation_id).toBe(second);
    });

    it("5. 19 sold + two simultaneous reservations: only one takes the last slot", async () => {
      const slugs = await activeSlugs();
      await sellDirect(slugs.slice(0, 19));
      const results = await Promise.allSettled([reserve(slugs[19]), reserve(slugs[20])]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(String((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason)).toMatch(/campaign_full/);
      expect(await count("campaign_categories", "status = 'HELD'")).toBe(1);
      // A third, later attempt is also refused while the hold is live.
      await expect(reserve(slugs[21])).rejects.toThrow(/campaign_full/);
    });

    it("6. 20 sold: no new reservation can be created", async () => {
      const slugs = await activeSlugs();
      await sellDirect(slugs.slice(0, 20));
      expect((await one("select status::text s from campaigns where id = $1", [campaignId])).s).toBe("SOLD_OUT");
      await expect(reserve(slugs[25])).rejects.toThrow(/campaign_not_open/);
      expect(await count("reservations")).toBe(0);
    });

    it("refuses closed, sold, inactive and not-open cases", async () => {
      await pool.query("update campaign_categories set manually_closed = true where category_id = (select id from categories where slug = 'roofing')");
      await expect(reserve("roofing")).rejects.toThrow(/category_closed/);
      await sellDirect(["painting"]);
      await expect(reserve("painting")).rejects.toThrow(/category_sold/);
      await pool.query("update categories set active = false where slug = 'moving'");
      await expect(reserve("moving")).rejects.toThrow(/category_not_found/);
      await pool.query("update campaigns set status = 'PRELAUNCH' where id = $1", [campaignId]);
      await expect(reserve("gutter")).rejects.toThrow(/campaign_not_open/);
    });
  });

  describe("checkout session", () => {
    it("builds the Session from database values with consent, business name and metadata", async () => {
      const { gateway, created } = fakeGateway();
      const before = Date.now();
      const result = await checkout("plumbing", gateway);
      const p = created[0];
      expect(p.mode).toBe("payment");
      expect(p.payment_method_types).toEqual(["card"]);
      expect(p.line_items?.[0]).toMatchObject({ quantity: 1, price_data: { currency: "usd", unit_amount: 35000 } });
      expect(p.consent_collection).toEqual({ terms_of_service: "required" });
      expect(p.custom_fields?.[0]).toMatchObject({ key: "business_name", type: "text", optional: false });
      expect(p.client_reference_id).toBe(result.reservationId);
      expect(p.metadata).toMatchObject({ reservation_id: result.reservationId, campaign_id: campaignId, category_slug: "plumbing", conflict_key: "plumbing" });
      expect(p.success_url).toBe("https://preview.test/checkout/success?session_id={CHECKOUT_SESSION_ID}");
      // Stripe minimum is 30 minutes; we add a buffer.
      const minutes = (p.expires_at! * 1000 - before) / 60000;
      expect(minutes).toBeGreaterThan(30);
      expect(minutes).toBeLessThan(32);
      // Hold is aligned to the Session expiry plus grace.
      const r = await one<{ expires_at: Date; stripe_session_expires_at: Date; stripe_checkout_session_id: string }>(
        "select expires_at, stripe_session_expires_at, stripe_checkout_session_id from reservations where id = $1",
        [result.reservationId],
      );
      expect(r.stripe_checkout_session_id).toBe(result.sessionId);
      expect(r.stripe_session_expires_at.getTime()).toBe(p.expires_at! * 1000);
      expect(r.expires_at.getTime() - r.stripe_session_expires_at.getTime()).toBe(300_000);
      const inv = await one<{ hold_expires_at: Date }>("select hold_expires_at from campaign_categories where reservation_id = $1", [result.reservationId]);
      expect(inv.hold_expires_at.getTime()).toBe(r.expires_at.getTime());
    });

    it("price comes from the campaign row, not the caller", async () => {
      await pool.query("update campaigns set price_cents = 42000 where id = $1", [campaignId]);
      const { gateway, created } = fakeGateway();
      await checkout("plumbing", gateway);
      expect(created[0].line_items?.[0].price_data?.unit_amount).toBe(42000);
    });

    it("4. if Checkout creation fails, the provisional hold is released immediately", async () => {
      const err = await checkout("plumbing", fakeGateway({ fail: true }).gateway).catch((e) => e);
      expect(err).toBeInstanceOf(CheckoutError);
      expect(err.code).toBe("checkout_failed");
      expect(await statusOf("plumbing")).toBe("AVAILABLE");
      expect(await count("campaign_categories", "status = 'HELD'")).toBe(0);
      const r = await one<{ status: string; failure_reason: string }>("select status::text, failure_reason from reservations");
      expect(r.status).toBe("RELEASED");
      expect(r.failure_reason).toMatch(/checkout_session_create_failed/);
      // The category can be reserved again straight away.
      await expect(checkout("plumbing")).resolves.toBeTruthy();
    });

    it("maps reservation refusals to checkout error codes", async () => {
      await checkout("plumbing");
      const err = await checkout("plumbing").catch((e) => e);
      expect(err).toBeInstanceOf(CheckoutError);
      expect(err.code).toBe("category_held");
    });

    it("buildSessionParams never uses a price other than the reservation's", () => {
      const p = buildSessionParams(
        { campaignId: "c", categoryId: "k", brandName: "B", origin: "https://x", termsUrl: "https://x/terms" },
        { reservation_id: "r", expires_at: "", amount_cents: 35000, currency: "usd", conflict_key: "k", category_slug: "s", category_name: "S", campaign_name: "E" },
        0,
      );
      expect(p.line_items).toHaveLength(1);
      expect(p.line_items?.[0].price_data?.unit_amount).toBe(35000);
    });
  });

  describe("webhook fulfillment", () => {
    it("14. public inventory goes AVAILABLE -> HELD -> SOLD, and the sale is recorded once", async () => {
      expect(await statusOf("plumbing")).toBe("AVAILABLE");
      const { reservationId } = await checkout("plumbing");
      expect(await statusOf("plumbing")).toBe("HELD");
      const out = await deliver(event("checkout.session.completed", await sessionFor(reservationId)));
      expect(out).toMatchObject({ status: "processed", httpStatus: 200, detail: "fulfilled" });
      expect(await statusOf("plumbing")).toBe("SOLD");
      const r = await one<Record<string, unknown>>("select status::text, business_name, customer_email, terms_accepted, advertiser_id, paid_at from reservations where id = $1", [reservationId]);
      expect(r).toMatchObject({ status: "PAID", business_name: "Acme Plumbing Co", customer_email: "owner@example.com", terms_accepted: true });
      const inv = await one<Record<string, unknown>>("select status::text, advertiser_id, reservation_id, hold_expires_at, sold_at from campaign_categories where reservation_id = $1", [reservationId]);
      expect(inv).toMatchObject({ status: "SOLD", advertiser_id: r.advertiser_id, hold_expires_at: null });
      expect(inv.sold_at).not.toBeNull();
      expect(await one("select business_name, contact_email, stripe_customer_id from advertisers")).toMatchObject({
        business_name: "Acme Plumbing Co",
        contact_email: "owner@example.com",
      });
      expect((await one("select campaign_sold_count($1) n", [campaignId])).n).toBe(1);
    });

    it("7. the same webhook event delivered twice creates exactly one sale", async () => {
      const { reservationId } = await checkout("plumbing");
      const e = event("checkout.session.completed", await sessionFor(reservationId));
      expect((await deliver(e)).status).toBe("processed");
      expect(await deliver(e)).toMatchObject({ status: "duplicate", httpStatus: 200 });
      expect(await count("advertisers")).toBe(1);
      expect(await count("campaign_categories", "status = 'SOLD'")).toBe(1);
      expect(await one("select status, attempts from stripe_webhook_events where event_id = $1", [e.id])).toMatchObject({ status: "processed", attempts: 1 });
    });

    it("8. the same paid session under two different events creates exactly one sale", async () => {
      const { reservationId } = await checkout("plumbing");
      const s = await sessionFor(reservationId);
      expect((await deliver(event("checkout.session.completed", s))).detail).toBe("fulfilled");
      expect((await deliver(event("checkout.session.completed", s))).detail).toBe("already_paid");
      expect(await count("advertisers")).toBe(1);
      expect(await count("reservations", "status = 'PAID'")).toBe(1);
    });

    it("concurrent deliveries of the same payment still produce one sale", async () => {
      const { reservationId } = await checkout("plumbing");
      const s = await sessionFor(reservationId);
      const outs = await Promise.all([deliver(event("checkout.session.completed", s)), deliver(event("checkout.session.completed", s))]);
      expect(outs.map((o) => o.detail).sort()).toEqual(["already_paid", "fulfilled"]);
      expect(await count("advertisers")).toBe(1);
    });

    it("9. an expired Checkout event releases only its own hold", async () => {
      const a = await checkout("plumbing");
      const b = await checkout("roofing");
      const out = await deliver(event("checkout.session.expired", await sessionFor(a.reservationId, { status: "expired", payment_status: "unpaid" })));
      expect(out).toMatchObject({ status: "processed", detail: "released" });
      expect(await statusOf("plumbing")).toBe("AVAILABLE");
      expect(await statusOf("roofing")).toBe("HELD");
      expect((await one("select status::text s from reservations where id = $1", [a.reservationId])).s).toBe("EXPIRED");
      expect((await one("select status::text s from reservations where id = $1", [b.reservationId])).s).toBe("HELD");
    });

    it("10. an old expiration event does not release a newer reservation", async () => {
      const old = await checkout("plumbing");
      const oldSession = await sessionFor(old.reservationId, { status: "expired", payment_status: "unpaid" });
      await expireHold(old.reservationId);
      const fresh = await checkout("plumbing"); // sweeps the old hold, takes the category
      const out = await deliver(event("checkout.session.expired", oldSession));
      expect(out).toMatchObject({ status: "processed", detail: "already_finished" });
      expect(await statusOf("plumbing")).toBe("HELD");
      expect((await one("select reservation_id from campaign_categories where status = 'HELD'")).reservation_id).toBe(fresh.reservationId);
      expect((await one("select status::text s from reservations where id = $1", [fresh.reservationId])).s).toBe("HELD");
    });

    it("11. an amount mismatch is refused and recorded", async () => {
      const { reservationId } = await checkout("plumbing");
      const e = event("checkout.session.completed", await sessionFor(reservationId, { amount_total: 100 }));
      const out = await deliver(e);
      expect(out).toMatchObject({ status: "failed", httpStatus: 200 });
      expect(out.detail).toMatch(/amount_mismatch/);
      expect(await one("select status, error, reservation_id from stripe_webhook_events where event_id = $1", [e.id])).toMatchObject({
        status: "failed",
        reservation_id: reservationId,
      });
      expect((await one<{ error: string }>("select error from stripe_webhook_events where event_id = $1", [e.id])).error).toMatch(/amount_mismatch/);
      expect(await count("advertisers")).toBe(0);
      expect(await statusOf("plumbing")).toBe("HELD");
    });

    it("refuses a currency mismatch", async () => {
      const { reservationId } = await checkout("plumbing");
      const out = await deliver(event("checkout.session.completed", await sessionFor(reservationId, { currency: "cad" })));
      expect(out.detail).toMatch(/currency_mismatch/);
      expect(await count("advertisers")).toBe(0);
    });

    it("12. wrong campaign or category metadata is refused", async () => {
      const { reservationId } = await checkout("plumbing");
      const other = await categoryId("roofing");
      const badCategory = await deliver(event("checkout.session.completed", await sessionFor(reservationId, { metadata: { category_id: other } })));
      expect(badCategory).toMatchObject({ status: "failed", httpStatus: 200 });
      expect(badCategory.detail).toMatch(/category_mismatch/);
      const badCampaign = await deliver(
        event("checkout.session.completed", await sessionFor(reservationId, { metadata: { campaign_id: "00000000-0000-0000-0000-000000000000" } })),
      );
      expect(badCampaign.detail).toMatch(/campaign_mismatch/);
      const badRef = await deliver(event("checkout.session.completed", await sessionFor(reservationId, { client_reference_id: "someone-else" })));
      expect(badRef.detail).toMatch(/metadata_mismatch/);
      const badSession = await deliver(event("checkout.session.completed", await sessionFor(reservationId, { id: "cs_test_forged" })));
      expect(badSession.detail).toMatch(/session_mismatch/);
      expect(await count("advertisers")).toBe(0);
      expect(await statusOf("plumbing")).toBe("HELD");
      expect(await statusOf("roofing")).toBe("AVAILABLE");
    });

    it("does not fulfill a completed-but-unpaid session; holds it until the delayed payment settles", async () => {
      const { reservationId } = await checkout("plumbing");
      const unpaid = await sessionFor(reservationId, { payment_status: "unpaid" });
      expect(await deliver(event("checkout.session.completed", unpaid))).toMatchObject({ status: "processed", detail: "awaiting_async_payment" });
      expect((await one("select status::text s from reservations")).s).toBe("PROCESSING");
      expect(await statusOf("plumbing")).toBe("HELD");
      expect(await count("advertisers")).toBe(0);
      const paid = await sessionFor(reservationId, { payment_status: "paid" });
      expect((await deliver(event("checkout.session.async_payment_succeeded", paid))).detail).toBe("fulfilled");
      expect(await statusOf("plumbing")).toBe("SOLD");
    });

    it("a failed delayed payment releases the category", async () => {
      const { reservationId } = await checkout("plumbing");
      await deliver(event("checkout.session.completed", await sessionFor(reservationId, { payment_status: "unpaid" })));
      const out = await deliver(event("checkout.session.async_payment_failed", await sessionFor(reservationId, { payment_status: "unpaid" })));
      expect(out.detail).toBe("released");
      expect((await one("select status::text s from reservations")).s).toBe("FAILED");
      expect(await statusOf("plumbing")).toBe("AVAILABLE");
    });

    it("13. payment #20 sells out the campaign", async () => {
      const slugs = await activeSlugs();
      await sellDirect(slugs.slice(0, 19));
      const { reservationId } = await checkout(slugs[19]);
      expect((await deliver(event("checkout.session.completed", await sessionFor(reservationId)))).detail).toBe("fulfilled");
      expect((await one("select status::text s from campaigns where id = $1", [campaignId])).s).toBe("SOLD_OUT");
      const inv = await q<{ status: string }>("select status::text from campaign_inventory($1)", [campaignId]);
      expect(inv.filter((r) => r.status === "SOLD")).toHaveLength(20);
      expect(inv.filter((r) => r.status === "CLOSED")).toHaveLength(10);
      await expect(reserve(slugs[25])).rejects.toThrow(/campaign_not_open/);
    });

    it("15. conflict aliases show the effective HELD then SOLD state", async () => {
      await pool.query(
        "insert into categories (slug, display_name, short_name, conflict_key, priority) values ('furnace-repair', 'Furnace Repair', 'furnace repair', 'hvac', 200)",
      );
      const { reservationId } = await checkout("hvac");
      expect(await statusOf("hvac")).toBe("HELD");
      expect(await statusOf("furnace-repair")).toBe("HELD");
      await expect(reserve("furnace-repair")).rejects.toThrow(/category_held/);
      await deliver(event("checkout.session.completed", await sessionFor(reservationId)));
      expect(await statusOf("hvac")).toBe("SOLD");
      expect(await statusOf("furnace-repair")).toBe("SOLD");
      await expect(reserve("furnace-repair")).rejects.toThrow(/category_sold/);
    });

    it("a payment confirmed after the hold lapsed still wins the category if nobody else took it", async () => {
      const { reservationId } = await checkout("plumbing");
      const s = await sessionFor(reservationId);
      await expireHold(reservationId);
      await rpc("release_expired_holds", { p_campaign_id: campaignId });
      expect(await statusOf("plumbing")).toBe("AVAILABLE");
      expect((await deliver(event("checkout.session.completed", s))).detail).toBe("fulfilled");
      expect(await statusOf("plumbing")).toBe("SOLD");
    });

    it("a payment confirmed after someone else took the category is flagged for refund, not sold twice", async () => {
      const first = await checkout("plumbing");
      const s = await sessionFor(first.reservationId);
      await expireHold(first.reservationId);
      const second = await checkout("plumbing");
      await deliver(event("checkout.session.completed", await sessionFor(second.reservationId)));
      const out = await deliver(event("checkout.session.completed", s));
      expect(out).toMatchObject({ status: "failed", httpStatus: 200 });
      expect(out.detail).toMatch(/refund_required/);
      expect((await one("select status::text s from reservations where id = $1", [first.reservationId])).s).toBe("REFUND_REQUIRED");
      expect(await count("advertisers")).toBe(1);
      expect(await count("campaign_categories", "status = 'SOLD'")).toBe(1);
    });

    it("ignores live-mode events on a test deployment and unrelated event types", async () => {
      const { reservationId } = await checkout("plumbing");
      const live = await deliver(event("checkout.session.completed", await sessionFor(reservationId), undefined, true));
      expect(live.status).toBe("ignored");
      expect(await statusOf("plumbing")).toBe("HELD");
      const other = await deliver({ id: "evt_other", object: "event", type: "customer.created", livemode: false, data: { object: {} } } as unknown as Stripe.Event);
      expect(other.status).toBe("ignored");
    });

    it("retries a transient failure: the event is re-processed on Stripe's next delivery", async () => {
      const { reservationId } = await checkout("plumbing");
      const e = event("checkout.session.completed", await sessionFor(reservationId));
      let calls = 0;
      const flaky: Rpc = async (fn, args) => {
        if (fn === "fulfill_reservation" && calls++ === 0) throw new Error("connection reset");
        return rpc(fn, args);
      };
      expect(await processStripeEvent(e, { rpc: flaky, expectLivemode: false })).toMatchObject({ status: "failed", httpStatus: 500 });
      expect(await statusOf("plumbing")).toBe("HELD");
      expect(await processStripeEvent(e, { rpc: flaky, expectLivemode: false })).toMatchObject({ status: "processed", detail: "fulfilled" });
      expect(await one("select status, attempts from stripe_webhook_events where event_id = $1", [e.id])).toMatchObject({ status: "processed", attempts: 2 });
    });
  });

  describe("signature verification", () => {
    it("accepts a correctly signed raw body and rejects a tampered or unsigned one", async () => {
      const StripeLib = (await import("stripe")).default;
      const body = JSON.stringify({ id: "evt_sig", object: "event", type: "checkout.session.expired", livemode: false, data: { object: {} } });
      const secret = "whsec_test_secret";
      const header = StripeLib.webhooks.generateTestHeaderString({ payload: body, secret });
      expect(verifyStripeEvent(body, header, secret).id).toBe("evt_sig");
      expect(() => verifyStripeEvent(body.replace("evt_sig", "evt_forged"), header, secret)).toThrow();
      expect(() => verifyStripeEvent(body, header, "whsec_other")).toThrow();
      expect(() => verifyStripeEvent(body, null, secret)).toThrow();
    });
  });

  describe("security", () => {
    it("anon and authenticated cannot read or write the new tables or call the new functions", async () => {
      for (const role of ["anon", "authenticated"]) {
        for (const t of ["reservations", "advertisers", "stripe_webhook_events"]) {
          const { rows } = await pool.query("select has_table_privilege($1, $2, 'select') s, has_table_privilege($1, $2, 'insert') i", [role, `public.${t}`]);
          expect(rows[0], `${role} ${t}`).toEqual({ s: false, i: false });
        }
        for (const f of [
          "reserve_category(uuid, uuid, integer)",
          "fulfill_reservation(uuid, text, uuid, uuid, integer, text, text, text, text, text, boolean, text)",
          "release_reservation(uuid, public.reservation_status, text, text)",
          "attach_checkout_session(uuid, text, text, timestamptz, integer)",
          "mark_reservation_processing(uuid, text, integer)",
          "release_expired_holds(uuid)",
          "begin_webhook_event(text, text, boolean)",
          "finish_webhook_event(text, text, uuid, text)",
        ]) {
          const { rows } = await pool.query("select has_function_privilege($1, $2, 'execute') ok", [role, `public.${f}`]);
          expect(rows[0].ok, `${role} ${f}`).toBe(false);
        }
      }
    });

    it("anon still reads public inventory (Phase 2 behavior unchanged)", async () => {
      const c = await pool.connect();
      try {
        await c.query("begin; set local role anon");
        const { rows } = await c.query("select count(*)::int n from campaign_inventory($1)", [campaignId]);
        expect(rows[0].n).toBe(30);
        await expect(c.query("select * from reservations")).rejects.toThrow(/permission denied/);
      } finally {
        await c.query("rollback").catch(() => {});
        c.release();
      }
    });
  });
});
