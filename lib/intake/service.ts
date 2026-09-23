import { randomUUID } from "node:crypto";
import { firstRow, type Rpc } from "@/lib/checkout/rpc";
import { intakeFieldsSchema, type IntakeFieldName, type IntakeFields } from "./fields";
import { CONTENT_TYPES, checkDeclaredUpload, FILE_RULES, sanitizeFilename, sniffContentType, type AllowedContentType, type AssetKind } from "./files";
import type { IntakeStorage } from "./storage";
import { deriveIntakeToken, hashIntakeToken, intakeSecret, isWellFormedToken } from "./token";

/**
 * Advertiser intake, independent of Next.js so the same code runs in routes
 * and tests. Every operation starts from the link token: a malformed token,
 * an unknown token, a missing INTAKE_TOKEN_SECRET or an advertiser whose
 * reservation is not PAID all look the same ("not found").
 */

export type IntakeStatus = "NOT_STARTED" | "IN_PROGRESS" | "SUBMITTED";

export type IntakeView = {
  intakeId: string;
  status: IntakeStatus;
  submittedAt: string | null;
  lastSavedAt: string | null;
  categoryName: string;
  campaignName: string;
  market: string;
  fields: IntakeFields;
};

export type IntakeAsset = {
  id: string;
  kind: AssetKind;
  filename: string;
  contentType: string;
  sizeBytes: number;
};

type IntakeRow = {
  intake_id: string;
  status: IntakeStatus;
  submitted_at: string | null;
  last_saved_at: string | null;
  category_name: string;
  campaign_name: string;
  market: string;
} & IntakeFields;

type AssetRow = { asset_id: string; kind: AssetKind; original_filename: string; content_type: string; size_bytes: number | string };

export class IntakeError extends Error {
  constructor(
    readonly code:
      | "not_found"
      | "invalid_fields"
      | "incomplete"
      | "invalid_kind"
      | "unsupported_type"
      | "file_too_large"
      | "empty_file"
      | "upload_missing"
      | "type_mismatch"
      | "too_many_photos"
      | "too_many_pending_uploads",
    readonly details: { fieldErrors?: Partial<Record<string, string>>; missing?: string[] } = {},
  ) {
    super(code);
    this.name = "IntakeError";
  }
}

export type IntakeDeps = { rpc: Rpc; storage: IntakeStorage; secret?: string | null };

/** Token hash for a request, or null when the intake is disabled or the token is malformed. */
function tokenHash(token: unknown, deps: IntakeDeps): string | null {
  const secret = deps.secret === undefined ? intakeSecret() : deps.secret;
  if (!secret || !isWellFormedToken(token)) return null;
  return hashIntakeToken(token);
}

function requireHash(token: unknown, deps: IntakeDeps): string {
  const h = tokenHash(token, deps);
  if (!h) throw new IntakeError("not_found");
  return h;
}

function rethrow(err: unknown): never {
  const message = err instanceof Error ? err.message : String(err);
  for (const code of ["too_many_photos", "too_many_pending_uploads"] as const) {
    if (message.includes(code)) throw new IntakeError(code);
  }
  if (/intake_not_found|asset_not_found/.test(message)) throw new IntakeError("not_found");
  const incomplete = message.match(/intake_incomplete:([a-z_,]+)/);
  if (incomplete) throw new IntakeError("incomplete", { missing: incomplete[1].split(",") });
  throw err;
}

export async function getIntake(token: unknown, deps: IntakeDeps): Promise<{ intake: IntakeView; assets: IntakeAsset[] } | null> {
  const hash = tokenHash(token, deps);
  if (!hash) return null;
  const row = firstRow(await deps.rpc<IntakeRow[]>("get_intake", { p_token_hash: hash }));
  if (!row) return null;
  const assets = await deps.rpc<AssetRow[]>("get_intake_assets", { p_token_hash: hash });
  return {
    intake: {
      intakeId: row.intake_id,
      status: row.status,
      submittedAt: row.submitted_at,
      lastSavedAt: row.last_saved_at,
      categoryName: row.category_name,
      campaignName: row.campaign_name,
      market: row.market,
      fields: {
        design_choice: row.design_choice,
        business_name: row.business_name,
        contact_name: row.contact_name,
        contact_email: row.contact_email,
        phone: row.phone,
        website_url: row.website_url,
        headline: row.headline,
        offer: row.offer,
        call_to_action: row.call_to_action,
        qr_url: row.qr_url,
        notes: row.notes,
      },
    },
    assets: (assets ?? []).map((a) => ({
      id: a.asset_id,
      kind: a.kind,
      filename: a.original_filename,
      contentType: a.content_type,
      sizeBytes: Number(a.size_bytes),
    })),
  };
}

/** Validate and save the form; with submit=true also submit it. Returns the new status. */
export async function saveIntake(token: unknown, input: unknown, submit: boolean, deps: IntakeDeps): Promise<IntakeStatus> {
  const hash = requireHash(token, deps);
  const parsed = intakeFieldsSchema.safeParse(input ?? {});
  if (!parsed.success) {
    const fieldErrors: Partial<Record<IntakeFieldName, string>> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as IntakeFieldName;
      fieldErrors[key] ??= issue.message;
    }
    throw new IntakeError("invalid_fields", { fieldErrors });
  }
  const f = parsed.data;
  try {
    return await deps.rpc<IntakeStatus>("save_intake", {
      p_token_hash: hash,
      p_submit: submit,
      p_design_choice: f.design_choice,
      p_business_name: f.business_name,
      p_contact_name: f.contact_name,
      p_contact_email: f.contact_email,
      p_phone: f.phone,
      p_website_url: f.website_url,
      p_headline: f.headline,
      p_offer: f.offer,
      p_call_to_action: f.call_to_action,
      p_qr_url: f.qr_url,
      p_notes: f.notes,
    });
  } catch (err) {
    rethrow(err);
  }
}

/** Step 1 of an upload: check the declared file, register it, hand out a signed upload URL. */
export async function requestUpload(
  token: unknown,
  file: { kind: unknown; filename: unknown; contentType: unknown; size: unknown },
  deps: IntakeDeps,
): Promise<{ assetId: string; uploadUrl: string; contentType: AllowedContentType }> {
  const hash = requireHash(token, deps);
  const rejection = checkDeclaredUpload(file.kind, file.contentType, file.size);
  if (rejection) throw new IntakeError(rejection);
  const kind = file.kind as AssetKind;
  const contentType = file.contentType as AllowedContentType;
  const assetId = randomUUID();
  let path: string;
  try {
    path = await deps.rpc<string>("create_intake_asset", {
      p_token_hash: hash,
      p_kind: kind,
      p_asset_id: assetId,
      p_extension: CONTENT_TYPES[contentType],
      p_original_filename: sanitizeFilename(file.filename),
      p_content_type: contentType,
      p_size_bytes: file.size,
    });
  } catch (err) {
    rethrow(err);
  }
  return { assetId, uploadUrl: await deps.storage.createUploadUrl(path), contentType };
}

type PendingAsset = { asset_id: string; kind: AssetKind; status: string; storage_path: string; content_type: string };

/**
 * Step 2: after the browser uploaded, check what actually landed in storage
 * (size, stored type, and the real type from the file's first bytes). Only
 * then is the asset READY. A bad file is deleted, never kept.
 */
export async function completeUpload(token: unknown, assetId: unknown, deps: IntakeDeps): Promise<IntakeAsset> {
  const hash = requireHash(token, deps);
  if (typeof assetId !== "string" || !/^[0-9a-f-]{36}$/i.test(assetId)) throw new IntakeError("not_found");
  const asset = firstRow(await deps.rpc<PendingAsset[]>("get_intake_asset", { p_token_hash: hash, p_asset_id: assetId }));
  if (!asset || (asset.status !== "PENDING" && asset.status !== "READY")) throw new IntakeError("not_found");

  const stored = await deps.storage.inspect(asset.storage_path);
  const reject = async (code: "upload_missing" | "file_too_large" | "type_mismatch" | "empty_file"): Promise<never> => {
    await deps.rpc("delete_intake_asset", { p_token_hash: hash, p_asset_id: assetId });
    if (stored) await deps.storage.remove([asset.storage_path]).catch((e) => console.error("[intake] remove rejected upload failed", e));
    throw new IntakeError(code);
  };
  if (!stored) return reject("upload_missing");
  if (stored.size <= 0) return reject("empty_file");
  if (stored.size > FILE_RULES[asset.kind].maxBytes) return reject("file_too_large");
  const sniffed = sniffContentType(stored.head);
  const storedType = stored.contentType?.split(";")[0].trim().toLowerCase() ?? null;
  if (sniffed !== asset.content_type || (storedType !== null && storedType !== asset.content_type)) return reject("type_mismatch");

  let replaced: { replaced_path: string }[];
  try {
    replaced = (await deps.rpc<{ replaced_path: string }[]>("confirm_intake_asset", {
      p_token_hash: hash,
      p_asset_id: assetId,
      p_size_bytes: stored.size,
    })) ?? [];
  } catch (err) {
    if (err instanceof Error && err.message.includes("too_many_photos")) {
      await deps.rpc("delete_intake_asset", { p_token_hash: hash, p_asset_id: assetId });
      await deps.storage.remove([asset.storage_path]).catch(() => {});
    }
    rethrow(err);
  }
  const old = replaced.map((r) => r.replaced_path).filter(Boolean);
  if (old.length) await deps.storage.remove(old).catch((e) => console.error("[intake] remove replaced files failed", e));

  const view = await getIntake(token, deps);
  const ready = view?.assets.find((a) => a.id === assetId);
  if (!ready) throw new IntakeError("not_found");
  return ready;
}

export async function removeAsset(token: unknown, assetId: unknown, deps: IntakeDeps): Promise<void> {
  const hash = requireHash(token, deps);
  if (typeof assetId !== "string" || !/^[0-9a-f-]{36}$/i.test(assetId)) throw new IntakeError("not_found");
  const path = await deps.rpc<string | null>("delete_intake_asset", { p_token_hash: hash, p_asset_id: assetId });
  if (!path) throw new IntakeError("not_found");
  await deps.storage.remove([path]).catch((e) => console.error("[intake] remove file failed", e));
}

/** Create (idempotently) the intake for a PAID advertiser and return its link token, or null if unavailable. */
export async function ensureIntakeLink(advertiserId: string, deps: { rpc: Rpc; secret?: string | null }): Promise<string | null> {
  const secret = deps.secret === undefined ? intakeSecret() : deps.secret;
  if (!secret) return null;
  const token = deriveIntakeToken(advertiserId, secret);
  try {
    await deps.rpc("ensure_advertiser_intake", { p_advertiser_id: advertiserId, p_token_hash: hashIntakeToken(token) });
  } catch (err) {
    if (err instanceof Error && err.message.includes("advertiser_not_paid")) return null;
    throw err;
  }
  return token;
}

export const INTAKE_ERROR_MESSAGES: Record<IntakeError["code"], string> = {
  not_found: "This intake link is not valid.",
  invalid_fields: "Please fix the highlighted fields.",
  incomplete: "A few things are still needed before you can submit.",
  invalid_kind: "Unknown upload type.",
  unsupported_type: "That file type isn’t accepted here.",
  file_too_large: "That file is too large.",
  empty_file: "That file is empty.",
  upload_missing: "The upload didn’t finish. Please try again.",
  type_mismatch: "That file’s contents don’t match its type. Please export it again and retry.",
  too_many_photos: "You can add up to 3 photos. Remove one to add another.",
  too_many_pending_uploads: "Too many uploads in a short time. Please wait a bit and try again.",
};
