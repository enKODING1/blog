import matter from "gray-matter";
import { validatePostInput } from "@/lib/posts/validate";
import type { Post } from "@/lib/posts/types";

const IMAGE_PATH = /\/images\/posts\/[^\s)"'<>]+/g;

/** 펜스 코드 블록 바깥 구간에만 fn 을 적용한다. */
function mapOutsideCode(
  content: string,
  fn: (chunk: string) => string
): string {
  const lines = content.split("\n");
  const out: string[] = [];
  let buf: string[] = [];
  let fence: string | null = null;
  const flush = () => {
    if (buf.length) out.push(fn(buf.join("\n")));
    buf = [];
  };
  for (const line of lines) {
    const m = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fence === null) {
      if (m) {
        flush();
        fence = m[1];
        out.push(line);
      } else {
        buf.push(line);
      }
    } else {
      out.push(line);
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length) {
        fence = null;
      }
    }
  }
  flush();
  return out.join("\n");
}

export function parseLegacyPost(
  fileName: string,
  raw: string
): { post: Post; images: string[] } {
  const slug = fileName.replace(/\.md$/, "");
  const { data, content } = matter(raw);
  const date =
    data.date instanceof Date
      ? data.date.toISOString().slice(0, 10)
      : String(data.date ?? "");

  const found = new Set<string>();
  const rewritten = mapOutsideCode(content, chunk => {
    for (const m of chunk.matchAll(IMAGE_PATH)) found.add(m[0]);
    return chunk.replaceAll("/images/posts/", "/media/posts/");
  });

  const result = validatePostInput({
    slug,
    title: data.title,
    category: data.category,
    date,
    content: rewritten,
    status: "published",
  });
  if (!result.ok) {
    throw new Error(`${fileName}: ${Object.values(result.errors).join(" / ")}`);
  }
  const stamp = `${date}T00:00:00.000Z`;
  return {
    post: { ...result.value, createdAt: stamp, updatedAt: stamp },
    images: [...found],
  };
}
