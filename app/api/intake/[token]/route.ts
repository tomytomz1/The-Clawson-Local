import { NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/checkout/server";
import { intakeDeps } from "@/lib/intake/server";
import { completeUpload, INTAKE_ERROR_MESSAGES, IntakeError, removeAsset, requestUpload, saveIntake } from "@/lib/intake/service";

/**
 * All intake writes, server-mediated. The token in the URL is the only
 * credential; the database functions scope every change to that token's
 * advertiser and require a PAID reservation.
 *
 * Body: { action: "save" | "submit", fields }
 *     | { action: "upload", kind, filename, contentType, size }
 *     | { action: "complete" | "remove", assetId }
 */
const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request, { params }: RouteContext<"/api/intake/[token]">) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403, headers: noStore });
  const { token } = await params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request" }, { status: 400, headers: noStore });

  const deps = intakeDeps();
  try {
    switch (body.action) {
      case "save":
      case "submit": {
        const status = await saveIntake(token, body.fields, body.action === "submit", deps);
        return NextResponse.json({ status }, { headers: noStore });
      }
      case "upload": {
        const r = await requestUpload(token, { kind: body.kind, filename: body.filename, contentType: body.contentType, size: body.size }, deps);
        return NextResponse.json(r, { headers: noStore });
      }
      case "complete":
        return NextResponse.json({ asset: await completeUpload(token, body.assetId, deps) }, { headers: noStore });
      case "remove":
        await removeAsset(token, body.assetId, deps);
        return NextResponse.json({ ok: true }, { headers: noStore });
      default:
        return NextResponse.json({ error: "Invalid request" }, { status: 400, headers: noStore });
    }
  } catch (err) {
    if (err instanceof IntakeError) {
      const status = err.code === "not_found" ? 404 : err.code === "too_many_pending_uploads" ? 429 : 422;
      return NextResponse.json({ error: err.code, message: INTAKE_ERROR_MESSAGES[err.code], ...err.details }, { status, headers: noStore });
    }
    console.error("[intake] request failed", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "server_error", message: "Something went wrong. Please try again." }, { status: 500, headers: noStore });
  }
}
