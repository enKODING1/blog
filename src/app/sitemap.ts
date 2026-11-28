import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/config";
import { listPublishedPosts } from "@/lib/posts/repo";

// Posts live in DynamoDB and change from /admin, so build this per request
// (and keep CI builds free of AWS access).
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = getSiteUrl();
  const posts = await listPublishedPosts();
  const latest = posts.reduce<string | undefined>(
    (max, p) => (!max || p.updatedAt > max ? p.updatedAt : max),
    undefined
  );

  return [
    { url: `${site}/`, lastModified: latest },
    ...posts.map(post => ({
      url: `${site}/posts/${encodeURIComponent(post.slug)}`,
      lastModified: post.updatedAt,
    })),
  ];
}
