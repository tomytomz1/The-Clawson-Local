import type { Category } from "@/types/campaign";

export type { Category };

/** Category-specific landing line, or the shared template line. */
export function getCategoryLandingLine(category: Category, marketName: string): string {
  return (
    category.landingLine ??
    `Keep your ${category.shortName} business familiar to ${marketName} households before they need what you offer.`
  );
}
