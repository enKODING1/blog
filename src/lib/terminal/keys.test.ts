import { describe, expect, it } from "vitest";
import { isTypingTarget, nextIndex, normalizeNavKey } from "./keys";

describe("nextIndex", () => {
  it("starts at 0 from no selection", () => {
    expect(nextIndex(null, "j", 6)).toBe(0);
    expect(nextIndex(null, "k", 6)).toBe(0);
  });
  it("moves and clamps", () => {
    expect(nextIndex(5, "j", 6)).toBe(5);
    expect(nextIndex(2, "ArrowDown", 6)).toBe(3);
    expect(nextIndex(0, "k", 6)).toBe(0);
    expect(nextIndex(3, "ArrowUp", 6)).toBe(2);
  });
  it("ignores other keys", () => {
    expect(nextIndex(3, "x", 6)).toBe(3);
  });
  it("returns null for an empty list", () => {
    expect(nextIndex(null, "j", 0)).toBeNull();
  });
});

describe("isTypingTarget", () => {
  it("detects form fields and contentEditable", () => {
    expect(isTypingTarget({ tagName: "INPUT" })).toBe(true);
    expect(isTypingTarget({ tagName: "TEXTAREA" })).toBe(true);
    expect(isTypingTarget({ tagName: "SELECT" })).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true })).toBe(
      true
    );
  });
  it("is false for links and null", () => {
    expect(isTypingTarget({ tagName: "A" })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("normalizeNavKey", () => {
  it.each([
    ["ㅓ", "KeyJ", "j"],
    ["ㅏ", "KeyK", "k"],
    ["Process", "KeyJ", "j"],
    ["j", "KeyJ", "j"],
    ["x", "KeyX", "x"],
    ["ArrowDown", "ArrowDown", "ArrowDown"],
  ])("(%s, %s) -> %s", (key, code, out) => {
    expect(normalizeNavKey(key, code)).toBe(out);
  });
});
