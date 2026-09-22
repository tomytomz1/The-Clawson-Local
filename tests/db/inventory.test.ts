/**
 * Database tests: run the real migration + seed against Postgres and verify
 * exclusivity, conflict groups, holds, the advertiser cap and RLS.
 *
 * Requires a Postgres server. Uses TEST_DATABASE_URL (a superuser connection
 * to any database) or postgres://postgres:postgres@localhost:5432/postgres.
 * Skipped when no server is reachable.
 */
import { readdirSync, readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const ADMIN_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/postgres";
const DB_NAME = `clawson_test_${process.pid}`;
const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

async function reachable() {
  const c = new Client({ connectionString: ADMIN_URL, connectionTimeoutMillis: 2000 });
  try {
    await c.connect();
    await c.end();
    return true;
  } catch {
    return false;
  }
}

const canRun = await reachable();
let db: Client;
let campaignId: string;

type Row = { slug: string; status: string };

async function resetDatabase() {
  const admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`drop database if exists ${DB_NAME} with (force)`);
  await admin.query(`create database ${DB_NAME}`);
  await admin.end();
  const url = new URL(ADMIN_URL);
  url.pathname = `/${DB_NAME}`;
  db = new Client({ connectionString: url.toString() });
  await db.connect();
  await db.query(read("tests/db/supabase-roles.sql"));
  const migrations = readdirSync(new URL("../../supabase/migrations/", import.meta.url)).filter((f) => f.endsWith(".sql")).sort();
  for (const f of migrations) await db.query(read(`supabase/migrations/${f}`));
  await db.query(read("supabase/seed.sql"));
  campaignId = (await db.query("select id from campaigns where is_active")).rows[0].id;
}

const inventory = async () =>
  (await db.query<Row>("select slug, status from campaign_inventory($1)", [campaignId])).rows;
const statusOf = async (slug: string) => (await inventory()).find((r) => r.slug === slug)?.status;
const soldCount = async () => (await db.query("select campaign_sold_count($1) n", [campaignId])).rows[0].n as number;

async function sell(slug: string) {
  await db.query(
    `update campaign_categories set status = 'SOLD', sold_at = now()
     where campaign_id = $1 and category_id = (select id from categories where slug = $2)`,
    [campaignId, slug],
  );
}
async function hold(slug: string, minutes: number) {
  await db.query(
    `update campaign_categories set status = 'HELD', hold_expires_at = now() + make_interval(mins => $3)
     where campaign_id = $1 and category_id = (select id from categories where slug = $2)`,
    [campaignId, slug, minutes],
  );
}
async function addAlias(slug: string, name: string, conflictKey: string) {
  await db.query(
    `insert into categories (slug, display_name, short_name, conflict_key, priority) values ($1, $2, lower($2), $3, 200)`,
    [slug, name, conflictKey],
  );
}

describe.skipIf(!canRun)("database inventory", () => {
  beforeAll(async () => {
    if (!canRun) return;
  });
  beforeEach(async () => {
    if (db) await db.end();
    await resetDatabase();
  });
  afterAll(async () => {
    if (!canRun) return;
    await db?.end();
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`drop database if exists ${DB_NAME} with (force)`);
    await admin.end();
  });

  describe("seed", () => {
    it("loads one active Founding Edition campaign with the working values and null dates", async () => {
      const { rows } = await db.query("select * from campaigns where is_active");
      expect(rows).toHaveLength(1);
      const c = rows[0];
      expect(c).toMatchObject({
        name: "Founding Edition",
        market: "Clawson",
        state: "Michigan",
        status: "PRELAUNCH",
        price_cents: 35000,
        max_advertisers: 20,
        planned_reach: 5800,
        reach_is_estimated: true,
        verified_reach: null,
        included_revisions: 1,
        reservation_minutes: 30,
      });
      for (const k of ["sales_open_at", "sales_close_at", "asset_deadline", "proof_deadline", "print_date", "mailing_date", "outside_fulfillment_date"]) {
        expect(c[k], k).toBeNull();
      }
    });

    it("seeds 30 active categories with valid unique slugs, aliases and landing copy", async () => {
      const { rows } = await db.query("select slug, conflict_key, aliases, landing_page_copy from categories where active");
      expect(rows).toHaveLength(30);
      expect(new Set(rows.map((r) => r.slug)).size).toBe(30);
      for (const r of rows) expect(r.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      const hvac = rows.find((r) => r.slug === "hvac");
      expect(hvac.conflict_key).toBe("hvac");
      expect(hvac.aliases).toEqual(["Air Conditioning", "Heating", "Furnace Repair"]);
      expect(rows.find((r) => r.slug === "plumbing").aliases).toEqual(["Plumber", "Drain Service"]);
      expect(rows.filter((r) => r.landing_page_copy).length).toBe(7);
    });

    it("is idempotent", async () => {
      await db.query(read("supabase/seed.sql"));
      expect((await db.query("select count(*)::int n from categories")).rows[0].n).toBe(30);
      expect((await db.query("select count(*)::int n from campaigns")).rows[0].n).toBe(1);
    });

    it("starts with everything AVAILABLE and 0 sold", async () => {
      const inv = await inventory();
      expect(inv).toHaveLength(30);
      expect(inv.every((r) => r.status === "AVAILABLE")).toBe(true);
      expect(await soldCount()).toBe(0);
    });
  });

  describe("conflict keys", () => {
    it("selling one HVAC alias blocks competing HVAC aliases", async () => {
      await addAlias("furnace-repair", "Furnace Repair", "hvac");
      await addAlias("air-conditioning", "Air Conditioning", "hvac");
      await sell("furnace-repair");
      expect(await statusOf("furnace-repair")).toBe("SOLD");
      expect(await statusOf("hvac")).toBe("SOLD");
      expect(await statusOf("air-conditioning")).toBe("SOLD");
      await expect(sell("hvac")).rejects.toThrow(/one_claim_per_conflict/);
      await expect(hold("air-conditioning", 30)).rejects.toThrow(/one_claim_per_conflict/);
    });

    it("selling plumbing blocks the plumbing conflict group", async () => {
      await addAlias("drain-service", "Drain Service", "plumbing");
      await sell("plumbing");
      expect(await statusOf("drain-service")).toBe("SOLD");
      await expect(sell("drain-service")).rejects.toThrow(/one_claim_per_conflict/);
    });

    it("leaves unrelated categories available", async () => {
      await sell("plumbing");
      await sell("hvac");
      const inv = await inventory();
      expect(inv.filter((r) => r.status === "SOLD").map((r) => r.slug).sort()).toEqual(["hvac", "plumbing"]);
      expect(inv.filter((r) => r.status === "AVAILABLE")).toHaveLength(28);
      expect(await statusOf("roofing")).toBe("AVAILABLE");
    });

    it("follows a category's conflict key when it changes", async () => {
      await addAlias("drain-service", "Drain Service", "drains");
      await sell("plumbing");
      expect(await statusOf("drain-service")).toBe("AVAILABLE");
      await db.query("update categories set conflict_key = 'plumbing' where slug = 'drain-service'");
      expect(await statusOf("drain-service")).toBe("SOLD");
    });
  });

  describe("inventory states", () => {
    it("HELD blocks the group until the hold expires", async () => {
      await addAlias("drain-service", "Drain Service", "plumbing");
      await hold("plumbing", 30);
      expect(await statusOf("plumbing")).toBe("HELD");
      expect(await statusOf("drain-service")).toBe("HELD");
      await db.query("update campaign_categories set hold_expires_at = now() - interval '1 minute' where status = 'HELD'");
      expect(await statusOf("plumbing")).toBe("AVAILABLE");
      expect(await statusOf("drain-service")).toBe("AVAILABLE");
    });

    it("manually closed categories are CLOSED and can be reopened", async () => {
      const set = (v: boolean) =>
        db.query(
          "update campaign_categories set manually_closed = $2 where campaign_id = $1 and category_id = (select id from categories where slug = 'roofing')",
          [campaignId, v],
        );
      await set(true);
      expect(await statusOf("roofing")).toBe("CLOSED");
      await set(false);
      expect(await statusOf("roofing")).toBe("AVAILABLE");
    });

    it("SOLD wins over manual closure", async () => {
      await sell("roofing");
      await db.query("update campaign_categories set manually_closed = true where status = 'SOLD'");
      expect(await statusOf("roofing")).toBe("SOLD");
    });

    it("inactive categories are not listed publicly", async () => {
      await db.query("update categories set active = false where slug = 'moving'");
      const inv = await inventory();
      expect(inv).toHaveLength(29);
      expect(inv.find((r) => r.slug === "moving")).toBeUndefined();
    });

    it("new categories get inventory rows automatically", async () => {
      await addAlias("solar", "Solar", "solar");
      expect(await statusOf("solar")).toBe("AVAILABLE");
    });
  });

  describe("campaign maximum", () => {
    const slugsInOrder = async () =>
      (await db.query("select slug from categories where active order by priority")).rows.map((r) => r.slug as string);

    it("0 -> 1 -> 19 -> 20 sold, then SOLD_OUT with the rest CLOSED", async () => {
      const slugs = await slugsInOrder();
      expect(await soldCount()).toBe(0);
      await sell(slugs[0]);
      expect(await soldCount()).toBe(1);
      for (const s of slugs.slice(1, 19)) await sell(s);
      expect(await soldCount()).toBe(19);
      expect((await db.query("select status from campaigns where id = $1", [campaignId])).rows[0].status).toBe("PRELAUNCH");
      expect((await inventory()).filter((r) => r.status === "AVAILABLE")).toHaveLength(11);

      await sell(slugs[19]);
      expect(await soldCount()).toBe(20);
      expect((await db.query("select status from campaigns where id = $1", [campaignId])).rows[0].status).toBe("SOLD_OUT");
      const inv = await inventory();
      expect(inv.filter((r) => r.status === "SOLD")).toHaveLength(20);
      expect(inv.filter((r) => r.status === "CLOSED")).toHaveLength(10);
      expect(inv.filter((r) => r.status === "AVAILABLE")).toHaveLength(0);
    });

    it("refuses a 21st sale even though categories remain", async () => {
      const slugs = await slugsInOrder();
      for (const s of slugs.slice(0, 20)) await sell(s);
      await expect(sell(slugs[20])).rejects.toThrow(/maximum of 20 advertisers/);
      expect(await soldCount()).toBe(20);
    });

    it("closes unsold inventory when the campaign moves to PRODUCTION", async () => {
      await sell("hvac");
      await db.query("update campaigns set status = 'PRODUCTION' where id = $1", [campaignId]);
      const inv = await inventory();
      expect(inv.filter((r) => r.status === "SOLD")).toHaveLength(1);
      expect(inv.filter((r) => r.status === "CLOSED")).toHaveLength(29);
    });
  });

  describe("campaign constraints", () => {
    it("requires a verified count before reach is marked verified", async () => {
      await expect(db.query("update campaigns set reach_is_estimated = false where id = $1", [campaignId])).rejects.toThrow(
        /verified_reach_required/,
      );
      await db.query("update campaigns set reach_is_estimated = false, verified_reach = 5812 where id = $1", [campaignId]);
    });

    it("allows only one active campaign", async () => {
      await expect(
        db.query(
          "insert into campaigns (slug, name, market, state, is_active, price_cents, max_advertisers, planned_reach) values ('other', 'Other', 'X', 'Y', true, 100, 1, 1)",
        ),
      ).rejects.toThrow(/campaigns_one_active/);
    });
  });

  describe("row level security", () => {
    const asAnon = async <T,>(fn: () => Promise<T>) => {
      await db.query("begin; set local role anon");
      try {
        return await fn();
      } finally {
        await db.query("rollback");
      }
    };

    it("anon can read the active campaign, active categories and public inventory", async () => {
      await db.query("update categories set active = false where slug = 'moving'");
      await asAnon(async () => {
        expect((await db.query("select price_cents from campaigns")).rows).toEqual([{ price_cents: 35000 }]);
        expect((await db.query("select count(*)::int n from categories")).rows[0].n).toBe(29);
        expect((await db.query("select count(*)::int n from campaign_inventory($1)", [campaignId])).rows[0].n).toBe(29);
      });
    });

    it("anon cannot read raw inventory rows", async () => {
      await expect(asAnon(() => db.query("select * from campaign_categories"))).rejects.toThrow(/permission denied/);
    });

    it("anon cannot write inventory, categories or campaigns", async () => {
      await expect(asAnon(() => db.query("update campaign_categories set status = 'SOLD', sold_at = now()"))).rejects.toThrow(/permission denied/);
      await expect(asAnon(() => db.query("update categories set active = false"))).rejects.toThrow(/permission denied/);
      await expect(asAnon(() => db.query("update campaigns set price_cents = 1"))).rejects.toThrow(/permission denied/);
      await expect(
        asAnon(() => db.query("insert into categories (slug, display_name, short_name, conflict_key) values ('x','x','x','x')")),
      ).rejects.toThrow(/permission denied/);
    });

    it("anon cannot call internal trigger functions", async () => {
      await expect(asAnon(() => db.query("select campaigns_create_inventory()"))).rejects.toThrow();
      for (const role of ["anon", "authenticated"]) {
        for (const fn of ["campaigns_create_inventory()", "categories_create_inventory()"]) {
          const { rows } = await db.query("select has_function_privilege($1, $2, 'execute') ok", [role, `public.${fn}`]);
          expect(rows[0].ok, `${role} ${fn}`).toBe(false);
        }
        for (const fn of ["campaign_inventory(uuid)", "campaign_sold_count(uuid)"]) {
          const { rows } = await db.query("select has_function_privilege($1, $2, 'execute') ok", [role, `public.${fn}`]);
          expect(rows[0].ok, `${role} ${fn}`).toBe(true);
        }
      }
    });

    it("trigger functions still create inventory after the privilege changes", async () => {
      await db.query("begin; set local role service_role");
      try {
        await db.query(
          "insert into categories (slug, display_name, short_name, conflict_key) values ('trigger-check', 'Trigger Check', 'trigger check', 'trigger-check')",
        );
        const { rows } = await db.query(
          "select count(*)::int n from campaign_categories where category_id = (select id from categories where slug = 'trigger-check')",
        );
        expect(rows[0].n).toBe(1);
      } finally {
        await db.query("rollback");
      }
    });

    it("indexes the category_id foreign key", async () => {
      const { rows } = await db.query("select 1 from pg_indexes where indexname = 'campaign_categories_category'");
      expect(rows).toHaveLength(1);
    });

    it("service_role can manage inventory", async () => {
      await db.query("begin; set local role service_role");
      try {
        await db.query("update campaign_categories set manually_closed = true where campaign_id = $1", [campaignId]);
      } finally {
        await db.query("rollback");
      }
    });
  });
});
