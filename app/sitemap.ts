import type { MetadataRoute } from "next";
import { categorySeeds } from "@/config/categories";
import { site } from "@/config/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ["", "/categories", "/faq", "/about", "/contact", "/terms", "/privacy"];
  return [
    ...pages.map((p) => ({ url: `${site.url}${p}` })),
    ...categorySeeds.filter((c) => c.active).map((c) => ({ url: `${site.url}/category/${c.slug}` })),
  ];
}
