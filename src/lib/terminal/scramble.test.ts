import { describe, expect, it } from "vitest";
import { scrambleFrame } from "./scramble";

const CHARS = "!<>-_\\/[]{}=+*^?#01";

describe("scrambleFrame", () => {
  it("returns the target exactly at progress 1", () => {
    expect(scrambleFrame("Vec<T> & 정리", 1, CHARS, Math.random)).toBe(
      "Vec<T> & 정리"
    );
    expect(scrambleFrame("Vec<T> & 정리", 1.5, CHARS, Math.random)).toBe(
      "Vec<T> & 정리"
    );
  });

  it("keeps spaces and uses only chars elsewhere at progress 0", () => {
    const target = "부동 소수점 a b";
    const out = [...scrambleFrame(target, 0, CHARS, Math.random)];
    [...target].forEach((ch, i) => {
      if (ch === " ") expect(out[i]).toBe(" ");
      else expect(CHARS).toContain(out[i]);
    });
  });

  it("keeps the code point length of the target", () => {
    for (const p of [-1, 0, 0.3, 0.5, 0.99]) {
      expect([
        ...scrambleFrame("브라우저 렌더링", p, CHARS, Math.random),
      ]).toHaveLength([..."브라우저 렌더링"].length);
    }
  });

  it("reveals the leading part in proportion to progress", () => {
    expect(scrambleFrame("abcd", 0.5, CHARS, () => 0).slice(0, 2)).toBe("ab");
  });

  it("is deterministic for a deterministic rand", () => {
    expect(scrambleFrame("abcd", 0, CHARS, () => 0)).toBe("!!!!");
    expect(scrambleFrame("abcd", 0.25, CHARS, () => 0.999)).toBe("a111");
  });
});
