import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/config";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api/"] },
    sitemap: `${getSiteUrl()}/sitemap.xml`,
  };
}
