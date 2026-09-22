"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { campaignUpdateSchema, toggleSchema, uuidSchema } from "@/lib/admin/schemas";
import { getAdminClient } from "@/lib/db/supabase";

function done(params: { ok?: string; error?: string }): never {
  const q = new URLSearchParams(params as Record<string, string>);
  revalidatePath("/", "layout");
  redirect(`/admin?${q.toString()}`);
}

export async function updateCampaign(formData: FormData) {
  await requireAdmin();
  const id = uuidSchema.safeParse(formData.get("campaign_id"));
  const parsed = campaignUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!id.success || !parsed.success) {
    const issue = parsed.error?.issues[0];
    done({ error: issue ? `${issue.path.join(".")}: ${issue.message}` : "Invalid campaign id" });
  }

  const db = getAdminClient();
  const { data: sold, error: soldErr } = await db.rpc("campaign_sold_count", { p_campaign_id: id.data });
  if (soldErr) done({ error: soldErr.message });
  if (parsed.data.max_advertisers < Number(sold)) {
    done({ error: `Max advertisers cannot be below the ${sold} already sold.` });
  }

  const { error } = await db.from("campaigns").update(parsed.data).eq("id", id.data);
  if (error) done({ error: error.message });
  done({ ok: "Campaign saved." });
}

export async function setCategoryActive(formData: FormData) {
  await requireAdmin();
  const parsed = toggleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) done({ error: "Invalid request" });
  const db = getAdminClient();

  if (!parsed.data.value) {
    const { data: sold } = await db
      .from("campaign_categories")
      .select("id")
      .eq("category_id", parsed.data.category_id)
      .eq("status", "SOLD")
      .limit(1);
    if (sold?.length) done({ error: "A sold category cannot be deactivated." });
  }

  const { error } = await db.from("categories").update({ active: parsed.data.value }).eq("id", parsed.data.category_id);
  if (error) done({ error: error.message });
  done({ ok: parsed.data.value ? "Category activated." : "Category deactivated." });
}

export async function setCategoryClosed(formData: FormData) {
  await requireAdmin();
  const parsed = toggleSchema.safeParse(Object.fromEntries(formData));
  const campaignId = uuidSchema.safeParse(formData.get("campaign_id"));
  if (!parsed.success || !campaignId.success) done({ error: "Invalid request" });

  const db = getAdminClient();
  const { data: row, error: readErr } = await db
    .from("campaign_categories")
    .select("status")
    .eq("campaign_id", campaignId.data)
    .eq("category_id", parsed.data.category_id)
    .maybeSingle<{ status: string }>();
  if (readErr) done({ error: readErr.message });
  if (row?.status === "SOLD") done({ error: "A sold category cannot be closed or reopened." });

  const { error } = await db
    .from("campaign_categories")
    .upsert(
      { campaign_id: campaignId.data, category_id: parsed.data.category_id, manually_closed: parsed.data.value },
      { onConflict: "campaign_id,category_id" },
    );
  if (error) done({ error: error.message });
  done({ ok: parsed.data.value ? "Category closed." : "Category reopened." });
}
