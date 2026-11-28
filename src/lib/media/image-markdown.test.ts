import { describe, expect, it } from "vitest";
import {
  imageMarkdown,
  insertAt,
  removePlaceholder,
  replacePlaceholder,
  uploadPlaceholder,
} from "./image-markdown";

const P = "/media/posts/s/u.png";

describe("imageMarkdown", () => {
  it("uses the file name without extension", () => {
    expect(imageMarkdown("photo.png", P)).toBe(`![photo](${P})`);
    expect(imageMarkdown("a.b.png", P)).toBe(`![a.b](${P})`);
  });
  it.each([
    ["a]b.png", `![a\\]b](${P})`],
    ["x](http://evil)y.png", `![x\\](http://evil)y](${P})`],
    ["줄\n바꿈.png", `![줄바꿈](${P})`],
    ["<script>.png", `![script](${P})`],
    [".png", `![image](${P})`],
    ["a\\b[c].png", `![a\\\\b\\[c\\]](${P})`],
    ["\u0000\t.png", `![image](${P})`],
  ])("sanitizes %j", (name, expected) => {
    expect(imageMarkdown(name, P)).toBe(expected);
  });
});

describe("placeholders", () => {
  it("inserts, replaces and removes by placeholder", () => {
    const ph = uploadPlaceholder("id1");
    const c = insertAt("ab", 1, ph);
    expect(c).toBe(`a${ph}b`);
    expect(replacePlaceholder(c, ph, "X")).toBe("aXb");
    expect(removePlaceholder(c, ph)).toBe("ab");
  });
  it("tracks the placeholder after the user types before it", () => {
    const ph = uploadPlaceholder("id1");
    const c = "zzz" + insertAt("ab", 1, ph);
    expect(replacePlaceholder(c, ph, "X")).toBe("zzzaXb");
  });
  it("does nothing if the user deleted the placeholder", () => {
    const ph = uploadPlaceholder("id1");
    expect(replacePlaceholder("ab", ph, "X")).toBe("ab");
    expect(removePlaceholder("ab", ph)).toBe("ab");
  });
  it("distinct ids never collide", () => {
    expect(uploadPlaceholder("1")).not.toBe(uploadPlaceholder("10"));
    expect(
      replacePlaceholder(
        uploadPlaceholder("10") + uploadPlaceholder("1"),
        uploadPlaceholder("1"),
        "Y"
      )
    ).toBe(uploadPlaceholder("10") + "Y");
  });
  it("does not interpret $ patterns in the replacement", () => {
    const ph = uploadPlaceholder("i");
    expect(replacePlaceholder(ph, ph, "$&$1")).toBe("$&$1");
  });
});
