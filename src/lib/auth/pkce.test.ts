import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createPkce, createState } from "@/lib/auth/pkce";

const BASE64URL = /^[A-Za-z0-9_-]+$/;

describe("createPkce", () => {
  it("challenge is base64url(sha256(verifier))", () => {
    const { verifier, challenge } = createPkce();
    const expected = createHash("sha256").update(verifier).digest("base64url");
    expect(challenge).toBe(expected);
    expect(challenge).toMatch(BASE64URL);
  });

  it("verifier is 43-128 chars of base64url", () => {
    const { verifier } = createPkce();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
    expect(verifier).toMatch(BASE64URL);
  });

  it("generates a fresh verifier each time", () => {
    expect(createPkce().verifier).not.toBe(createPkce().verifier);
  });
});

describe("createState", () => {
  it("is random base64url", () => {
    const a = createState();
    expect(a).toMatch(BASE64URL);
    expect(a.length).toBeGreaterThanOrEqual(22);
    expect(a).not.toBe(createState());
  });
});
