/**
 * Phase 4 advertiser intake tests: the real migrations and the real intake
 * code (lib/intake) against local Postgres, with an in-memory stand-in for the
 * private Storage bucket. Paid advertisers are created through the real
 * checkout + webhook code. Skipped when no Postgres server is reachable.
 */
import { readFileSync } from "node:fs";
import type Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import type { Rpc } from "@/lib/checkout/rpc";
import { startCheckout, type CheckoutGateway } from "@/lib/checkout/start";
import { processStripeEvent } from "@/lib/checkout/webhook";
import {
  completeUpload,
  ensureIntakeLink,
  getIntake,
  IntakeError,
  removeAsset,
  requestUpload,
  saveIntake,
  type IntakeDeps,
} from "@/lib/intake/service";
import { deriveIntakeToken, hashIntakeToken } from "@/lib/intake/token";
import { createTestDatabase, pgReachable, pgRpc } from "../support/pg";
import { fakeStorage, FILES } from "../support/storage";

const canRun = await pgReachable();
const DB_NAME = `clawson_intake_${process.pid}`;
const SECRET = "test-intake-secret-0123456789-abcdefghijklmnop";

let pool: Pool;
let drop: () => Promise<void>;
let rpc: Rpc;
let campaignId: string;
let fs: ReturnType<typeof fakeStorage>;
let deps: IntakeDeps;

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows as T[];
const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await q<T>(sql, params))[0];
const count = async (table: string, where = "true", params: unknown[] = []) =>
  Number((await one<{ n: string }>(`select count(*) n from ${table} where ${where}`, params)).n);

let seq = 0;
const gateway: CheckoutGateway = {
  async createSession(params) {
    seq += 1;
    return { id: `cs_test_intake${seq}`, url: `https://checkout.stripe.test/${seq}`, expires_at: params.expires_at! };
  },
  async expireSession() {},
};

/** Hold a category through the real checkout code (reservation stays HELD). */
async function hold(slug: string) {
  const category = await one<{ id: string }>("select id from categories where slug = $1", [slug]);
  return startCheckout(
    { campaignId, categoryId: category.id, brandName: "The Clawson Local", origin: "https://preview.test", termsUrl: "https://preview.test/terms" },
    { rpc, stripe: gateway },
  );
}

/** A PAID advertiser, via the real webhook. Clearly identifiable test data. */
async function paidAdvertiser(slug: string, business: string) {
  const { reservationId, sessionId } = await hold(slug);
  const r = await one<{ category_id: string; conflict_key: string }>("select category_id, conflict_key from reservations where id = $1", [reservationId]);
  const session = {
    id: sessionId,
    object: "checkout.session",
    client_reference_id: reservationId,
    metadata: { reservation_id: reservationId, campaign_id: campaignId, category_id: r.category_id, conflict_key: r.conflict_key },
    amount_total: 35000,
    currency: "usd",
    payment_status: "paid",
    status: "complete",
    payment_intent: `pi_test_${seq}`,
    customer: `cus_test_${seq}`,
    customer_details: { email: `${slug}@intake-test.example` },
    custom_fields: [{ key: "business_name", type: "text", text: { value: business } }],
    consent: { terms_of_service: "accepted" },
  } as unknown as Stripe.Checkout.Session;
  const outcome = await processStripeEvent(
    { id: `evt_intake_${seq}`, object: "event", type: "checkout.session.completed", livemode: false, data: { object: session } } as unknown as Stripe.Event,
    { rpc, expectLivemode: false },
  );
  expect(outcome.detail).toBe("fulfilled");
  const { advertiser_id } = await one<{ advertiser_id: string }>("select advertiser_id from reservations where id = $1", [reservationId]);
  const token = await ensureIntakeLink(advertiser_id, { rpc, secret: SECRET });
  expect(token).toBeTruthy();
  return { advertiserId: advertiser_id, reservationId, token: token! };
}

const FULL_BUILD = {
  design_choice: "BUILD_FOR_ME",
  business_name: "Intake Test Plumbing LLC",
  contact_name: "Pat Tester",
  contact_email: "pat@intake-test.example",
  phone: "(248) 555-0100",
  website_url: "intake-test.example",
  headline: "  Clawson’s family plumber  ",
  offer: "$50 off your first service call",
  call_to_action: "Call 248-555-0100 today",
  qr_url: "https://intake-test.example/offer",
  notes: "Use our blue.",
};

async function upload(token: string, kind: string, name: string, bytes: Uint8Array, contentType: string, declaredType = contentType) {
  const r = await requestUpload(token, { kind, filename: name, contentType: declaredType, size: bytes.length }, deps);
  fs.put(r.uploadUrl, bytes, contentType);
  return completeUpload(token, r.assetId, deps);
}

async function rejects(p: Promise<unknown>, code: IntakeError["code"]) {
  const err = await p.then(
    () => null,
    (e) => e,
  );
  expect(err).toBeInstanceOf(IntakeError);
  expect((err as IntakeError).code).toBe(code);
  return err as IntakeError;
}

describe.skipIf(!canRun)("phase 4 advertiser intake", () => {
  beforeEach(async () => {
    ({ pool, drop } = await createTestDatabase(DB_NAME));
    rpc = pgRpc(pool);
    campaignId = (await one<{ id: string }>("select id from campaigns where is_active")).id;
    fs = fakeStorage();
    deps = { rpc, storage: fs.storage, secret: SECRET };
  });
  afterEach(async () => {
    await drop();
  });

  it("A. a PAID advertiser can open a valid intake link", async () => {
    const a = await paidAdvertiser("plumbing", "Intake Test Plumbing LLC");
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.token).toBe(deriveIntakeToken(a.advertiserId, SECRET)); // re-derivable for success page/admin
    const view = await getIntake(a.token, deps);
    expect(view?.intake.status).toBe("NOT_STARTED");
    expect(view?.intake.categoryName).toBe("Plumbing");
    expect(view?.intake.fields.business_name).toBe("Intake Test Plumbing LLC"); // prefilled from checkout
    expect(view?.intake.fields.contact_email).toBe("plumbing@intake-test.example");
    expect(view?.assets).toEqual([]);
    // Only the hash is stored; the raw token never reaches the database.
    const row = await one<{ token_hash: string }>("select token_hash from advertiser_intakes where advertiser_id = $1", [a.advertiserId]);
    expect(row.token_hash).toBe(hashIntakeToken(a.token));
    expect(JSON.stringify(await q("select * from advertiser_intakes"))).not.toContain(a.token);
  });

  it("B. an unpaid (HELD) reservation cannot get or use an intake", async () => {
    const held = await hold("roofing");
    expect((await one("select status::text s, advertiser_id from reservations where id = $1", [held.reservationId])).s).toBe("HELD");
    // No advertiser exists yet for a HELD reservation; an advertiser row without a PAID reservation is refused too.
    const [{ id: advertiserId }] = await q<{ id: string }>(
      "insert into advertisers (business_name, contact_email) values ('Intake Test Unpaid', 'unpaid@intake-test.example') returning id",
    );
    expect(await ensureIntakeLink(advertiserId, { rpc, secret: SECRET })).toBeNull();
    await expect(rpc("ensure_advertiser_intake", { p_advertiser_id: advertiserId, p_token_hash: "a".repeat(64) })).rejects.toThrow(/advertiser_not_paid/);
    const guessed = deriveIntakeToken(advertiserId, SECRET);
    expect(await getIntake(guessed, deps)).toBeNull();
    await rejects(saveIntake(guessed, FULL_BUILD, false, deps), "not_found");
    await rejects(requestUpload(guessed, { kind: "logo", filename: "l.png", contentType: "image/png", size: 10 }, deps), "not_found");
    expect(await count("advertiser_intakes")).toBe(0);

    // A paid advertiser whose reservation later stops being PAID loses access.
    const paid = await paidAdvertiser("plumbing", "Intake Test Plumbing LLC");
    await pool.query("update reservations set status = 'REFUND_REQUIRED' where id = $1", [paid.reservationId]);
    expect(await getIntake(paid.token, deps)).toBeNull();
    await rejects(saveIntake(paid.token, FULL_BUILD, false, deps), "not_found");
  });

  it("C. invalid tokens are rejected, and everything is refused without the secret", async () => {
    const a = await paidAdvertiser("plumbing", "Intake Test Plumbing LLC");
    for (const bad of ["", "abc", `${a.token}x`, a.token.slice(0, 42), "../../etc/passwd", a.advertiserId, "A".repeat(43), null, 42]) {
      expect(await getIntake(bad, deps)).toBeNull();
      await rejects(saveIntake(bad, FULL_BUILD, true, deps), "not_found");
    }
    // Same advertiser id, different secret -> different, useless token.
    expect(await getIntake(deriveIntakeToken(a.advertiserId, "another-secret-another-secret-12345"), deps)).toBeNull();
    // Fail closed: a valid token does nothing when INTAKE_TOKEN_SECRET is missing or short.
    for (const secret of [null, "", "too-short"]) {
      const off = { ...deps, secret: secret && secret.length >= 32 ? secret : null };
      expect(await getIntake(a.token, off)).toBeNull();
      await rejects(saveIntake(a.token, FULL_BUILD, false, off), "not_found");
      expect(await ensureIntakeLink(a.advertiserId, { rpc, secret: off.secret })).toBeNull();
    }
    expect((await one("select status::text s from advertiser_intakes")).s).toBe("NOT_STARTED");
  });

  it("D. advertiser A's token cannot read or change advertiser B", async () => {
    const a = await paidAdvertiser("plumbing", "Intake Test A Plumbing");
    const b = await paidAdvertiser("roofing", "Intake Test B Roofing");
    const logoB = await upload(b.token, "logo", "b-logo.png", FILES.png(), "image/png");

    const viewA = await getIntake(a.token, deps);
    expect(viewA?.intake.categoryName).toBe("Plumbing");
    expect(viewA?.assets).toEqual([]);
    await saveIntake(a.token, { ...FULL_BUILD, business_name: "A only" }, false, deps);
    expect((await getIntake(b.token, deps))?.intake.fields.business_name).toBe("Intake Test B Roofing");

    // B's asset id with A's token: not found, and B's file is untouched.
    await rejects(removeAsset(a.token, logoB.id, deps), "not_found");
    await rejects(completeUpload(a.token, logoB.id, deps), "not_found");
    expect((await one("select status::text s from intake_assets where id = $1", [logoB.id])).s).toBe("READY");
    expect((await getIntake(b.token, deps))?.assets.map((x) => x.id)).toEqual([logoB.id]);
  });

  it("E. a valid submission persists the right fields", async () => {
    const a = await paidAdvertiser("plumbing", "Intake Test Plumbing LLC");
    // Invalid values are refused with field errors; nothing is saved.
    const bad = await rejects(saveIntake(a.token, { ...FULL_BUILD, contact_email: "not-an-email", website_url: "javascript:alert(1)" }, false, deps), "invalid_fields");
    expect(Object.keys(bad.details.fieldErrors ?? {}).sort()).toEqual(["contact_email", "website_url"]);
    expect((await one("select status::text s from advertiser_intakes")).s).toBe("NOT_STARTED");

    // Saving progress needs nothing and moves to IN_PROGRESS.
    expect(await saveIntake(a.token, { business_name: "Intake Test Plumbing LLC" }, false, deps)).toBe("IN_PROGRESS");
    // The form sends "" for an unpicked design choice: treated as missing, not invalid.
    expect((await rejects(saveIntake(a.token, { ...FULL_BUILD, design_choice: "" }, true, deps), "incomplete")).details.missing).toContain("design_choice");
    await rejects(saveIntake(a.token, { ...FULL_BUILD, design_choice: "SOMETHING_ELSE" }, false, deps), "invalid_fields");
    // Submitting without the required pieces lists what is missing.
    const missing = await rejects(saveIntake(a.token, { ...FULL_BUILD, headline: "", phone: "" }, true, deps), "incomplete");
    expect(missing.details.missing).toEqual(["phone", "headline", "logo"]);
    expect((await one("select status::text s, submitted_at from advertiser_intakes")).s).toBe("IN_PROGRESS");

    await upload(a.token, "logo", "logo.svg", FILES.svg(), "image/svg+xml");
    expect(await saveIntake(a.token, FULL_BUILD, true, deps)).toBe("SUBMITTED");
    const row = await one<Record<string, unknown>>("select * from advertiser_intakes where advertiser_id = $1", [a.advertiserId]);
    expect(row).toMatchObject({
      status: "SUBMITTED",
      design_choice: "BUILD_FOR_ME",
      business_name: "Intake Test Plumbing LLC",
      contact_name: "Pat Tester",
      contact_email: "pat@intake-test.example",
      phone: "(248) 555-0100",
      website_url: "https://intake-test.example/",
      headline: "Clawson’s family plumber",
      offer: "$50 off your first service call",
      call_to_action: "Call 248-555-0100 today",
      qr_url: "https://intake-test.example/offer",
      notes: "Use our blue.",
    });
    expect(row.submitted_at).toBeInstanceOf(Date);
    // Payment status is separate and unchanged.
    expect((await one("select status::text s from reservations where id = $1", [a.reservationId])).s).toBe("PAID");

    // Finished-artwork path needs only business info + artwork.
    const b = await paidAdvertiser("roofing", "Intake Test Roofing");
    const artOnly = { design_choice: "FINISHED_ARTWORK", business_name: "Intake Test Roofing", contact_name: "Sam", contact_email: "sam@intake-test.example", phone: "248-555-0199" };
    expect((await rejects(saveIntake(b.token, artOnly, true, deps), "incomplete")).details.missing).toEqual(["artwork"]);
    await upload(b.token, "artwork", "ad.pdf", FILES.pdf(), "application/pdf");
    expect(await saveIntake(b.token, artOnly, true, deps)).toBe("SUBMITTED");
  });

  it("F. repeated saves, submits and link creation never create duplicate rows", async () => {
    const a = await paidAdvertiser("plumbing", "Intake Test Plumbing LLC");
    for (let i = 0; i < 3; i++) expect(await ensureIntakeLink(a.advertiserId, { rpc, secret: SECRET })).toBe(a.token);
    const logo = await upload(a.token, "logo", "logo.png", FILES.png(), "image/png");
    await saveIntake(a.token, FULL_BUILD, true, deps);
    const first = (await one<{ submitted_at: Date }>("select submitted_at from advertiser_intakes")).submitted_at;
    const results = await Promise.all([1, 2, 3].map(() => saveIntake(a.token, FULL_BUILD, true, deps)));
    expect(results).toEqual(["SUBMITTED", "SUBMITTED", "SUBMITTED"]);
    // Edits after submission are allowed and keep the original submitted time.
    await saveIntake(a.token, { ...FULL_BUILD, notes: "Updated after submit" }, true, deps);
    expect(await count("advertiser_intakes")).toBe(1);
    const row = await one<{ submitted_at: Date; notes: string; status: string }>("select submitted_at, notes, status::text from advertiser_intakes");
    expect(row).toMatchObject({ notes: "Updated after submit", status: "SUBMITTED" });
    expect(row.submitted_at.getTime()).toBe(first.getTime());
    // Confirming the same upload twice is idempotent.
    await completeUpload(a.token, logo.id, deps);
    expect(await count("intake_assets", "status = 'READY'")).toBe(1);
    expect(await count("advertisers")).toBe(1);
    expect(await count("reservations", "status = 'PAID'")).toBe(1);
  });

  it("G. uploads are scoped to the right advertiser at server-generated paths", async () => {
    const a = await paidAdvertiser("plumbing", "Intake Test A Plumbing");
    const b = await paidAdvertiser("roofing", "Intake Test B Roofing");
    const intakeA = (await one<{ id: string }>("select id from advertiser_intakes where advertiser_id = $1", [a.advertiserId])).id;

    const r = await requestUpload(a.token, { kind: "logo", filename: "../../intakes/other/evil<script>.png", contentType: "image/png", size: 2048 }, deps);
    const asset = await one<{ intake_id: string; storage_path: string; original_filename: string; status: string }>(
      "select intake_id, storage_path, original_filename, status::text from intake_assets where id = $1",
      [r.assetId],
    );
    expect(asset.intake_id).toBe(intakeA);
    expect(asset.storage_path).toBe(`intakes/${intakeA}/logo/${r.assetId}.png`);
    expect(asset.original_filename).toBe("evil_script_.png");
    expect(asset.status).toBe("PENDING");
    expect(r.uploadUrl).toContain(asset.storage_path);

    // B's token cannot confirm A's upload.
    fs.put(r.uploadUrl, FILES.png(), "image/png");
    await rejects(completeUpload(b.token, r.assetId, deps), "not_found");
    const ready = await completeUpload(a.token, r.assetId, deps);
    expect(ready.kind).toBe("logo");

    // A new logo replaces the old one; the old file is deleted from storage.
    const second = await upload(a.token, "logo", "logo2.jpg", FILES.jpg(), "image/jpeg");
    expect(await count("intake_assets", "intake_id = $1 and kind = 'logo' and status = 'READY'", [intakeA])).toBe(1);
    expect(fs.objects.has(asset.storage_path)).toBe(false);
    expect((await getIntake(a.token, deps))?.assets.map((x) => x.id)).toEqual([second.id]);

    // Photos: up to 3.
    for (let i = 0; i < 3; i++) await upload(a.token, "photo", `p${i}.webp`, FILES.webp(), "image/webp");
    await rejects(requestUpload(a.token, { kind: "photo", filename: "p4.png", contentType: "image/png", size: 100 }, deps), "too_many_photos");

    // Remove deletes the row and the object.
    const photo = (await getIntake(a.token, deps))!.assets.find((x) => x.kind === "photo")!;
    const path = (await one<{ storage_path: string }>("select storage_path from intake_assets where id = $1", [photo.id])).storage_path;
    await removeAsset(a.token, photo.id, deps);
    expect(fs.objects.has(path)).toBe(false);
    expect((await one("select status::text s from intake_assets where id = $1", [photo.id])).s).toBe("DELETED");

    // The database refuses a path outside the intake's own folder.
    await expect(
      pool.query("insert into intake_assets (intake_id, kind, storage_path, original_filename, content_type, size_bytes) values ($1, 'logo', $2, 'x.png', 'image/png', 1)", [
        intakeA,
        `intakes/${(await one<{ id: string }>("select id from advertiser_intakes where advertiser_id = $1", [b.advertiserId])).id}/logo/${crypto.randomUUID()}.png`,
      ]),
    ).rejects.toThrow(/path_matches_intake/);
  });

  it("H. unsupported file types are rejected (declared and actual)", async () => {
    const a = await paidAdvertiser("plumbing", "Intake Test Plumbing LLC");
    const req = (kind: string, contentType: string) => requestUpload(a.token, { kind, filename: "f", contentType, size: 100 }, deps);
    await rejects(req("logo", "image/gif"), "unsupported_type");
    await rejects(req("logo", "image/webp"), "unsupported_type");
    await rejects(req("photo", "image/svg+xml"), "unsupported_type");
    await rejects(req("photo", "application/pdf"), "unsupported_type");
    await rejects(req("artwork", "image/svg+xml"), "unsupported_type");
    await rejects(req("artwork", "text/html"), "unsupported_type");
    await rejects(req("avatar", "image/png"), "invalid_kind");
    expect(await count("intake_assets")).toBe(0);

    // Declared PNG, but the bytes are HTML: rejected after upload, file deleted.
    const r = await requestUpload(a.token, { kind: "logo", filename: "logo.png", contentType: "image/png", size: 64 }, deps);
    const path = fs.put(r.uploadUrl, FILES.html(), "image/png");
    await rejects(completeUpload(a.token, r.assetId, deps), "type_mismatch");
    expect(fs.objects.has(path)).toBe(false);
    expect((await one("select status::text s from intake_assets where id = $1", [r.assetId])).s).toBe("DELETED");

    // Declared PNG, stored as a GIF.
    await rejects(upload(a.token, "logo", "logo.png", FILES.gif(), "image/png"), "type_mismatch");
    // Declared PDF but a PNG was sent with a different content type.
    await rejects(upload(a.token, "artwork", "ad.pdf", FILES.png(), "image/png", "application/pdf"), "type_mismatch");
    // Never uploaded.
    const ghost = await requestUpload(a.token, { kind: "logo", filename: "x.png", contentType: "image/png", size: 64 }, deps);
    await rejects(completeUpload(a.token, ghost.assetId, deps), "upload_missing");
    expect(await count("intake_assets", "status = 'READY'")).toBe(0);
  });

  it("I. oversized files are rejected (declared and actual)", async () => {
    const a = await paidAdvertiser("plumbing", "Intake Test Plumbing LLC");
    const MB = 1024 * 1024;
    await rejects(requestUpload(a.token, { kind: "logo", filename: "l.png", contentType: "image/png", size: 10 * MB + 1 }, deps), "file_too_large");
    await rejects(requestUpload(a.token, { kind: "photo", filename: "p.jpg", contentType: "image/jpeg", size: 15 * MB + 1 }, deps), "file_too_large");
    await rejects(requestUpload(a.token, { kind: "artwork", filename: "a.pdf", contentType: "application/pdf", size: 50 * MB + 1 }, deps), "file_too_large");
    await rejects(requestUpload(a.token, { kind: "logo", filename: "l.png", contentType: "image/png", size: 0 }, deps), "empty_file");
    expect(await count("intake_assets")).toBe(0);
    // Limits at exactly the maximum are fine to request.
    await requestUpload(a.token, { kind: "logo", filename: "l.png", contentType: "image/png", size: 10 * MB }, deps);

    // Declared small, actually large: rejected after upload and deleted.
    const r = await requestUpload(a.token, { kind: "logo", filename: "l.png", contentType: "image/png", size: 1000 }, deps);
    const path = fs.put(r.uploadUrl, FILES.png(10 * MB + 1), "image/png");
    await rejects(completeUpload(a.token, r.assetId, deps), "file_too_large");
    expect(fs.objects.has(path)).toBe(false);
    expect(await count("intake_assets", "status = 'READY'")).toBe(0);
  });

  it("J. files are private: bucket not public, no anon/authenticated access, only signed links", async () => {
    const a = await paidAdvertiser("plumbing", "Intake Test Plumbing LLC");
    const logo = await upload(a.token, "logo", "logo.svg", FILES.svg(), "image/svg+xml");
    const path = (await one<{ storage_path: string }>("select storage_path from intake_assets where id = $1", [logo.id])).storage_path;
    expect(fs.publicGet(path)).toBeNull();
    const link = await fs.storage.downloadUrl(path, "logo.svg");
    expect(link).toMatch(/token=.*download=logo\.svg/);

    // Database: RLS on, no grants, no function access for browser roles.
    for (const role of ["anon", "authenticated"]) {
      for (const sql of [
        "select * from public.advertiser_intakes",
        "select * from public.intake_assets",
        `select * from public.get_intake('${hashIntakeToken(a.token)}')`,
        `select public.delete_intake_asset('${hashIntakeToken(a.token)}', '${logo.id}')`,
      ]) {
        const c = await pool.connect();
        try {
          await c.query(`begin; set local role ${role}`);
          await expect(c.query(sql)).rejects.toThrow(/permission denied/);
        } finally {
          await c.query("rollback").catch(() => {});
          c.release();
        }
      }
    }
    const rls = await q<{ relname: string; relrowsecurity: boolean }>(
      "select relname, relrowsecurity from pg_class where relname in ('advertiser_intakes', 'intake_assets') order by relname",
    );
    expect(rls.every((r) => r.relrowsecurity)).toBe(true);
    const insecure = await q(
      "select proname from pg_proc where pronamespace = 'public'::regnamespace and proname in ('ensure_advertiser_intake','get_intake','get_intake_assets','get_intake_asset','save_intake','create_intake_asset','confirm_intake_asset','delete_intake_asset') and (prosecdef or has_function_privilege('anon', oid, 'execute') or has_function_privilege('authenticated', oid, 'execute'))",
    );
    expect(insecure).toEqual([]);

    // The migration creates the bucket PRIVATE with Storage-side limits (run against a stub storage schema).
    const migration = readFileSync(new URL("../../supabase/migrations/20260926000000_advertiser_intake.sql", import.meta.url), "utf8");
    const bucketBlock = migration.match(/do \$\$\nbegin\n  if exists \(select 1 from pg_namespace where nspname = 'storage'\)[\s\S]*?end \$\$;/)![0];
    await pool.query(
      "create schema storage; create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[])",
    );
    await pool.query("insert into storage.buckets (id, name, public) values ('intake-assets', 'intake-assets', true)"); // even if someone flipped it
    await pool.query(bucketBlock);
    const bucket = await one<{ public: boolean; file_size_limit: string; allowed_mime_types: string[] }>("select * from storage.buckets where id = 'intake-assets'");
    expect(bucket.public).toBe(false);
    expect(Number(bucket.file_size_limit)).toBe(50 * 1024 * 1024);
    expect(bucket.allowed_mime_types.sort()).toEqual(["application/pdf", "image/jpeg", "image/png", "image/svg+xml", "image/webp"]);
  });

  it("K. a submitted intake is visible to the admin queries with its files", async () => {
    const a = await paidAdvertiser("plumbing", "Intake Test Plumbing LLC");
    await paidAdvertiser("roofing", "Intake Test Roofing"); // not started
    await upload(a.token, "logo", "logo.png", FILES.png(), "image/png");
    await saveIntake(a.token, FULL_BUILD, true, deps);
    // The same tables/joins lib/admin/advertisers.ts reads with the service role.
    const rows = await q<{ business_name: string; email: string; payment: string; intake: string | null; submitted_at: Date | null; category: string; files: number }>(
      `select a.business_name, a.contact_email email, r.status::text payment, i.status::text intake, i.submitted_at, c.display_name category,
              (select count(*)::int from intake_assets x where x.intake_id = i.id and x.status = 'READY') files
         from advertisers a
         join reservations r on r.advertiser_id = a.id
         join categories c on c.id = r.category_id
         left join advertiser_intakes i on i.advertiser_id = a.id
        order by c.display_name`,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ category: "Plumbing", payment: "PAID", intake: "SUBMITTED", files: 1, email: "plumbing@intake-test.example" });
    expect(rows[0].submitted_at).toBeInstanceOf(Date);
    expect(rows[1]).toMatchObject({ category: "Roofing", payment: "PAID", intake: "NOT_STARTED", files: 0 });
  });
});
