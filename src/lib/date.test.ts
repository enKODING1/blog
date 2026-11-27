import { describe, expect, it } from "vitest";
import { seoulToday } from "@/lib/date";

describe("seoulToday", () => {
  it("uses the Seoul date, not UTC", () => {
    expect(seoulToday(new Date("2025-12-01T20:00:00Z"))).toBe("2025-12-02");
  });

  it("keeps the same day before Seoul midnight", () => {
    expect(seoulToday(new Date("2025-12-01T14:59:59Z"))).toBe("2025-12-01");
  });

  it("zero-pads month and day", () => {
    expect(seoulToday(new Date("2025-01-04T00:00:00Z"))).toBe("2025-01-04");
  });
});
