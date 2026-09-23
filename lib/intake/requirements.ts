/**
 * What a submission needs, mirrored from save_intake() in the database (which
 * is the real check). Used by the form to show what is still missing.
 */
export type DesignChoice = "BUILD_FOR_ME" | "FINISHED_ARTWORK";

export type RequirementKey =
  | "design_choice"
  | "business_name"
  | "contact_name"
  | "contact_email"
  | "phone"
  | "headline"
  | "call_to_action"
  | "logo"
  | "artwork";

export const REQUIREMENT_LABELS: Record<RequirementKey, string> = {
  design_choice: "Choose how we should make your ad",
  business_name: "Business name",
  contact_name: "Your name",
  contact_email: "Email",
  phone: "Phone",
  headline: "Headline",
  call_to_action: "Call to action",
  logo: "Logo upload",
  artwork: "Finished artwork upload",
};

export function missingRequirements(
  f: Partial<Record<string, string | null | undefined>> & { design_choice?: DesignChoice | null | "" },
  hasAsset: { logo: boolean; artwork: boolean },
): RequirementKey[] {
  const blank = (k: string) => !f[k] || !String(f[k]).trim();
  const missing: RequirementKey[] = [];
  if (!f.design_choice) missing.push("design_choice");
  for (const k of ["business_name", "contact_name", "contact_email", "phone"] as const) if (blank(k)) missing.push(k);
  if (f.design_choice === "BUILD_FOR_ME") {
    if (blank("headline")) missing.push("headline");
    if (blank("call_to_action")) missing.push("call_to_action");
    if (!hasAsset.logo) missing.push("logo");
  } else if (f.design_choice === "FINISHED_ARTWORK" && !hasAsset.artwork) {
    missing.push("artwork");
  }
  return missing;
}
