import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetConfigForTests } from "@/lib/config";

vi.mock("@/lib/posts/repo", () => ({ listPublishedPosts: vi.fn() }));

import { listPublishedPosts } from "@/lib/posts/repo";
import robots from "./robots";
import sitemap from "./sitemap";

const summary = (slug: string, updatedAt: string) => ({
  slug,
  title: slug,
  category: "c",
  date: "2025-01-01",
  status: "published" as const,
  createdAt: updatedAt,
  updatedAt,
});

describe("sitemap / robots", () => {
  beforeEach(() => {
    vi.stubEnv("BLOG_SITE_URL", "https://blog.example.com/");
    resetConfigForTests();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(listPublishedPosts).mockReset();
  });

  it("lists home and every published post with absolute URLs", async () => {
    vi.mocked(listPublishedPosts).mockResolvedValue([
      summary("fixed", "2026-01-02T00:00:00.000Z"),
      summary("browser-rendering", "2026-03-04T00:00:00.000Z"),
    ]);

    expect(await sitemap()).toEqual([
      {
        url: "https://blog.example.com/",
        lastModified: "2026-03-04T00:00:00.000Z",
      },
      {
        url: "https://blog.example.com/posts/fixed",
        lastModified: "2026-01-02T00:00:00.000Z",
      },
      {
        url: "https://blog.example.com/posts/browser-rendering",
        lastModified: "2026-03-04T00:00:00.000Z",
      },
    ]);
  });

  it("still lists home when there are no posts", async () => {
    vi.mocked(listPublishedPosts).mockResolvedValue([]);
    expect(await sitemap()).toEqual([
      { url: "https://blog.example.com/", lastModified: undefined },
    ]);
  });

  it("allows crawling except admin and api, and points at the sitemap", () => {
    expect(robots()).toEqual({
      rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api/"] },
      sitemap: "https://blog.example.com/sitemap.xml",
    });
  });
});
