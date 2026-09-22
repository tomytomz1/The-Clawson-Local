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

  email: {
    public: "hello@theclawsonlocal.com",
    founder: "tomas@theclawsonlocal.com",
    sales: "advertise@theclawsonlocal.com",
    transactional: "updates@theclawsonlocal.com",
  },

  founder: {
    name: "Tomas",
    // Drop a real photo at /public/founder.jpg and set this to "/founder.jpg".
    // Never use stock photography here.
    photoUrl: null as string | null,
    // Only set true once verified. Copy says "serving Clawson" otherwise.
    isClawsonResident: false,
  },

  // ---- UNKNOWN: fill in only once confirmed ----
  legalName: null as string | null, // FINAL BUSINESS LEGAL NAME
  mailingAddress: null as string | null, // FINAL BUSINESS MAILING ADDRESS
  phone: null as string | null, // FINAL PHONE NUMBER
  printVendor: null as string | null, // FINAL PRINT/MAIL VENDOR

  // Versioned so checkout acceptance can record which terms were accepted.
  termsVersion: "2026-09-draft-1",
} as const;
