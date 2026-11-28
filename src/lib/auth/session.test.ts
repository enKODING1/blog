import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { cookieGet, verify, create } = vi.hoisted(() => {
  const verify = vi.fn();
  return {
    cookieGet: vi.fn(),
    verify,
    create: vi.fn(() => ({ verify })),
  };
});

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: cookieGet }),
}));

vi.mock("aws-jwt-verify", () => ({
  CognitoJwtVerifier: { create },
}));

import {
  getAdminSession,
  getSessionToken,
  requireAdmin,
  requireAdminToken,
  SESSION_COOKIE,
  UnauthorizedError,
} from "@/lib/auth/session";
import { clearTestEnv, setTestEnv } from "@/lib/auth/test-env";

describe("admin session", () => {
  beforeEach(() => {
    setTestEnv();
    cookieGet.mockReset();
    verify.mockReset();
  });
  afterEach(clearTestEnv);

  it("returns null without a session cookie and does not verify", async () => {
    cookieGet.mockReturnValue(undefined);
    await expect(getAdminSession()).resolves.toBeNull();
    expect(verify).not.toHaveBeenCalled();
  });

  it("returns null (does not throw) when the token is expired or forged", async () => {
    cookieGet.mockReturnValue({ name: SESSION_COOKIE, value: "bad.token" });
    verify.mockRejectedValue(new Error("Token expired"));
    await expect(getAdminSession()).resolves.toBeNull();
  });

  it("returns { email, sub } for a valid admin token", async () => {
    cookieGet.mockReturnValue({ name: SESSION_COOKIE, value: "good.token" });
    verify.mockResolvedValue({
      sub: "user-sub",
      email: "owner@example.com",
      "cognito:groups": ["blog-admin"],
    });
    await expect(getAdminSession()).resolves.toEqual({
      email: "owner@example.com",
      sub: "user-sub",
    });
    expect(verify).toHaveBeenCalledWith("good.token");
    expect(create).toHaveBeenCalledWith({
      userPoolId: "ap-northeast-2_abc",
      clientId: "client123",
      tokenUse: "id",
      groups: "blog-admin",
    });
  });

  it("reuses one verifier across calls (JWKS cache)", async () => {
    cookieGet.mockReturnValue({ name: SESSION_COOKIE, value: "good.token" });
    verify.mockResolvedValue({ sub: "s", email: "e@example.com" });
    await getAdminSession();
    await getAdminSession();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("returns null when the payload has no email", async () => {
    cookieGet.mockReturnValue({ name: SESSION_COOKIE, value: "t" });
    verify.mockResolvedValue({ sub: "s" });
    await expect(getAdminSession()).resolves.toBeNull();
  });

  it("requireAdmin throws UnauthorizedError without a session", async () => {
    cookieGet.mockReturnValue(undefined);
    await expect(requireAdmin()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("requireAdmin returns the session when valid", async () => {
    cookieGet.mockReturnValue({ name: SESSION_COOKIE, value: "t" });
    verify.mockResolvedValue({ sub: "s", email: "e@example.com" });
    await expect(requireAdmin()).resolves.toEqual({
      email: "e@example.com",
      sub: "s",
    });
  });

  it("getSessionToken returns the raw cookie only for a valid admin session", async () => {
    cookieGet.mockReturnValue({ name: SESSION_COOKIE, value: "good.token" });
    verify.mockResolvedValue({ sub: "s", email: "e@example.com" });
    await expect(getSessionToken()).resolves.toBe("good.token");
  });

  it("getSessionToken returns null without a cookie", async () => {
    cookieGet.mockReturnValue(undefined);
    await expect(getSessionToken()).resolves.toBeNull();
  });

  it("getSessionToken returns null for an invalid token", async () => {
    cookieGet.mockReturnValue({ name: SESSION_COOKIE, value: "bad.token" });
    verify.mockRejectedValue(new Error("Token expired"));
    await expect(getSessionToken()).resolves.toBeNull();
  });

  it("requireAdminToken throws UnauthorizedError without a session", async () => {
    cookieGet.mockReturnValue(undefined);
    await expect(requireAdminToken()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("requireAdminToken returns the token when valid", async () => {
    cookieGet.mockReturnValue({ name: SESSION_COOKIE, value: "good.token" });
    verify.mockResolvedValue({ sub: "s", email: "e@example.com" });
    await expect(requireAdminToken()).resolves.toBe("good.token");
  });
});
