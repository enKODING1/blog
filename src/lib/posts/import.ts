import path from "node:path";
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

const IMAGE_REF =
  /^\/images\/posts\/([a-z0-9]+(?:-[a-z0-9]+)*)\/([A-Za-z0-9._-]+)$/;

/** 이미지 ref 가 안전하면 null, 아니면 거부 사유를 돌려준다. */
export function checkImageRef(ref: string, publicDir: string): string | null {
  if (/[?#%]/.test(ref)) return "?, #, % 문자를 포함";
  const segments = ref.split("/");
  if (segments.includes("..") || segments.includes(".")) {
    return ".. 세그먼트를 포함";
  }
  const m = IMAGE_REF.exec(ref);
  if (!m || m[2] === "." || m[2] === "..") {
    return "/images/posts/<slug>/<file> 형태가 아님";
  }
  const base = path.resolve(publicDir, "images", "posts");
  const resolved = path.resolve(publicDir, ref.slice(1));
  if (!resolved.startsWith(base + path.sep)) return "images/posts 밖을 가리킴";
  return null;
}
