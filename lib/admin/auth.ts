import "server-only";
import { headers } from "next/headers";
import { getAdminCredentials, isAuthorized } from "./basic-auth";

/**
 * Defense in depth: every admin page render and server action calls this,
 * so admin writes stay protected even if the proxy matcher changes.
 */
export async function requireAdmin(): Promise<void> {
  const h = await headers();
  if (!isAuthorized(h.get("authorization"), getAdminCredentials())) {
    throw new Error("Unauthorized");
  }
}
