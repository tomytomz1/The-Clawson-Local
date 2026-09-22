import type { MetadataRoute } from "next";
import { site } from "@/config/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Private tokenized and internal routes (added in later phases).
      disallow: ["/advertiser/", "/proof/", "/admin", "/api/", "/checkout/"],
    },
    sitemap: `${site.url}/sitemap.xml`,
  };
}
