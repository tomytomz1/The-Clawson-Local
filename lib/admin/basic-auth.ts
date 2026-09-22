/**
 * Minimal HTTP Basic auth for the single-operator V1 admin. Credentials come
 * from ADMIN_USERNAME / ADMIN_PASSWORD. The admin is disabled entirely unless
 * a password of at least MIN_PASSWORD_LENGTH characters is configured.
 *
 * Pure (no Next.js imports) so it runs in proxy.ts, server actions and tests.
 */
export const MIN_PASSWORD_LENGTH = 16;

export type AdminCredentials = { username: string; password: string };

export function getAdminCredentials(env: Record<string, string | undefined> = process.env): AdminCredentials | null {
  const username = env.ADMIN_USERNAME || "admin";
  const password = env.ADMIN_PASSWORD;
  if (!password || password.length < MIN_PASSWORD_LENGTH) return null;
  return { username, password };
}

/** Constant-time string comparison (length is not secret here). */
function safeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export function isAuthorized(header: string | null | undefined, creds: AdminCredentials | null): boolean {
  if (!creds || !header?.startsWith("Basic ")) return false;
  let decoded: string;
  try {
    decoded = atob(header.slice(6).trim());
  } catch {
    return false;
  }
  const i = decoded.indexOf(":");
  if (i < 0) return false;
  const userOk = safeEqual(decoded.slice(0, i), creds.username);
  const passOk = safeEqual(decoded.slice(i + 1), creds.password);
  return userOk && passOk;
}
