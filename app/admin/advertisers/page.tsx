import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { listAdvertisers } from "@/lib/admin/advertisers";

export const metadata: Metadata = {
  title: "Advertisers — Admin",
  robots: { index: false, follow: false },
};

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-US", { timeZone: "America/Detroit", dateStyle: "short", timeStyle: "short" }) : "—";

export default async function AdvertisersPage() {
  await connection();
  await requireAdmin();
  const rows = await listAdvertisers();
  return (
    <div className="container-page space-y-6 py-8 text-sm">
      <header>
        <p className="eyebrow">
          <Link href="/admin" className="hover:underline">Admin</Link> / Advertisers
        </p>
        <h1 className="headline mt-1 text-3xl">Advertisers &amp; intake</h1>
        <p className="mt-2 text-ink-muted">Paid advertisers and whether their ad materials are in. Payment and intake status are separate.</p>
      </header>
      {rows.length === 0 ? (
        <p className="border-y-2 border-ink py-6 text-ink-soft">No advertisers yet. They appear here after a confirmed payment.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-left">
            <thead className="border-b-2 border-ink text-xs text-ink-muted uppercase">
              <tr>
                <th className="py-2 pr-3">Business</th>
                <th className="py-2 pr-3">Category</th>
                <th className="py-2 pr-3">Email</th>
                <th className="py-2 pr-3">Payment</th>
                <th className="py-2 pr-3">Intake</th>
                <th className="py-2 pr-3">Submitted</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="py-2 pr-3 font-medium">{r.businessName ?? "—"}</td>
                  <td className="py-2 pr-3">{r.categoryName ?? "—"}</td>
                  <td className="py-2 pr-3">{r.contactEmail ?? "—"}</td>
                  <td className="py-2 pr-3 text-xs">{r.paymentStatus ?? "—"}</td>
                  <td className="py-2 pr-3 text-xs">
                    <span className={r.intakeStatus === "SUBMITTED" ? "font-semibold text-ok" : r.intakeStatus === "IN_PROGRESS" ? "text-warn" : "text-ink-muted"}>
                      {r.intakeStatus}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-xs">{fmt(r.submittedAt)}</td>
                  <td className="py-2">
                    <Link href={`/admin/advertisers/${r.id}`} className="text-accent underline underline-offset-2">
                      Intake details
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
