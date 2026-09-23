import "server-only";
import { serverRpc } from "@/lib/checkout/server";
import { getAdminClient } from "@/lib/db/supabase";
import { supabaseIntakeStorage } from "@/lib/intake/server";
import { ensureIntakeLink } from "@/lib/intake/service";

/** Admin views of paid advertisers and their intake. Service role; call only after requireAdmin(). */

export type AdvertiserListRow = {
  id: string;
  businessName: string | null;
  contactEmail: string | null;
  categoryName: string | null;
  paymentStatus: string | null;
  paidAt: string | null;
  intakeStatus: "NOT_STARTED" | "IN_PROGRESS" | "SUBMITTED";
  submittedAt: string | null;
};

type AdvertiserRow = { id: string; business_name: string | null; contact_email: string | null; created_at: string };
type ReservationRow = { id: string; advertiser_id: string; status: string; paid_at: string | null; created_at: string; category_id: string; campaign_id: string; amount_cents: number };
type IntakeRow = Record<string, unknown> & {
  id: string;
  advertiser_id: string;
  status: AdvertiserListRow["intakeStatus"];
  submitted_at: string | null;
};

/** Latest reservation per advertiser (PAID first). */
function latestReservation(rows: ReservationRow[]) {
  const by = new Map<string, ReservationRow>();
  const rank = (r: ReservationRow) => (r.status === "PAID" ? 1 : 0);
  for (const r of rows) {
    const cur = by.get(r.advertiser_id);
    if (!cur || rank(r) > rank(cur) || (rank(r) === rank(cur) && (r.paid_at ?? r.created_at) > (cur.paid_at ?? cur.created_at))) by.set(r.advertiser_id, r);
  }
  return by;
}

export async function listAdvertisers(): Promise<AdvertiserListRow[]> {
  const db = getAdminClient();
  const [adv, res, intakes, cats] = await Promise.all([
    db.from("advertisers").select("id, business_name, contact_email, created_at").order("created_at", { ascending: false }),
    db.from("reservations").select("id, advertiser_id, status, paid_at, created_at, category_id, campaign_id, amount_cents").not("advertiser_id", "is", null),
    db.from("advertiser_intakes").select("id, advertiser_id, status, submitted_at"),
    db.from("categories").select("id, display_name"),
  ]);
  for (const r of [adv, res, intakes, cats]) if (r.error) throw r.error;
  const resBy = latestReservation((res.data ?? []) as ReservationRow[]);
  const intakeBy = new Map(((intakes.data ?? []) as IntakeRow[]).map((i) => [i.advertiser_id, i]));
  const catName = new Map(((cats.data ?? []) as { id: string; display_name: string }[]).map((c) => [c.id, c.display_name]));
  return ((adv.data ?? []) as AdvertiserRow[]).map((a) => {
    const r = resBy.get(a.id);
    const i = intakeBy.get(a.id);
    return {
      id: a.id,
      businessName: a.business_name,
      contactEmail: a.contact_email,
      categoryName: r ? (catName.get(r.category_id) ?? null) : null,
      paymentStatus: r?.status ?? null,
      paidAt: r?.paid_at ?? null,
      intakeStatus: i?.status ?? "NOT_STARTED",
      submittedAt: i?.submitted_at ?? null,
    };
  });
}

export type AdvertiserDetail = AdvertiserListRow & {
  intakePath: string | null;
  intake: Record<string, string | null> | null;
  assets: { id: string; kind: string; filename: string; contentType: string; sizeBytes: number; confirmedAt: string | null; downloadUrl: string | null }[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getAdvertiserDetail(id: string): Promise<AdvertiserDetail | null> {
  if (!UUID.test(id)) return null;
  const row = (await listAdvertisers()).find((a) => a.id === id);
  if (!row) return null;

  // Creates the intake row if needed so the link is always retrievable here.
  let token: string | null = null;
  if (row.paymentStatus === "PAID") {
    try {
      token = await ensureIntakeLink(id, { rpc: serverRpc() });
    } catch (err) {
      console.error("[admin] could not prepare intake link", err instanceof Error ? err.message : err);
    }
  }

  const db = getAdminClient();
  const { data: intake, error } = await db
    .from("advertiser_intakes")
    .select("id, status, design_choice, business_name, contact_name, contact_email, phone, website_url, headline, offer, call_to_action, qr_url, notes, started_at, last_saved_at, submitted_at")
    .eq("advertiser_id", id)
    .maybeSingle<IntakeRow>();
  if (error) throw error;

  let assets: AdvertiserDetail["assets"] = [];
  if (intake) {
    const { data, error: aErr } = await db
      .from("intake_assets")
      .select("id, kind, original_filename, content_type, size_bytes, confirmed_at, storage_path")
      .eq("intake_id", intake.id)
      .eq("status", "READY")
      .order("kind")
      .order("confirmed_at");
    if (aErr) throw aErr;
    const storage = supabaseIntakeStorage();
    assets = await Promise.all(
      ((data ?? []) as { id: string; kind: string; original_filename: string; content_type: string; size_bytes: number; confirmed_at: string | null; storage_path: string }[]).map(async (a) => ({
        id: a.id,
        kind: a.kind,
        filename: a.original_filename,
        contentType: a.content_type,
        sizeBytes: Number(a.size_bytes),
        confirmedAt: a.confirmed_at,
        downloadUrl: await storage.downloadUrl(a.storage_path, a.original_filename).catch(() => null),
      })),
    );
  }

  const { id: _intakeId, advertiser_id: _adv, ...fields } = (intake ?? {}) as IntakeRow;
  void _intakeId;
  void _adv;
  return {
    ...row,
    intakeStatus: intake?.status ?? row.intakeStatus,
    submittedAt: intake?.submitted_at ?? row.submittedAt,
    intakePath: token ? `/intake/${token}` : null,
    intake: intake ? (fields as Record<string, string | null>) : null,
    assets,
  };
}
