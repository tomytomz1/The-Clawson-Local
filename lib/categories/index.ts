import { categorySeeds, type CategorySeed } from "@/config/categories";

export type Category = CategorySeed;

export async function getActiveCategories(): Promise<Category[]> {
  return categorySeeds
    .filter((c) => c.active)
    .sort((a, b) => a.priority - b.priority);
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  return categorySeeds.find((c) => c.active && c.slug === slug) ?? null;
}

/** Category-specific landing line, or the shared template line. */
export function getCategoryLandingLine(category: Category, marketName: string): string {
  return (
    category.landingLine ??
    `Keep your ${category.shortName} business familiar to ${marketName} households before they need what you offer.`
  );
}
