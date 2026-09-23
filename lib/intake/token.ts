import { createHash, createHmac } from "node:crypto";

/**
 * Intake links. The token in /intake/<token> is
 * base64url(HMAC-SHA256(INTAKE_TOKEN_SECRET, "intake:" + advertiser id)):
 * 256 bits, unguessable without the secret, and re-derivable by the server so
 * the success page and admin can always show the link. The database stores
 * only sha256(token), so a database leak does not reveal working links.
 *
 * Without a secret of at least 32 characters the intake is disabled (fail
 * closed): no links are shown and every intake request is refused.
 */

const MIN_SECRET_LENGTH = 32;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function intakeSecret(secret = process.env.INTAKE_TOKEN_SECRET): string | null {
  return typeof secret === "string" && secret.length >= MIN_SECRET_LENGTH ? secret : null;
}

export function isIntakeConfigured(secret = process.env.INTAKE_TOKEN_SECRET): boolean {
  return intakeSecret(secret) !== null;
}

export function deriveIntakeToken(advertiserId: string, secret: string): string {
  return createHmac("sha256", secret).update(`intake:${advertiserId}`).digest("base64url");
}

/** Only well-formed tokens are ever hashed and looked up. */
export function isWellFormedToken(token: unknown): token is string {
  return typeof token === "string" && TOKEN_RE.test(token);
}

export function hashIntakeToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
