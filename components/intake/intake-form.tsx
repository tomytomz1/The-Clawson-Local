"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { FILE_RULES, MAX_PHOTOS, type AssetKind } from "@/lib/intake/files";
import { missingRequirements, REQUIREMENT_LABELS, type DesignChoice, type RequirementKey } from "@/lib/intake/requirements";

type Fields = {
  design_choice: DesignChoice | "";
  business_name: string;
  contact_name: string;
  contact_email: string;
  phone: string;
  website_url: string;
  headline: string;
  offer: string;
  call_to_action: string;
  qr_url: string;
  notes: string;
};

export type FormAsset = { id: string; kind: AssetKind; filename: string; sizeBytes: number };

const input = "mt-1 w-full rounded-sm border border-ink/40 bg-white px-3 py-2.5 text-base focus:border-ink focus:outline-none";
const labelCls = "block text-sm font-semibold text-ink";
const hint = "mt-1 text-sm text-ink-muted";

const EXT_TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", svg: "image/svg+xml", pdf: "application/pdf", webp: "image/webp" };

function formatSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

type ApiError = { error?: string; message?: string; fieldErrors?: Record<string, string>; missing?: string[] };

export function IntakeForm({
  token,
  initial,
  initialAssets,
  submitted,
}: {
  token: string;
  initial: Fields;
  initialAssets: FormAsset[];
  submitted: boolean;
}) {
  const router = useRouter();
  const [fields, setFields] = useState<Fields>(initial);
  const [assets, setAssets] = useState<FormAsset[]>(initialAssets);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState<"save" | "submit" | null>(null);
  const [uploading, setUploading] = useState<Partial<Record<AssetKind, boolean>>>({});
  const [uploadErrors, setUploadErrors] = useState<Partial<Record<AssetKind, string>>>({});
  const [showMissing, setShowMissing] = useState(false);

  const api = async (body: Record<string, unknown>) => {
    const res = await fetch(`/api/intake/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & ApiError;
    return { ok: res.ok, data };
  };

  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFields((f) => ({ ...f, [k]: e.target.value }));
    setFieldErrors((errs) => ({ ...errs, [k]: "" }));
    setNotice(null);
  };

  const has = { logo: assets.some((a) => a.kind === "logo"), artwork: assets.some((a) => a.kind === "artwork") };
  const missing = missingRequirements(fields, has);
  const isMissing = (k: RequirementKey) => showMissing && missing.includes(k);

  async function save(submit: boolean) {
    setBusy(submit ? "submit" : "save");
    setNotice(null);
    if (submit) setShowMissing(true);
    try {
      const { ok, data } = await api({ action: submit ? "submit" : "save", fields });
      if (ok) {
        setFieldErrors({});
        if (submit) {
          router.push(`/intake/${token}/submitted`);
          return;
        }
        setNotice({ tone: "ok", text: "Progress saved. You can come back to this link any time." });
      } else {
        setFieldErrors(data.fieldErrors ?? {});
        const extra = data.missing?.length
          ? ` Still needed: ${data.missing.map((m) => REQUIREMENT_LABELS[m as RequirementKey] ?? m).join(", ")}.`
          : "";
        setNotice({ tone: "error", text: `${data.message ?? "Something went wrong. Please try again."}${extra}` });
      }
    } catch {
      setNotice({ tone: "error", text: "Could not reach the server. Check your connection and try again." });
    } finally {
      setBusy(null);
    }
  }

  async function upload(kind: AssetKind, file: File) {
    setUploadErrors((e) => ({ ...e, [kind]: "" }));
    const rule = FILE_RULES[kind];
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const contentType = file.type || EXT_TYPES[ext] || "";
    if (!(rule.types as readonly string[]).includes(contentType)) {
      setUploadErrors((e) => ({ ...e, [kind]: `That file type isn’t accepted here. Use ${rule.label}.` }));
      return;
    }
    if (file.size > rule.maxBytes) {
      setUploadErrors((e) => ({ ...e, [kind]: `That file is too large. Use ${rule.label}.` }));
      return;
    }
    setUploading((u) => ({ ...u, [kind]: true }));
    try {
      const start = await api({ action: "upload", kind, filename: file.name, contentType, size: file.size });
      if (!start.ok) throw new Error(start.data.message ?? "Upload failed.");
      const { assetId, uploadUrl } = start.data as { assetId: string; uploadUrl: string };
      const put = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": contentType, "x-upsert": "false" }, body: file });
      if (!put.ok) {
        await api({ action: "remove", assetId }).catch(() => {});
        throw new Error("The upload didn’t finish. Please try again.");
      }
      const done = await api({ action: "complete", assetId });
      if (!done.ok) throw new Error(done.data.message ?? "Upload failed.");
      const asset = done.data.asset as FormAsset;
      setAssets((list) => [...list.filter((a) => (kind === "photo" ? true : a.kind !== kind)), asset]);
    } catch (err) {
      setUploadErrors((e) => ({ ...e, [kind]: err instanceof Error ? err.message : "Upload failed." }));
    } finally {
      setUploading((u) => ({ ...u, [kind]: false }));
    }
  }

  async function remove(asset: FormAsset) {
    const { ok, data } = await api({ action: "remove", assetId: asset.id });
    if (ok || data.error === "not_found") setAssets((list) => list.filter((a) => a.id !== asset.id));
    else setUploadErrors((e) => ({ ...e, [asset.kind]: data.message ?? "Could not remove the file." }));
  }

  const text = (k: keyof Fields, label: string, opts: { required?: boolean; type?: string; hintText?: string; placeholder?: string; autoComplete?: string; req?: RequirementKey } = {}) => (
    <div>
      <label htmlFor={k} className={labelCls}>
        {label} {opts.required ? <span className="text-accent">*</span> : <span className="font-normal text-ink-muted">(optional)</span>}
      </label>
      <input
        id={k}
        name={k}
        type={opts.type ?? "text"}
        value={fields[k]}
        onChange={set(k)}
        placeholder={opts.placeholder}
        autoComplete={opts.autoComplete}
        aria-invalid={Boolean(fieldErrors[k]) || isMissing(opts.req ?? (k as RequirementKey))}
        className={`${input} ${fieldErrors[k] || isMissing(opts.req ?? (k as RequirementKey)) ? "border-accent" : ""}`}
      />
      {opts.hintText && <p className={hint}>{opts.hintText}</p>}
      {fieldErrors[k] && <p className="mt-1 text-sm font-medium text-accent">{fieldErrors[k]}</p>}
    </div>
  );

  const area = (k: keyof Fields, label: string, required: boolean, hintText: string, rows = 3) => (
    <div>
      <label htmlFor={k} className={labelCls}>
        {label} {required ? <span className="text-accent">*</span> : <span className="font-normal text-ink-muted">(optional)</span>}
      </label>
      <textarea
        id={k}
        name={k}
        rows={rows}
        value={fields[k]}
        onChange={set(k)}
        aria-invalid={Boolean(fieldErrors[k]) || isMissing(k as RequirementKey)}
        className={`${input} ${fieldErrors[k] || isMissing(k as RequirementKey) ? "border-accent" : ""}`}
      />
      <p className={hint}>{hintText}</p>
      {fieldErrors[k] && <p className="mt-1 text-sm font-medium text-accent">{fieldErrors[k]}</p>}
    </div>
  );

  const buildForMe = fields.design_choice === "BUILD_FOR_ME";
  const finished = fields.design_choice === "FINISHED_ARTWORK";

  const uploader = (kind: AssetKind, title: string, required: boolean, description: string) => (
    <Uploader
      kind={kind}
      title={title}
      required={required}
      description={description}
      assets={assets.filter((a) => a.kind === kind)}
      busy={Boolean(uploading[kind])}
      error={uploadErrors[kind] || (isMissing(kind as RequirementKey) ? "Required before you can submit." : "")}
      onFile={(f) => upload(kind, f)}
      onRemove={remove}
    />
  );

  const section = "border-2 border-ink bg-card p-5 sm:p-6";
  const sectionTitle = "font-serif text-2xl font-semibold";

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save(true);
      }}
      className="space-y-6"
    >
      {submitted && (
        <p className="border-l-4 border-ok bg-ok-tint px-4 py-3 text-sm">
          We have your materials. You can still update anything below and submit again until we send your proof.
        </p>
      )}

      <section className={section} aria-labelledby="s1">
        <h2 id="s1" className={sectionTitle}>
          1. Business info
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {text("business_name", "Business name", { required: true, autoComplete: "organization" })}
          {text("contact_name", "Your name", { required: true, autoComplete: "name", hintText: "Who we contact about the proof." })}
          {text("contact_email", "Email", { required: true, type: "email", autoComplete: "email" })}
          {text("phone", "Phone", { required: true, type: "tel", autoComplete: "tel" })}
          <div className="sm:col-span-2">{text("website_url", "Website", { type: "url", placeholder: "example.com", autoComplete: "url" })}</div>
        </div>
      </section>

      <section className={section} aria-labelledby="s2">
        <h2 id="s2" className={sectionTitle}>
          2. What should the ad say?
        </h2>
        <fieldset className="mt-4">
          <legend className={labelCls}>
            How should we make your ad? <span className="text-accent">*</span>
          </legend>
          <div className={`mt-2 grid gap-3 sm:grid-cols-2 ${isMissing("design_choice") ? "outline-2 outline-accent" : ""}`}>
            {(
              [
                ["BUILD_FOR_ME", "Build the ad for me", "Send your logo and what the ad should say. We design it and send a proof."],
                ["FINISHED_ARTWORK", "I have finished artwork", "Upload a print-ready file. We check it and send a proof."],
              ] as const
            ).map(([value, title, desc]) => (
              <label
                key={value}
                className={`flex cursor-pointer gap-3 rounded-sm border-2 p-4 ${fields.design_choice === value ? "border-accent bg-accent-tint" : "border-ink/30 bg-white"}`}
              >
                <input
                  type="radio"
                  name="design_choice"
                  value={value}
                  checked={fields.design_choice === value}
                  onChange={() => setFields((f) => ({ ...f, design_choice: value }))}
                  className="mt-1"
                />
                <span>
                  <span className="block font-semibold">{title}</span>
                  <span className="block text-sm text-ink-soft">{desc}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {!finished && (
          <div className="mt-5 grid gap-4">
            {text("headline", "Headline", { required: buildForMe, hintText: "The biggest words on your ad, e.g. “Clawson’s family plumber since 1998.”" })}
            {area("offer", "Offer", false, "A reason to call now, e.g. “$50 off your first service call.”", 2)}
            {text("call_to_action", "Call to action", { required: buildForMe, hintText: "What should people do? e.g. “Call 248-555-0100 today.”" })}
          </div>
        )}
        <div className="mt-4 grid gap-4">
          {text("qr_url", "QR code destination", { type: "url", placeholder: "example.com/offer", hintText: "Where the QR code on your ad should go. Leave blank for no QR code." })}
          {area("notes", "Notes", false, "Anything else: colors to use or avoid, services to feature, details for the designer.")}
        </div>
      </section>

      <section className={section} aria-labelledby="s3">
        <h2 id="s3" className={sectionTitle}>
          3. Upload assets
        </h2>
        {!fields.design_choice && <p className="mt-2 text-ink-soft">Choose how we should make your ad in step 2 to see what to upload.</p>}
        <div className="mt-4 space-y-5">
          {finished && uploader("artwork", "Finished artwork", true, `Your print-ready ad. ${FILE_RULES.artwork.label}.`)}
          {fields.design_choice &&
            uploader("logo", "Logo", buildForMe, `${FILE_RULES.logo.label}. The highest-quality version you have.`)}
          {buildForMe && uploader("photo", "Photos", false, `Up to ${MAX_PHOTOS}. ${FILE_RULES.photo.label} each.`)}
        </div>
      </section>

      <section className={section} aria-labelledby="s4">
        <h2 id="s4" className={sectionTitle}>
          4. Review and submit
        </h2>
        {missing.length > 0 ? (
          <div className="mt-3">
            <p className="text-ink-soft">Still needed before you can submit:</p>
            <ul className="mt-2 list-disc pl-5 text-sm">
              {missing.map((m) => (
                <li key={m}>{REQUIREMENT_LABELS[m]}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-3 text-ink-soft">Everything we need is here. Submit when you&apos;re ready.</p>
        )}
        {notice && (
          <p
            role={notice.tone === "error" ? "alert" : "status"}
            className={`mt-4 border-l-4 px-3 py-2 text-sm font-medium ${notice.tone === "error" ? "border-accent bg-accent-tint" : "border-ok bg-ok-tint"}`}
          >
            {notice.text}
          </p>
        )}
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <button type="submit" className="btn-primary" disabled={busy !== null || Object.values(uploading).some(Boolean)}>
            {busy === "submit" ? "Submitting…" : submitted ? "Submit updates" : "Submit materials"}
          </button>
          <button type="button" className="btn-secondary" disabled={busy !== null} onClick={() => void save(false)}>
            {busy === "save" ? "Saving…" : "Save progress"}
          </button>
        </div>
        <p className={hint}>We&apos;ll use these materials to create your ad and send you a proof before anything prints.</p>
      </section>
    </form>
  );
}

function Uploader({
  kind,
  title,
  required,
  description,
  assets,
  busy,
  error,
  onFile,
  onRemove,
}: {
  kind: AssetKind;
  title: string;
  required: boolean;
  description: string;
  assets: FormAsset[];
  busy: boolean;
  error: string;
  onFile: (f: File) => void;
  onRemove: (a: FormAsset) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const full = kind === "photo" && assets.length >= MAX_PHOTOS;
  return (
    <div>
      <p className={labelCls}>
        {title} {required ? <span className="text-accent">*</span> : <span className="font-normal text-ink-muted">(optional)</span>}
      </p>
      <p className={hint}>{description}</p>
      {assets.length > 0 && (
        <ul className="mt-2 space-y-2">
          {assets.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 border border-ink/20 bg-white px-3 py-2 text-sm">
              <span className="min-w-0 truncate">
                <span aria-hidden="true" className="mr-2 text-ok">
                  ✓
                </span>
                {a.filename} <span className="text-ink-muted">({formatSize(a.sizeBytes)})</span>
              </span>
              <button type="button" onClick={() => onRemove(a)} className="shrink-0 text-accent underline underline-offset-2">
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {!full && (
        <div className="mt-2">
          <input
            ref={ref}
            id={`file-${kind}`}
            type="file"
            accept={FILE_RULES[kind].accept}
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) onFile(f);
            }}
          />
          <button type="button" className="btn-secondary w-full sm:w-auto" disabled={busy} onClick={() => ref.current?.click()}>
            {busy ? "Uploading…" : assets.length > 0 && kind !== "photo" ? `Replace ${title.toLowerCase()}` : `Choose ${kind === "photo" ? "a photo" : "file"}`}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm font-medium text-accent">
          {error}
        </p>
      )}
    </div>
  );
}
