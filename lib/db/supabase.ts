import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase clients. Nothing here may be imported by a client
 * component; `server-only` makes that a build error.
 *
 * - Public client: anon/publishable key, subject to RLS. Used for public pages.
 * - Admin client: service-role/secret key, bypasses RLS. Used only by /admin
 *   after the admin check has passed.
 */

export class DataUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DataUnavailableError";
  }
}

function env(...names: string[]): string | undefined {
  for (const n of names) {
    const v = process.env[n];
    if (v) return v;
  }
  return undefined;
}

function supabaseUrl(): string {
  const url = env("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
  if (!url) throw new DataUnavailableError("SUPABASE_URL is not configured");
  return url;
}

const options = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  // Inventory must never be served from a stale HTTP cache.
  global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, cache: "no-store" }) },
} as const;

let publicClient: SupabaseClient | undefined;
let adminClient: SupabaseClient | undefined;

export function getPublicClient(): SupabaseClient {
  if (publicClient) return publicClient;
  const key = env("SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  if (!key) throw new DataUnavailableError("SUPABASE_ANON_KEY is not configured");
  publicClient = createClient(supabaseUrl(), key, options);
  return publicClient;
}

export function getAdminClient(): SupabaseClient {
  if (adminClient) return adminClient;
  const key = env("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY");
  if (!key) throw new DataUnavailableError("SUPABASE_SERVICE_ROLE_KEY is not configured");
  adminClient = createClient(supabaseUrl(), key, options);
  return adminClient;
}
