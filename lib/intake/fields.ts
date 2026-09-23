import { z } from "zod";

/**
 * Intake form fields. Everything is optional while saving; the database
 * re-checks what a submission needs (see save_intake).
 */

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters.`)
    .optional()
    .transform((v) => (v ? v : null));

/** http(s) URLs only; "example.com" becomes "https://example.com". */
const url = z
  .string()
  .trim()
  .max(500, "Keep this under 500 characters.")
  .optional()
  .transform((v, ctx) => {
    if (!v) return null;
    const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`;
    try {
      const u = new URL(withScheme);
      if ((u.protocol !== "https:" && u.protocol !== "http:") || !u.hostname.includes(".")) throw new Error();
      return u.toString();
    } catch {
      ctx.addIssue({ code: "custom", message: "Enter a web address like example.com." });
      return z.NEVER;
    }
  });

export const intakeFieldsSchema = z.object({
  // The form sends "" until an option is picked.
  design_choice: z.preprocess((v) => (v === "" ? null : v), z.enum(["BUILD_FOR_ME", "FINISHED_ARTWORK"]).nullish()).transform((v) => v ?? null),
  business_name: text(200),
  contact_name: text(200),
  contact_email: z
    .string()
    .trim()
    .max(254)
    .optional()
    .transform((v, ctx) => {
      if (!v) return null;
      if (!z.email().safeParse(v).success) {
        ctx.addIssue({ code: "custom", message: "Enter a valid email address." });
        return z.NEVER;
      }
      return v;
    }),
  phone: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((v, ctx) => {
      if (!v) return null;
      if (!/^[0-9+().\s-]{7,40}$/.test(v) || v.replace(/\D/g, "").length < 7) {
        ctx.addIssue({ code: "custom", message: "Enter a phone number." });
        return z.NEVER;
      }
      return v;
    }),
  website_url: url,
  headline: text(200),
  offer: text(500),
  call_to_action: text(200),
  qr_url: url,
  notes: text(2000),
});

export type IntakeFields = z.output<typeof intakeFieldsSchema>;
export type IntakeFieldName = keyof IntakeFields;
