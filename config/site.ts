/**
 * Business / contact facts. Anything not yet confirmed is `null` and is
 * rendered as "to be published" rather than invented.
 */
export const site = {
  name: "The Clawson Local",
  domain: "theclawsonlocal.com",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://theclawsonlocal.com",
  consumerTagline: "Discover local. Support local. Save local.",
  advertiserTagline: "Reach Clawson Together.",
  servingLine: "Serving Clawson, Michigan",

  // Downtown Clawson (14 Mile Rd & Main St, where the hero photo was taken).
  // Used for geo meta tags, structured data and the image's GPS tag.
  geo: {
    latitude: 42.533294,
    longitude: -83.146058,
    placename: "Clawson, Michigan",
    region: "US-MI",
    postalCode: "48017",
  },

  email: {
    public: "hello@theclawsonlocal.com",
    founder: "tomas@theclawsonlocal.com",
    sales: "advertise@theclawsonlocal.com",
    transactional: "updates@theclawsonlocal.com",
  },

  founder: {
    name: "Tomás",
    // Real photo only (never stock): public/images/founder-tomas.webp, shown by
    // FounderSection via a static import so it is resized and blur-placeheld.
    photoAlt: "Tomás at a Detroit Tigers game at Comerica Park",
    // Only set true once verified. Copy says "serving Clawson" otherwise.
    isClawsonResident: false,
  },

  legalName: "Tomás Beltrán, doing business as The Clawson Local" as string | null,

  // ---- UNKNOWN: fill in only once confirmed ----
  mailingAddress: null as string | null, // FINAL BUSINESS MAILING ADDRESS
  phone: null as string | null, // FINAL PHONE NUMBER
  printVendor: null as string | null, // FINAL PRINT/MAIL VENDOR

  // Versioned so checkout acceptance can record which terms were accepted.
  termsVersion: "2026-09-23",
} as const;
