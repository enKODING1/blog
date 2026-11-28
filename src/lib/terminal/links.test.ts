import { describe, expect, it } from "vitest";
import { shouldIntercept } from "./links";

const click = {
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  defaultPrevented: false,
};

describe("shouldIntercept", () => {
  it("intercepts a plain left click to another site path", () => {
    expect(shouldIntercept(click, "/posts/a", "/")).toBe(true);
    expect(shouldIntercept(click, "/", "/posts/a")).toBe(true);
  });

  it("allows target _self", () => {
    expect(shouldIntercept(click, "/posts/a", "/", "_self")).toBe(true);
  });

  it.each(["metaKey", "ctrlKey", "shiftKey", "altKey"] as const)(
    "ignores clicks with %s",
    key => {
      expect(shouldIntercept({ ...click, [key]: true }, "/posts/a", "/")).toBe(
        false
      );
    }
  );

  it("ignores middle click", () => {
    expect(shouldIntercept({ ...click, button: 1 }, "/posts/a", "/")).toBe(
      false
    );
  });

  it("ignores already prevented clicks", () => {
    expect(
      shouldIntercept({ ...click, defaultPrevented: true }, "/posts/a", "/")
    ).toBe(false);
  });

  it("ignores target _blank", () => {
    expect(shouldIntercept(click, "/posts/a", "/", "_blank")).toBe(false);
  });

  it("ignores external and protocol-relative links", () => {
    expect(shouldIntercept(click, "https://x.com/a", "/")).toBe(false);
    expect(shouldIntercept(click, "//evil.com", "/")).toBe(false);
  });

  it("ignores admin and api paths", () => {
    expect(shouldIntercept(click, "/admin", "/")).toBe(false);
    expect(shouldIntercept(click, "/admin/new", "/")).toBe(false);
    expect(shouldIntercept(click, "/api/auth/login", "/")).toBe(false);
  });

  it("ignores links to the current path (hash or query only)", () => {
    expect(shouldIntercept(click, "/posts/a#h", "/posts/a")).toBe(false);
    expect(shouldIntercept(click, "/?x=1", "/")).toBe(false);
  });
});
