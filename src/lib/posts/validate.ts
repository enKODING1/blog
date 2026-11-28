import type { PostInput } from "@/lib/posts/types";

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_SLUG_LENGTH = 200;
export const MAX_CONTENT_BYTES = 350_000;

/** True when `slug` is a well-formed post address (pattern and length). */
export function isValidSlug(slug: unknown): slug is string {
  return (
    typeof slug === "string" &&
    slug.length <= MAX_SLUG_LENGTH &&
    SLUG_PATTERN.test(slug)
  );
}

export type ValidationResult =
  | { ok: true; value: PostInput }
  | { ok: false; errors: Record<string, string> };

function isRealDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === mo - 1 &&
    dt.getUTCDate() === d
  );
}

export function validatePostInput(input: unknown): ValidationResult {
  if (typeof input !== "object" || input === null) {
    return { ok: false, errors: { _: "입력이 올바르지 않습니다." } };
  }
  const raw = input as Record<string, unknown>;
  const errors: Record<string, string> = {};
  const str = (k: string) =>
    typeof raw[k] === "string" ? (raw[k] as string) : "";

  const slug = str("slug");
  if (!SLUG_PATTERN.test(slug)) {
    errors.slug = "slug는 소문자, 숫자, 하이픈만 사용할 수 있습니다.";
  } else if (slug.length > MAX_SLUG_LENGTH) {
    errors.slug = `slug는 ${MAX_SLUG_LENGTH}자를 넘을 수 없습니다.`;
  }
  const title = str("title");
  if (!title.trim()) errors.title = "제목을 입력하세요.";
  const category = str("category");
  if (!category.trim()) errors.category = "카테고리를 입력하세요.";
  const date = str("date");
  if (!isRealDate(date)) errors.date = "날짜는 YYYY-MM-DD 형식이어야 합니다.";
  const content = str("content");
  if (typeof raw.content !== "string") {
    errors.content = "본문이 올바르지 않습니다.";
  } else if (Buffer.byteLength(content, "utf8") > MAX_CONTENT_BYTES) {
    errors.content = `본문은 ${MAX_CONTENT_BYTES}바이트를 넘을 수 없습니다.`;
  }
  const status = raw.status;
  if (status !== "draft" && status !== "published") {
    errors.status = "상태는 draft 또는 published 여야 합니다.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      slug,
      title,
      category,
      date,
      content,
      status: status as PostInput["status"],
    },
  };
}
