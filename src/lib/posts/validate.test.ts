import { describe, expect, it } from "vitest";
import { validatePostInput } from "@/lib/posts/validate";

const base = {
  slug: "browser-rendering",
  title: "제목",
  category: "개발",
  date: "2025-12-01",
  content: "본문",
  status: "published",
};

function errorsOf(overrides: Record<string, unknown>) {
  const r = validatePostInput({ ...base, ...overrides });
  return r.ok ? null : r.errors;
}

describe("validatePostInput", () => {
  it("accepts a valid input", () => {
    const r = validatePostInput(base);
    expect(r).toEqual({ ok: true, value: base });
  });

  it.each([
    "42-piscine",
    "browser-rendering",
    "fixed",
    "minishell",
    "nand2tetris",
    "naval-sw-developer",
  ])("accepts existing slug %s", slug => {
    expect(validatePostInput({ ...base, slug }).ok).toBe(true);
  });

  it.each(["Hello", "a--b", "한글", "-a", "a-", ""])(
    "rejects slug %j",
    slug => {
      expect(errorsOf({ slug })).toHaveProperty("slug");
    }
  );

  it("rejects invalid month", () => {
    expect(errorsOf({ date: "2025-13-01" })).toHaveProperty("date");
  });

  it("rejects non-existent calendar date", () => {
    expect(errorsOf({ date: "2025-02-30" })).toHaveProperty("date");
  });

  it("accepts leap day only in leap years", () => {
    expect(validatePostInput({ ...base, date: "2024-02-29" }).ok).toBe(true);
    expect(errorsOf({ date: "2025-02-29" })).toHaveProperty("date");
  });

  it("rejects malformed date formats", () => {
    expect(errorsOf({ date: "2025-1-1" })).toHaveProperty("date");
    expect(errorsOf({ date: "20251201" })).toHaveProperty("date");
  });

  it("rejects empty or blank title and category", () => {
    expect(errorsOf({ title: "" })).toHaveProperty("title");
    expect(errorsOf({ title: "   " })).toHaveProperty("title");
    expect(errorsOf({ category: "" })).toHaveProperty("category");
  });

  it("rejects content over 350,000 UTF-8 bytes", () => {
    expect(errorsOf({ content: "a".repeat(350_001) })).toHaveProperty(
      "content"
    );
    // 3 bytes per Korean char: 116,667 chars = 350,001 bytes
    expect(errorsOf({ content: "가".repeat(116_667) })).toHaveProperty(
      "content"
    );
    expect(
      validatePostInput({ ...base, content: "a".repeat(350_000) }).ok
    ).toBe(true);
  });

  it("rejects an invalid status", () => {
    expect(errorsOf({ status: "hidden" })).toHaveProperty("status");
  });

  it("rejects non-object input and non-string fields", () => {
    expect(validatePostInput(null).ok).toBe(false);
    expect(validatePostInput("x").ok).toBe(false);
    expect(errorsOf({ title: 5 })).toHaveProperty("title");
  });

  it("collects multiple errors", () => {
    const e = errorsOf({ slug: "Bad", title: "" });
    expect(Object.keys(e ?? {}).sort()).toEqual(["slug", "title"]);
  });
});
