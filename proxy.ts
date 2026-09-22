import { NextResponse, type NextRequest } from "next/server";
import { getAdminCredentials, isAuthorized } from "@/lib/admin/basic-auth";

/** Gate /admin behind HTTP Basic auth. Server actions re-check (requireAdmin). */
export function proxy(request: NextRequest) {
  const creds = getAdminCredentials();
  if (!creds) {
    return new NextResponse("Admin is not configured.", { status: 503 });
  }
  if (!isAuthorized(request.headers.get("authorization"), creds)) {
    return new NextResponse("Authentication required.", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="The Clawson Local admin", charset="UTF-8"' },
    });
  }
  const res = NextResponse.next();
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
