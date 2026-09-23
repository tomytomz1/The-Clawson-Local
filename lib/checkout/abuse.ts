import { createHmac, randomBytes } from "node:crypto";

/**
 * Minimal abuse guard inputs for checkout holds.
 *
 * - Each browser gets a random opaque token in an HttpOnly cookie.
 * - The server derives HMAC-SHA256 digests of that token and of the request IP
 *   with a dedicated secret (HOLD_ABUSE_SECRET) and sends only the digests to
 *   the database, which enforces "one active hold per browser" and "3 new holds
 *   per IP per hour" atomically (see 20260925000000_hold_abuse_guard.sql).
 * - Raw tokens and raw IPs are never stored, logged or returned to the browser.
 */

export const CLIENT_COOKIE = "clawson_checkout";
export const CLIENT_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
export const IP_HOLD_LIMIT = 3;
export const IP_WINDOW_MINUTES = 60;
const MIN_SECRET_LENGTH = 32;

export class AbuseGuardConfigError extends Error {
  constructor() {
    // Never include the secret (or its length) in the message.
    super("HOLD_ABUSE_SECRET is missing or too short; new checkout holds are disabled");
    this.name = "AbuseGuardConfigError";
  }
}

export function isAbuseGuardConfigured(secret = process.env.HOLD_ABUSE_SECRET): boolean {
  return typeof secret === "string" && secret.length >= MIN_SECRET_LENGTH;
}

function secretOrThrow(secret = process.env.HOLD_ABUSE_SECRET): string {
  if (!isAbuseGuardConfigured(secret)) throw new AbuseGuardConfigError();
  return secret!;
}

function hmac(secret: string, purpose: string, value: string): string {
  return createHmac("sha256", secret).update(`${purpose}\u0000${value}`).digest("hex");
}

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/; // 32 random bytes, base64url

export function newClientToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Existing well-formed token from the Cookie header, or null. */
export function readClientToken(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === CLIENT_COOKIE) {
      const token = v.join("=");
      return TOKEN_RE.test(token) ? token : null;
    }
  }
  return null;
}

export function clientCookie(token: string, secure: boolean): string {
  return [
    `${CLIENT_COOKIE}=${token}`,
    "Path=/",
    `Max-Age=${CLIENT_COOKIE_MAX_AGE}`,
    "HttpOnly",
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

/**
 * Client IP used for rate limiting.
 *
 * On Vercel, `x-real-ip` and the first `x-forwarded-for` entry are set by
 * Vercel's edge from the TCP connection; Vercel overwrites any client-supplied
 * values, so they cannot be spoofed by the caller. Off Vercel (local
 * development/tests) the same headers are read but are only as trustworthy as
 * the proxy in front of the app. IPv6 addresses are reduced to their /64
 * network so a single subscriber cannot rotate through its own address block.
 */
export function clientIp(headers: Headers): string {
  const raw =
    headers.get("x-real-ip")?.trim() ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  return normalizeIp(raw);
}

export function normalizeIp(ip: string): string {
  const v = ip.replace(/^\[|\]$/g, "").toLowerCase();
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return mapped[1];
  if (!v.includes(":")) return v;
  // Expand "::" and keep the first four hextets (/64).
  const [head, tail = ""] = v.split("::");
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const groups = v.includes("::") ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t] : h;
  return `${groups.slice(0, 4).map((g) => (g || "0").replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

export type AbuseKeys = { clientHash: string; ipHash: string };

/** Digests sent to the database. Throws AbuseGuardConfigError without a secret. */
export function abuseKeys(clientToken: string, ip: string, secret?: string): AbuseKeys {
  const s = secretOrThrow(secret);
  return { clientHash: hmac(s, "client", clientToken), ipHash: hmac(s, "ip", ip) };
}
