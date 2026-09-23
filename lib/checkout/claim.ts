import {
  AbuseGuardConfigError,
  abuseKeys,
  clientCookie,
  clientIp,
  isAbuseGuardConfigured,
  newClientToken,
  readClientToken,
} from "./abuse";
import { firstRow, type Rpc } from "./rpc";
import { CheckoutError, startCheckout, type CheckoutGateway } from "./start";

export const TERMS_URL = "https://theclawsonlocal.com/terms";
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export type ClaimDeps = {
  rpc: Rpc;
  /** Created lazily so a refused request never touches Stripe. */
  stripe: () => CheckoutGateway;
  /** Stripe checkout is configured for this deployment. */
  checkoutEnabled: boolean;
  /** HOLD_ABUSE_SECRET (injected so tests can vary it). */
  abuseSecret: string | undefined;
  lookupCategory: (slug: string) => Promise<{ campaignId: string; categoryId: string; brandName: string } | null>;
  now?: () => number;
};

type ActiveRow = {
  reservation_id: string;
  category_slug: string;
  checkout_url: string | null;
  session_expires_at: string | null;
};

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function tooManyAttempts(origin: string, slug: string, retryAfter: number): Response {
  const minutes = Math.max(1, Math.ceil(retryAfter / 60));
  const back = `${origin}/category/${encodeURIComponent(slug)}`;
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Too many checkout attempts</title></head>
<body style="font-family:system-ui,sans-serif;max-width:36rem;margin:4rem auto;padding:0 1rem;line-height:1.5;color:#1b1a17;background:#faf6ee">
<h1 style="font-family:Georgia,serif">Too many checkout attempts</h1>
<p>We limit how many categories can be held for checkout from one connection. Please try again in about ${minutes} minute${minutes === 1 ? "" : "s"}, or email <a href="mailto:hello@theclawsonlocal.com">hello@theclawsonlocal.com</a>.</p>
<p><a href="${escapeHtml(back)}">Back to the category</a></p></body></html>`;
  return new Response(body, {
    status: 429,
    headers: { "content-type": "text/html; charset=utf-8", "retry-after": String(retryAfter), "cache-control": "no-store" },
  });
}

/**
 * "Claim for $350": validate, apply the abuse guard, hold the category and
 * redirect to Stripe Checkout. The only browser input is the category slug.
 */
export async function handleClaim(request: Request, deps: ClaimDeps): Promise<Response> {
  const url = new URL(request.url);
  const origin = url.origin;
  const form = await request.formData().catch(() => null);
  const slug = String(form?.get("category") ?? "");

  if (!SLUG_RE.test(slug)) return Response.json({ error: "Invalid category" }, { status: 400 });
  const requestOrigin = request.headers.get("origin");
  if (!requestOrigin || requestOrigin !== origin) return Response.json({ error: "Invalid origin" }, { status: 403 });

  // The client cookie is (re)issued on every claim response.
  const existing = readClientToken(request.headers.get("cookie"));
  const token = existing ?? newClientToken();
  const setCookie = existing ? null : clientCookie(token, url.protocol === "https:");
  const withCookie = (res: Response) => {
    if (setCookie) res.headers.append("set-cookie", setCookie);
    return res;
  };
  const redirect = (location: string) => withCookie(new Response(null, { status: 303, headers: { location } }));
  const back = (code: string, extra = "") =>
    redirect(`${origin}/category/${encodeURIComponent(slug)}?checkout=${code}${extra}#claim`);

  if (!deps.checkoutEnabled) return back("unavailable");
  if (!isAbuseGuardConfigured(deps.abuseSecret)) {
    // Fail closed: never create holds without the abuse guard.
    console.error(`[checkout] ${new AbuseGuardConfigError().message}`);
    return back("unavailable");
  }
  const keys = abuseKeys(token, clientIp(request.headers), deps.abuseSecret);

  const target = await deps.lookupCategory(slug);
  if (!target) return back("category_not_found");

  try {
    const result = await startCheckout(
      { ...target, origin, termsUrl: TERMS_URL, clientHash: keys.clientHash, ipHash: keys.ipHash },
      { rpc: deps.rpc, stripe: deps.stripe(), now: deps.now },
    );
    return redirect(result.url);
  } catch (err) {
    if (!(err instanceof CheckoutError)) {
      console.error("[checkout] unexpected error", err);
      return back("checkout_failed");
    }
    if (err.code === "rate_limited") return withCookie(tooManyAttempts(origin, slug, err.retryAfterSeconds ?? 3600));
    if (err.code === "client_has_active_hold") {
      const active = firstRow(await deps.rpc<ActiveRow[]>("client_active_reservation", { p_client_hash: keys.clientHash }));
      const now = (deps.now ?? Date.now)();
      // Same category, Session still open: send the buyer back to it (double-click / retry).
      if (
        active &&
        active.category_slug === slug &&
        active.checkout_url &&
        active.session_expires_at &&
        new Date(active.session_expires_at).getTime() > now
      ) {
        return redirect(active.checkout_url);
      }
      return back("active_hold", active ? `&hold=${active.reservation_id}` : "");
    }
    if (err.code === "checkout_failed") console.error("[checkout] could not start checkout", err.cause);
    return back(err.code);
  }
}
