/**
 * Test-only Postgres helpers: create a throwaway database with the Supabase
 * roles, every migration (in order) and the seed, and an Rpc port that calls
 * the same functions the app calls through supabase-js.
 */
import { readdirSync, readFileSync } from "node:fs";
import { Client, Pool } from "pg";
import type { Rpc } from "@/lib/checkout/rpc";

export const ADMIN_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/postgres";
const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

export async function pgReachable() {
  const c = new Client({ connectionString: ADMIN_URL, connectionTimeoutMillis: 2000 });
  try {
    await c.connect();
    await c.end();
    return true;
  } catch {
    return false;
  }
}

export async function createTestDatabase(name: string) {
  const admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`drop database if exists ${name} with (force)`);
  await admin.query(`create database ${name}`);
  await admin.end();
  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  const pool = new Pool({ connectionString: url.toString(), max: 10 });
  const db = await pool.connect();
  await db.query(read("tests/db/supabase-roles.sql"));
  const migrations = readdirSync(new URL("../../supabase/migrations/", import.meta.url)).filter((f) => f.endsWith(".sql")).sort();
  for (const f of migrations) await db.query(read(`supabase/migrations/${f}`));
  await db.query(read("supabase/seed.sql"));
  db.release();
  return {
    pool,
    async drop() {
      await pool.end();
      const a = new Client({ connectionString: ADMIN_URL });
      await a.connect();
      await a.query(`drop database if exists ${name} with (force)`);
      await a.end();
    },
  };
}

/** Rpc port over a pg Pool: `select * from fn(p_x => $1, ...)`, run as service_role like the app. */
export function pgRpc(pool: Pool): Rpc {
  return async <T>(fn: string, args: Record<string, unknown>) => {
    const keys = Object.keys(args);
    const sql = `select * from public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")})`;
    const client = await pool.connect();
    try {
      await client.query("begin; set local role service_role");
      const res = await client.query(sql, keys.map((k) => args[k]));
      await client.query("commit");
      if (res.fields.length === 1 && res.fields[0].name === fn) return res.rows[0]?.[fn] as T;
      return res.rows as T;
    } catch (err) {
      await client.query("rollback").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  };
}
