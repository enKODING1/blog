import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkImageRef, parseLegacyPost } from "@/lib/posts/import";

const fixture = (name: string) =>
  readFileSync(path.join(__dirname, "__fixtures__", name), "utf8");

describe("parseLegacyPost", () => {
  it("browser-rendering.md 를 파싱한다", () => {
    const { post, images } = parseLegacyPost(
      "browser-rendering.md",
      fixture("browser-rendering.md")
    );
    expect(post.slug).toBe("browser-rendering");
    expect(post.title).toBe("브라우저가 렌더링 하는 과정");
    expect(post.date).toBe("2025-12-01");
    expect(post.category).toBe("WEB");
    expect(post.status).toBe("published");
    expect(post.createdAt).toBe("2025-12-01T00:00:00.000Z");
    expect(post.updatedAt).toBe("2025-12-01T00:00:00.000Z");
    expect(post.content).not.toContain("/images/posts/");
    expect(post.content).toContain("/media/posts/browser-rendering/dom.png");
    expect(images).toHaveLength(6);
  });

  it("fixed.md 의 이미지는 1개", () => {
    const { images } = parseLegacyPost("fixed.md", fixture("fixed.md"));
    expect(images).toEqual(["/images/posts/fixed/float_size.png"]);
  });

  it("중복 이미지는 한 번만 센다", () => {
    const raw = `---\ntitle: "t"\ndate: "2025-01-02"\ncategory: "X"\n---\n![a](/images/posts/s/a.png) ![b](/images/posts/s/a.png)\n`;
    expect(parseLegacyPost("s.md", raw).images).toEqual([
      "/images/posts/s/a.png",
    ]);
  });

  it("코드 블록 안의 이미지 경로는 치환/수집하지 않는다", () => {
    const raw = [
      "---",
      'title: "t"',
      'date: "2025-01-02"',
      'category: "X"',
      "---",
      "![a](/images/posts/s/a.png)",
      "```md",
      "![b](/images/posts/s/b.png)",
      "```",
      "",
    ].join("\n");
    const { post, images } = parseLegacyPost("s.md", raw);
    expect(images).toEqual(["/images/posts/s/a.png"]);
    expect(post.content).toContain("![a](/media/posts/s/a.png)");
    expect(post.content).toContain("![b](/images/posts/s/b.png)");
  });

  it("검증 실패 시 throw", () => {
    expect(() =>
      parseLegacyPost("Bad Slug.md", "---\ntitle: x\n---\n")
    ).toThrow();
  });
});

describe("checkImageRef", () => {
  const pub = "/repo/public";
  it.each([
    "/images/posts/../../x.png",
    "/images/posts/s/my%20pic.png",
    "/images/posts/s/사진.png",
    "/images/posts/s/a.png?x=1",
    "/images/posts/s/a.png#h",
    "/images/posts/s/sub/a.png",
    "/images/posts/s/..",
  ])("거부: %s", ref => {
    expect(checkImageRef(ref, pub)).not.toBeNull();
  });
  it("허용: 정상 경로", () => {
    expect(checkImageRef("/images/posts/fixed/float_size.png", pub)).toBeNull();
  });
});
