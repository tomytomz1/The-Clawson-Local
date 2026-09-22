/**
 * Seed list of advertiser categories.
 *
 * `conflictKey` enforces exclusivity: one paid advertiser per conflict key per
 * edition. `aliases` are alternate names that resolve to the same conflict key
 * (e.g. "Furnace Repair" -> hvac). Phase 2 seeds the `categories` table from
 * this list; the database then becomes authoritative.
 */
export type CategorySeed = {
  slug: string;
  displayName: string;
  /** Short name used inside sentences, e.g. "plumbing". */
  shortName: string;
  conflictKey: string;
  aliases: string[];
  /** Category-specific landing line. Null uses the shared template line. */
  landingLine: string | null;
  priority: number;
  active: boolean;
  manuallyClosed: boolean;
};

const c = (
  priority: number,
  slug: string,
  displayName: string,
  shortName: string,
  conflictKey: string,
  aliases: string[] = [],
  landingLine: string | null = null,
): CategorySeed => ({
  slug,
  displayName,
  shortName,
  conflictKey,
  aliases,
  landingLine,
  priority,
  active: true,
  manuallyClosed: false,
});

export const categorySeeds: CategorySeed[] = [
  c(1, "hvac", "HVAC", "HVAC", "hvac", ["Air Conditioning", "Heating", "Furnace Repair"],
    "Stay visible in Clawson before the furnace stops heating or the AC stops cooling."),
  c(2, "plumbing", "Plumbing", "plumbing", "plumbing", ["Plumber", "Drain Service"],
    "Put your company in front of local households before the leak, clogged drain or plumbing emergency happens."),
  c(3, "roofing", "Roofing", "roofing", "roofing", ["Roofer"],
    "Put your company in the neighborhood before the homeowner discovers the leak, missing shingles or storm damage."),
  c(4, "electrician", "Electrician", "electrical", "electrical", ["Electrical"],
    "Build local recognition before the homeowner needs electrical repairs, upgrades or installation work."),
  c(5, "garage-door", "Garage Door", "garage door", "garage-door"),
  c(6, "restoration", "Restoration", "restoration", "restoration", ["Water Damage", "Fire Damage"]),
  c(7, "basement-foundation-waterproofing", "Basement / Foundation / Waterproofing", "basement and foundation", "basement-foundation", ["Waterproofing", "Foundation Repair"]),
  c(8, "kitchen-bath-remodeling", "Kitchen & Bath Remodeling", "remodeling", "remodeling", ["Kitchen Remodeling", "Bathroom Remodeling"]),
  c(9, "windows-doors", "Windows & Doors", "windows and doors", "windows-doors"),
  c(10, "tree-service", "Tree Service", "tree service", "tree-service", ["Tree Removal", "Arborist"]),
  c(11, "pest-control", "Pest Control", "pest control", "pest-control", ["Exterminator"]),
  c(12, "landscaping-lawn", "Landscaping / Lawn", "landscaping", "landscaping", ["Lawn Care", "Landscaping"]),
  c(13, "junk-removal", "Junk Removal", "junk removal", "junk-removal", ["Hauling"]),
  c(14, "painting", "Painting", "painting", "painting", ["Painter"]),
  c(15, "flooring-carpet", "Flooring / Carpet", "flooring", "flooring", ["Carpet", "Flooring"]),
  c(16, "auto-repair", "Auto Repair", "auto repair", "auto-repair", ["Mechanic"]),
  c(17, "dentist", "Dentist", "dental", "dental", ["Dental Practice"],
    "Build familiarity with local households looking for a dental practice close to home."),
  c(18, "realtor", "Realtor", "real estate", "real-estate", ["Real Estate Agent"],
    "Keep your name visible in the community before the next homeowner decides to buy or sell."),
  c(19, "chiropractic-physical-therapy", "Chiropractic / Physical Therapy", "chiropractic and physical therapy", "chiropractic-pt", ["Chiropractor", "Physical Therapy"]),
  c(20, "pizza-takeout", "Pizza / Takeout", "pizza", "pizza-takeout", ["Pizza", "Takeout"],
    "Give local households a reason to keep the mailer nearby with an offer they can actually use."),
  c(21, "veterinary", "Veterinary", "veterinary", "veterinary", ["Veterinarian", "Animal Hospital"]),
  c(22, "house-cleaning", "House Cleaning", "house cleaning", "house-cleaning", ["Maid Service"]),
  c(23, "fence-deck", "Fence / Deck", "fence and deck", "fence-deck", ["Fencing", "Decks"]),
  c(24, "gutter", "Gutter", "gutter", "gutter", ["Gutter Cleaning", "Gutter Guards"]),
  c(25, "moving", "Moving", "moving", "moving", ["Movers"]),
  c(26, "insurance", "Insurance", "insurance", "insurance", ["Insurance Agent"]),
  c(27, "med-spa", "Med Spa", "med spa", "med-spa"),
  c(28, "pet-grooming", "Pet Grooming", "pet grooming", "pet-grooming", ["Dog Grooming"]),
  c(29, "salon-barber", "Salon / Barber", "salon and barber", "salon-barber", ["Hair Salon", "Barbershop"]),
  c(30, "optometrist", "Optometrist", "eye care", "optometry", ["Eye Doctor"]),
];
