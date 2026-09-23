import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Minimal database port for the checkout flow: call a Postgres function by
 * name with named arguments. Production uses the service-role Supabase client;
 * tests use a direct Postgres connection, so the same checkout and webhook code
 * runs against the real migration in both.
 *
 * Errors raised by the functions surface as Error(message), e.g.
 * Error("category_held").
 */
export type Rpc = <T = unknown>(fn: string, args: Record<string, unknown>) => Promise<T>;

export class RpcError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "RpcError";
  }
}

export function supabaseRpc(client: SupabaseClient): Rpc {
  return async <T>(fn: string, args: Record<string, unknown>) => {
    const { data, error } = await client.rpc(fn, args);
    if (error) throw new RpcError(error.message, error.code);
    return data as T;
  };
}

/** First row of a set-returning function result (supabase-js returns an array). */
export function firstRow<T>(data: T[] | T | null): T | null {
  if (Array.isArray(data)) return data[0] ?? null;
  return data ?? null;
}
