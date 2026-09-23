/**
 * Checkout-hold abuse guard: one active hold per browser, 3 new holds per IP
 * per rolling hour. Runs the real claim handler (lib/checkout/claim.ts) and the
 * real migrations against local Postgres with a fake Stripe gateway.
 */
import type Stripe from "stripe";
import type { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { abuseKeys, clientIp, CLIENT_COOKIE, normalizeIp, readClientToken } from "@/lib/checkout/abuse";
import { handleClaim, type ClaimDeps } from "@/lib/checkout/claim";
import type { Rpc } from "@/lib/checkout/rpc";
import { CheckoutError, startCheckout, type CheckoutGateway } from "@/lib/checkout/start";
import { processStripeEvent } from "@/lib/checkout/webhook";
import { createTestDatabase, pgReachable, pgRpc } from "../support/pg";

const canRun = await pgReachable();
const DB_NAME = `clawson_abuse_${process.pid}`;
const SECRET = "test-hold-abuse-secret-0123456789abcdef";
const ORIGIN = "https://preview.test";

let pool: Pool;
let drop: () => Promise<void>;
let rpc: Rpc;
let campaignId: string;

const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0] as T;
const count = async (table: string, where = "true", params: unknown[] = []) =>
  Number((await one<{ n: string }>(`select count(*) n from ${table} where ${where}`, params)).n);
const categoryId = async (slug: string) => (await one<{ id: string }>("select id from categories where slug = $1", [slug])).id;
const statusOf = async (slug: string) =>
  (await one<{ status: string }>("select status::text from campaign_inventory($1) where slug = $2", [campaignId, slug]))?.status;

let seq = 0;
function gateway(opts: { fail?: boolean } = {}) {
  const created: Stripe.Checkout.SessionCreateParams[] = [];
  const g: CheckoutGateway = {
    async createSession(params) {
      if (opts.fail) throw new Error("Stripe API unavailable");
      created.push(params);
      seq += 1;
      return { id: `cs_test_guard_${seq}`, url: `https://checkout.stripe.test/c/pay/cs_test_guard_${seq}`, expires_at: params.expires_at! };
    },
    async expireSession() {},
  };
  return { gateway: g, created };
}

function deps(stripe = gateway().gateway, overrides: Partial<ClaimDeps> = {}): ClaimDeps {
  return {
    rpc,
    stripe: () => stripe,
    checkoutEnabled: true,
    abuseSecret: SECRET,
    lookupCategory: async (slug) => {
      const r = await one<{ id: string }>("select id from categories where slug = $1 and active", [slug]);
      return r ? { campaignId, categoryId: r.id, brandName: "The Clawson Local" } : null;
    },
    ...overrides,
  };
}

/** A browser: keeps its cookie between requests. */
function browser(ip: string) {
  let cookie: string | null = null;
  return {
    ip,
    get token() {
      return cookie ? readClientToken(cookie) : null;
    },
    async claim(slug: string, d: ClaimDeps = deps()) {
      const res = await handleClaim(
        new Request(`${ORIGIN}/api/checkout`, {
          method: "POST",
          headers: {
            origin: ORIGIN,
            "content-type": "application/x-www-form-urlencoded",
            "x-real-ip": ip,
            ...(cookie ? { cookie } : {}),
          },
          body: `category=${slug}`,
        }),
        d,
      );
      const set = res.headers.get("set-cookie");
      if (set) cookie = set.split(";")[0];
      return res;
    },
  };
}

const isCheckoutRedirect = (res: Response) => res.status === 303 && /checkout\.stripe\.test/.test(res.headers.get("location") ?? "");

async function releaseHoldOf(slug: string) {
  const r = await one<{ reservation_id: string }>(
    "select reservation_id from campaign_categories where status = 'HELD' and category_id = (select id from categories where slug = $1)",
    [slug],
  );
  await rpc("release_reservation", { p_reservation_id: r.reservation_id, p_status: "RELEASED", p_reason: "test", p_session_id: null });
}

describe.skipIf(!canRun)("checkout hold abuse guard", () => {
  beforeEach(async () => {
    ({ pool, drop } = await createTestDatabase(DB_NAME));
    rpc = pgRpc(pool);
    campaignId = (await one<{ id: string }>("select id from campaigns where is_active")).id;
  });
  afterEach(async () => {
    await drop();
  });

  describe("one active hold per browser", () => {
    it("A. a first-time browser gets a hold and is sent to Stripe Checkout, with a secure HttpOnly cookie", async () => {
      const b = browser("203.0.113.10");
      const res = await b.claim("plumbing");
      expect(isCheckoutRedirect(res)).toBe(true);
      const cookie = res.headers.get("set-cookie")!;
      expect(cookie).toMatch(new RegExp(`^${CLIENT_COOKIE}=[A-Za-z0-9_-]{43}; `));
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Lax");
      expect(cookie).toContain("Secure");
      expect(await statusOf("plumbing")).toBe("HELD");
      const r = await one<{ client_hash: string; ip_hash: string }>("select client_hash, ip_hash from reservations");
      expect(r.client_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(r.ip_hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("B. the same browser cannot create a second active hold (another category)", async () => {
      const b = browser("203.0.113.11");
      expect(isCheckoutRedirect(await b.claim("plumbing"))).toBe(true);
      const res = await b.claim("roofing");
      expect(res.status).toBe(303);
      expect(res.headers.get("location")).toMatch(/\/category\/roofing\?checkout=active_hold&hold=[0-9a-f-]{36}#claim$/);
      expect(await count("reservations")).toBe(1);
      expect(await statusOf("roofing")).toBe("AVAILABLE");
    });

    it("B2. a double-click on the same category reuses the existing Checkout Session", async () => {
      const b = browser("203.0.113.12");
      const first = await b.claim("plumbing");
      const second = await b.claim("plumbing");
      expect(second.headers.get("location")).toBe(first.headers.get("location"));
      expect(await count("reservations")).toBe(1);
    });

    it("C. a different browser can still hold another category", async () => {
      expect(isCheckoutRedirect(await browser("203.0.113.13").claim("plumbing"))).toBe(true);
      expect(isCheckoutRedirect(await browser("198.51.100.13").claim("roofing"))).toBe(true);
      expect(await count("reservations", "status = 'HELD'")).toBe(2);
    });

    it("D. once the browser's hold is released or expires, it may create another", async () => {
      const b = browser("203.0.113.14");
      await b.claim("plumbing");
      await releaseHoldOf("plumbing");
      expect(isCheckoutRedirect(await b.claim("roofing"))).toBe(true);
      // Expire the roofing hold instead of releasing it.
      await pool.query("update reservations set expires_at = now() - interval '1 minute' where status = 'HELD'");
      await pool.query("update campaign_categories set hold_expires_at = now() - interval '1 minute' where status = 'HELD'");
      expect(isCheckoutRedirect(await b.claim("gutter"))).toBe(true);
      expect(await count("reservations", "status = 'HELD'")).toBe(1);
    });

    it("PAID reservations do not count as active holds", async () => {
      const b = browser("203.0.113.15");
      await b.claim("plumbing");
      const adv = await one<{ id: string }>("insert into advertisers (business_name, contact_email) values ('X', 'x@example.com') returning id");
      await pool.query("update reservations set status = 'PAID', paid_at = now(), stripe_checkout_session_id = coalesce(stripe_checkout_session_id, 'cs_test_x'), advertiser_id = $1", [adv.id]);
      expect(isCheckoutRedirect(await b.claim("roofing"))).toBe(true);
    });

    it("J. concurrent claims from the same browser cannot bypass the one-active-hold rule", async () => {
      const keys = abuseKeys("same-browser-token", "203.0.113.16", SECRET);
      const slugs = ["plumbing", "roofing", "gutter", "painting"];
      const results = await Promise.allSettled(
        slugs.map(async (s) =>
          startCheckout(
            { campaignId, categoryId: await categoryId(s), brandName: "B", origin: ORIGIN, termsUrl: "https://t", ...keys },
            { rpc, stripe: gateway().gateway },
          ),
        ),
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      for (const r of results.filter((x) => x.status === "rejected") as PromiseRejectedResult[]) {
        expect((r.reason as CheckoutError).code).toBe("client_has_active_hold");
      }
      expect(await count("reservations")).toBe(1);
      expect(await count("campaign_categories", "status = 'HELD'")).toBe(1);
    });
  });

  describe("3 new holds per IP per rolling hour", () => {
    it("E/F/G. three new holds from one IP succeed; the fourth gets 429 + Retry-After and creates nothing", async () => {
      const ip = "203.0.113.20";
      for (const s of ["plumbing", "roofing", "gutter"]) {
        expect(isCheckoutRedirect(await browser(ip).claim(s))).toBe(true);
      }
      const { gateway: g, created } = gateway();
      const res = await browser(ip).claim("painting", deps(g));
      expect(res.status).toBe(429);
      const retry = Number(res.headers.get("retry-after"));
      expect(retry).toBeGreaterThan(3500);
      expect(retry).toBeLessThanOrEqual(3600);
      expect(await res.text()).toContain("Too many checkout attempts");
      expect(created).toHaveLength(0); // no Stripe Checkout Session
      expect(await count("reservations")).toBe(3); // no reservation
      expect(await statusOf("painting")).toBe("AVAILABLE");
    });

    it("released/expired holds still count toward the hourly limit; it rolls off after 60 minutes", async () => {
      const b = browser("203.0.113.21");
      for (const s of ["plumbing", "roofing", "gutter"]) {
        expect(isCheckoutRedirect(await b.claim(s))).toBe(true);
        await releaseHoldOf(s);
      }
      expect((await b.claim("painting")).status).toBe(429);
      // Oldest attempt leaves the window.
      await pool.query("update reservations set created_at = now() - interval '61 minutes' where id = (select id from reservations order by created_at limit 1)");
      expect(isCheckoutRedirect(await b.claim("painting"))).toBe(true);
    });

    it("H. a different IP is unaffected", async () => {
      for (const s of ["plumbing", "roofing", "gutter"]) await browser("203.0.113.22").claim(s);
      expect((await browser("203.0.113.22").claim("painting")).status).toBe(429);
      expect(isCheckoutRedirect(await browser("198.51.100.22").claim("painting"))).toBe(true);
    });

    it("K. concurrent claims from one IP cannot bypass the hourly limit", async () => {
      const slugs = ["plumbing", "roofing", "gutter", "painting", "moving", "insurance"];
      const results = await Promise.all(slugs.map((s) => browser("203.0.113.23").claim(s)));
      expect(results.filter(isCheckoutRedirect)).toHaveLength(3);
      expect(results.filter((r) => r.status === 429)).toHaveLength(3);
      expect(await count("reservations")).toBe(3);
    });

    it("IPv6 clients are limited per /64 network", async () => {
      expect(normalizeIp("2001:db8:1:2:aaaa::1")).toBe("2001:db8:1:2::/64");
      expect(normalizeIp("2001:DB8:1:2:ffff:ffff:ffff:ffff")).toBe("2001:db8:1:2::/64");
      expect(normalizeIp("::ffff:203.0.113.5")).toBe("203.0.113.5");
      for (const [i, s] of ["plumbing", "roofing", "gutter"].entries()) await browser(`2001:db8:1:2::${i + 1}`).claim(s);
      expect((await browser("2001:db8:1:2:9999::1").claim("painting")).status).toBe(429);
      expect(isCheckoutRedirect(await browser("2001:db8:1:3::1").claim("painting"))).toBe(true);
    });
  });

  describe("privacy and configuration", () => {
    it("I. raw IPs and raw browser tokens are never persisted", async () => {
      const ip = "203.0.113.77";
      const b = browser(ip);
      await b.claim("plumbing");
      const token = b.token!;
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const dump = (
        await pool.query(
          "select coalesce(string_agg(t::text, ' '), '') d from (select row_to_json(r) t from reservations r union all select row_to_json(a) from advertisers a union all select row_to_json(w) from stripe_webhook_events w) x",
        )
      ).rows[0].d as string;
      expect(dump).not.toContain(ip);
      expect(dump).not.toContain(token);
      // Only HMAC digests, which depend on the server secret.
      const r = await one<{ ip_hash: string }>("select ip_hash from reservations");
      expect(r.ip_hash).toBe(abuseKeys(token, ip, SECRET).ipHash);
      expect(r.ip_hash).not.toBe(abuseKeys(token, ip, "a-different-secret-0123456789abcdef").ipHash);
    });

    it("fails closed without HOLD_ABUSE_SECRET: no hold, no Stripe call", async () => {
      const { gateway: g, created } = gateway();
      for (const secret of [undefined, "too-short"]) {
        const res = await browser("203.0.113.30").claim("plumbing", deps(g, { abuseSecret: secret }));
        expect(res.status).toBe(303);
        expect(res.headers.get("location")).toContain("checkout=unavailable");
      }
      expect(created).toHaveLength(0);
      expect(await count("reservations")).toBe(0);
    });

    it("rejects cross-site posts before doing anything", async () => {
      const res = await handleClaim(
        new Request(`${ORIGIN}/api/checkout`, {
          method: "POST",
          headers: { origin: "https://evil.example", "content-type": "application/x-www-form-urlencoded" },
          body: "category=plumbing",
        }),
        deps(),
      );
      expect(res.status).toBe(403);
      expect(res.headers.get("set-cookie")).toBeNull();
      expect(await count("reservations")).toBe(0);
    });

    it("uses Vercel's x-real-ip first, then the first x-forwarded-for entry", () => {
      expect(clientIp(new Headers({ "x-real-ip": "203.0.113.1", "x-forwarded-for": "198.51.100.1, 10.0.0.1" }))).toBe("203.0.113.1");
      expect(clientIp(new Headers({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" }))).toBe("198.51.100.1");
      expect(clientIp(new Headers())).toBe("unknown");
    });
  });

  describe("existing guarantees with the guard in place", () => {
    it("M. 19 sold + two different browsers at once: only one gets the last slot", async () => {
      const slugs = (await pool.query("select slug from categories where active order by priority")).rows.map((r) => r.slug as string);
      for (const s of slugs.slice(0, 19)) {
        await pool.query("update campaign_categories set status = 'SOLD', sold_at = now() where category_id = (select id from categories where slug = $1)", [s]);
      }
      const [a, b] = await Promise.all([browser("203.0.113.40").claim(slugs[19]), browser("198.51.100.40").claim(slugs[20])]);
      expect([a, b].filter(isCheckoutRedirect)).toHaveLength(1);
      expect([a, b].map((r) => r.headers.get("location")).join(" ")).toContain("checkout=campaign_full");
    });

    it("L. two different browsers racing for one category: exactly one hold", async () => {
      const [a, b] = await Promise.all([browser("203.0.113.41").claim("plumbing"), browser("198.51.100.41").claim("plumbing")]);
      expect([a, b].filter(isCheckoutRedirect)).toHaveLength(1);
      expect(await count("reservations")).toBe(1);
    });

    it("Q. Stripe failure releases only this request's reservation, and the browser may retry", async () => {
      const other = browser("198.51.100.42");
      await other.claim("roofing");
      const b = browser("203.0.113.42");
      const res = await b.claim("plumbing", deps(gateway({ fail: true }).gateway));
      expect(res.headers.get("location")).toContain("checkout=checkout_failed");
      expect(await statusOf("plumbing")).toBe("AVAILABLE");
      expect(await statusOf("roofing")).toBe("HELD");
      expect(isCheckoutRedirect(await b.claim("plumbing"))).toBe(true);
    });

    it("N/O/P. webhook: one paid reservation per session, duplicates idempotent, expiry releases only its own hold", async () => {
      await browser("203.0.113.43").claim("plumbing");
      await browser("198.51.100.43").claim("roofing");
      const r = await one<Record<string, string>>("select * from reservations r where category_id = (select id from categories where slug = 'plumbing')");
      const other = await one<Record<string, string>>("select * from reservations r where category_id = (select id from categories where slug = 'roofing')");
      const session = (x: Record<string, string>, extra = {}) =>
        ({
          id: x.stripe_checkout_session_id,
          client_reference_id: x.id,
          metadata: { reservation_id: x.id, campaign_id: x.campaign_id, category_id: x.category_id, conflict_key: x.conflict_key },
          amount_total: 35000,
          currency: "usd",
          payment_status: "paid",
          customer_details: { email: "buyer@example.com" },
          custom_fields: [{ key: "business_name", text: { value: "Guarded Buyer LLC" } }],
          consent: { terms_of_service: "accepted" },
          ...extra,
        }) as unknown as Stripe.Checkout.Session;
      const evt = (type: string, s: Stripe.Checkout.Session, id: string) => ({ id, type, livemode: false, data: { object: s } }) as unknown as Stripe.Event;
      const paid = evt("checkout.session.completed", session(r), "evt_guard_paid");
      expect((await processStripeEvent(paid, { rpc, expectLivemode: false })).detail).toBe("fulfilled");
      expect((await processStripeEvent(paid, { rpc, expectLivemode: false })).status).toBe("duplicate");
      expect((await processStripeEvent(evt("checkout.session.completed", session(r), "evt_guard_paid_2"), { rpc, expectLivemode: false })).detail).toBe("already_paid");
      expect(await count("reservations", "status = 'PAID'")).toBe(1);
      expect(await count("advertisers")).toBe(1);
      expect(await statusOf("plumbing")).toBe("SOLD");
      const exp = evt("checkout.session.expired", session(other, { payment_status: "unpaid" }), "evt_guard_exp");
      expect((await processStripeEvent(exp, { rpc, expectLivemode: false })).detail).toBe("released");
      expect(await statusOf("roofing")).toBe("AVAILABLE");
      expect(await statusOf("plumbing")).toBe("SOLD");
    });
  });
});
