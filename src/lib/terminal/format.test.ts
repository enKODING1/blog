import { describe, expect, it } from "vitest";
import {
  formatKstClock,
  progressBar,
  scrollRatio,
  terminalPath,
} from "./format";

describe("formatKstClock", () => {
  it("formats Seoul time", () => {
    expect(formatKstClock(new Date("2025-12-01T13:14:00Z"))).toBe("22:14 KST");
  });
  it("uses 00 not 24 at midnight", () => {
    expect(formatKstClock(new Date("2025-12-01T15:05:00Z"))).toBe("00:05 KST");
  });
});

describe("progressBar", () => {
  it("renders ratios", () => {
    expect(progressBar(0)).toBe("[----------] 0%");
    expect(progressBar(0.5)).toBe("[#####-----] 50%");
    expect(progressBar(0.04)).toBe("[----------] 4%");
  });
  it("clamps", () => {
    expect(progressBar(1.2)).toBe("[##########] 100%");
    expect(progressBar(-1)).toBe("[----------] 0%");
  });
});

describe("terminalPath", () => {
  it("maps paths", () => {
    expect(terminalPath("/")).toBe("~");
    expect(terminalPath("/posts/minishell/")).toBe("~/posts/minishell");
    expect(terminalPath("/posts/x")).toBe("~/posts/x");
  });
});

describe("scrollRatio", () => {
  it("returns 1 when not scrollable", () => {
    expect(scrollRatio(0, 800, 800)).toBe(1);
  });
  it("computes and clamps", () => {
    expect(scrollRatio(100, 1200, 800)).toBe(0.25);
    expect(scrollRatio(500, 1200, 800)).toBe(1);
    expect(scrollRatio(-5, 1200, 800)).toBe(0);
  });
});
