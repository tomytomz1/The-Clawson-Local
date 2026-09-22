import type { Metadata } from "next";
import { connection } from "next/server";
import { StatusBadge } from "@/components/inventory/status-badge";
import { requireAdmin } from "@/lib/admin/auth";
import { getAdminCampaign, getAdminInventory } from "@/lib/admin/data";
import { isoToDetroitLocal } from "@/lib/admin/schemas";
import { formatReachCount, getReachLabel } from "@/lib/campaign/format";
import { CAMPAIGN_STATUSES, type CampaignConfig } from "@/types/campaign";
import { setCategoryActive, setCategoryClosed, updateCampaign } from "./actions";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

const input = "mt-1 w-full border border-ink/40 bg-white px-2 py-1.5 text-sm";
const label = "block text-xs font-semibold tracking-wide text-ink-soft uppercase";

function Field({ name, text, children }: { name: string; text: string; children: React.ReactNode }) {
  return (
    <label htmlFor={name} className="block">
      <span className={label}>{text}</span>
      {children}
    </label>
  );
}

function CampaignForm({ c }: { c: CampaignConfig }) {
  const date = (name: string, text: string, value: string | null) => (
    <Field name={name} text={text}>
      <input id={name} name={name} type="date" defaultValue={value ?? ""} className={input} />
    </Field>
  );
  return (
    <form action={updateCampaign} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <input type="hidden" name="campaign_id" value={c.id} />
      <Field name="name" text="Campaign name">
        <input id="name" name="name" defaultValue={c.campaignName} required className={input} />
      </Field>
      <Field name="market" text="Market">
        <input id="market" name="market" defaultValue={c.marketName} required className={input} />
      </Field>
      <Field name="state" text="State">
        <input id="state" name="state" defaultValue={c.state} required className={input} />
      </Field>
      <Field name="status" text="Status">
        <select id="status" name="status" defaultValue={c.status} className={input}>
          {CAMPAIGN_STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </Field>
      <Field name="price_dollars" text="Price (USD)">
        <input id="price_dollars" name="price_dollars" type="number" step="0.01" min="1" defaultValue={c.priceCents / 100} required className={input} />
      </Field>
      <Field name="max_advertisers" text="Max paid advertisers">
        <input id="max_advertisers" name="max_advertisers" type="number" min="1" defaultValue={c.maxAdvertisers} required className={input} />
      </Field>
      <Field name="planned_reach" text="Planned reach (estimate)">
        <input id="planned_reach" name="planned_reach" type="number" min="1" defaultValue={c.plannedReach} required className={input} />
      </Field>
      <Field name="verified_reach" text="Verified reach (after routes lock)">
        <input id="verified_reach" name="verified_reach" type="number" min="1" defaultValue={c.verifiedReach ?? ""} className={input} />
      </Field>
      <label className="flex items-center gap-2 self-end pb-2 text-sm">
        <input type="checkbox" name="reach_is_estimated" defaultChecked={c.reachIsEstimated} />
        Reach is an estimate (shows &ldquo;approximately&rdquo;)
      </label>
      <Field name="included_revisions" text="Included revisions">
        <input id="included_revisions" name="included_revisions" type="number" min="0" max="10" defaultValue={c.includedRevisions} required className={input} />
      </Field>
      <Field name="reservation_minutes" text="Checkout hold (minutes)">
        <input id="reservation_minutes" name="reservation_minutes" type="number" min="5" max="240" defaultValue={c.reservationMinutes} required className={input} />
      </Field>
      <Field name="sales_open_at" text="Sales open (Clawson time)">
        <input id="sales_open_at" name="sales_open_at" type="datetime-local" defaultValue={isoToDetroitLocal(c.salesOpenAt)} className={input} />
      </Field>
      <Field name="sales_close_at" text="Sales deadline (Clawson time)">
        <input id="sales_close_at" name="sales_close_at" type="datetime-local" defaultValue={isoToDetroitLocal(c.salesCloseAt)} className={input} />
      </Field>
      {date("asset_deadline", "Asset deadline", c.assetDeadline)}
      {date("proof_deadline", "Proof deadline", c.proofDeadline)}
      {date("print_date", "Print date", c.printDate)}
      {date("mailing_date", "Mailing date", c.mailingDate)}
      {date("outside_fulfillment_date", "Outside fulfillment date", c.outsideFulfillmentDate)}
      <div className="sm:col-span-2 lg:col-span-3">
        <p className="mb-3 text-xs text-ink-muted">
          Leave unknown dates blank. Blank values render as &ldquo;to be published&rdquo; on the site.
        </p>
        <button type="submit" className="btn-primary py-2 text-sm">
          Save campaign
        </button>
      </div>
    </form>
  );
}

function ToggleButton({
  action,
  categoryId,
  campaignId,
  value,
  text,
}: {
  action: (fd: FormData) => Promise<void>;
  categoryId: string;
  campaignId?: string;
  value: boolean;
  text: string;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="category_id" value={categoryId} />
      {campaignId && <input type="hidden" name="campaign_id" value={campaignId} />}
      <input type="hidden" name="value" value={String(value)} />
      <button type="submit" className="border border-ink/40 px-2 py-0.5 text-xs hover:bg-ink hover:text-paper">
        {text}
      </button>
    </form>
  );
}

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-US", { timeZone: "America/Detroit", dateStyle: "short", timeStyle: "short" }) : "—";

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  await connection();
  await requireAdmin();
  const sp = await searchParams;
  const ok = typeof sp.ok === "string" ? sp.ok : null;
  const error = typeof sp.error === "string" ? sp.error : null;

  const campaign = await getAdminCampaign();
  if (!campaign) {
    return <div className="container-page py-10">No active campaign. Run supabase/seed.sql.</div>;
  }
  const { rows, soldCount, progress } = await getAdminInventory(campaign);
  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    const k = r.active ? (r.effectiveStatus ?? "—") : "INACTIVE";
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="container-page space-y-10 py-8 text-sm">
      <header>
        <p className="eyebrow">Admin</p>
        <h1 className="headline mt-1 text-3xl">
          {campaign.brandName} — {campaign.campaignName}
        </h1>
        {ok && <p role="status" className="mt-3 bg-ok-tint px-3 py-2 text-ok">{ok}</p>}
        {error && <p role="alert" className="mt-3 bg-accent-tint px-3 py-2 text-accent-dark">{error}</p>}
      </header>

      <section aria-labelledby="summary" className="grid gap-4 border-y-2 border-ink py-4 sm:grid-cols-4">
        <h2 id="summary" className="sr-only">Summary</h2>
        <div>
          <p className={label}>Status</p>
          <p className="text-lg font-semibold">{campaign.status}</p>
        </div>
        <div>
          <p className={label}>Paid advertisers</p>
          <p className="text-lg font-semibold">
            {soldCount} of {progress.max} positions claimed ({progress.percent}%)
          </p>
        </div>
        <div>
          <p className={label}>Public reach copy</p>
          <p className="font-semibold">{getReachLabel(campaign)}</p>
          <p className="text-ink-muted">{campaign.reachIsEstimated ? "Estimate" : `Verified: ${formatReachCount(campaign)}`}</p>
        </div>
        <div>
          <p className={label}>Categories</p>
          <p>{Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(" · ")}</p>
        </div>
      </section>

      <section aria-labelledby="campaign-h">
        <h2 id="campaign-h" className="headline mb-4 text-xl">Campaign configuration</h2>
        <CampaignForm c={campaign} />
      </section>

      <section aria-labelledby="cats-h">
        <h2 id="cats-h" className="headline mb-2 text-xl">Categories &amp; inventory</h2>
        <p className="mb-4 text-ink-muted">
          Public status is derived by the database: a sale blocks every category sharing its conflict key; reaching
          the advertiser maximum closes everything unsold.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] text-left">
            <thead className="border-b-2 border-ink text-xs text-ink-muted uppercase">
              <tr>
                <th className="py-2 pr-3">Category</th>
                <th className="py-2 pr-3">Conflict key</th>
                <th className="py-2 pr-3">Public status</th>
                <th className="py-2 pr-3">Stored</th>
                <th className="py-2 pr-3">Hold expires</th>
                <th className="py-2 pr-3">Sold at</th>
                <th className="py-2 pr-3">Active</th>
                <th className="py-2">Manual close</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {rows.map((r) => (
                <tr key={r.categoryId} className={r.active ? "" : "text-ink-muted"}>
                  <td className="py-2 pr-3">
                    <a href={`/category/${r.slug}`} className="font-medium underline-offset-2 hover:underline">
                      {r.displayName}
                    </a>
                    {r.aliases.length > 0 && <div className="text-xs text-ink-muted">{r.aliases.join(", ")}</div>}
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs">{r.conflictKey}</td>
                  <td className="py-2 pr-3">{r.effectiveStatus ? <StatusBadge status={r.effectiveStatus} /> : "Inactive"}</td>
                  <td className="py-2 pr-3 text-xs">
                    {r.storedStatus ?? "—"}
                    {r.manuallyClosed && " · manually closed"}
                  </td>
                  <td className="py-2 pr-3 text-xs">{fmt(r.holdExpiresAt)}</td>
                  <td className="py-2 pr-3 text-xs">{fmt(r.soldAt)}</td>
                  <td className="py-2 pr-3">
                    <ToggleButton action={setCategoryActive} categoryId={r.categoryId} value={!r.active} text={r.active ? "Deactivate" : "Activate"} />
                  </td>
                  <td className="py-2">
                    {r.storedStatus === "SOLD" ? (
                      <span className="text-xs text-ink-muted">Sold</span>
                    ) : (
                      <ToggleButton
                        action={setCategoryClosed}
                        categoryId={r.categoryId}
                        campaignId={campaign.id}
                        value={!r.manuallyClosed}
                        text={r.manuallyClosed ? "Reopen" : "Close"}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
