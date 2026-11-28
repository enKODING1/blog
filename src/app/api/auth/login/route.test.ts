import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/auth/login/route";
import { OAUTH_COOKIE } from "@/lib/auth/session";
import { clearTestEnv, setTestEnv, TEST_ENV } from "@/lib/auth/test-env";

function login(next?: string) {
  const q = next === undefined ? "" : `?next=${encodeURIComponent(next)}`;
  return GET(new NextRequest(`https://blog.example.com/api/auth/login${q}`));
}

function oauthCookie(res: Response) {
  const raw = res.headers
    .getSetCookie()
    .find(c => c.startsWith(`${OAUTH_COOKIE}=`));
  expect(raw).toBeDefined();
  return raw!;
}

function storedNext(res: Response): string {
  const value = oauthCookie(res)
    .split(";")[0]
    .slice(OAUTH_COOKIE.length + 1);
  return JSON.parse(decodeURIComponent(value)).next;
}

describe("GET /api/auth/login", () => {
  beforeEach(setTestEnv);
  afterEach(clearTestEnv);

  it("302 to authorize URL with state + challenge matching the cookie", async () => {
    const res = await login("/admin/new");
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location")!);
    expect(`${location.origin}${location.pathname}`).toBe(
      `${TEST_ENV.COGNITO_DOMAIN}/oauth2/authorize`
    );
    const cookie = oauthCookie(res);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\/api\/auth/);
    expect(cookie).toMatch(/Max-Age=600/);
    const value = JSON.parse(
      decodeURIComponent(cookie.split(";")[0].slice(OAUTH_COOKIE.length + 1))
    );
    expect(value.state).toBe(location.searchParams.get("state"));
    expect(value.next).toBe("/admin/new");
    expect(typeof value.verifier).toBe("string");
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it.each([
    "https://evil.com",
    "//evil.com",
    "/\\evil.com",
    "\\\\evil.com",
    "/\t/evil.com",
    "admin",
    "",
  ])("rejects next=%j and stores /admin", async next => {
    expect(storedNext(await login(next))).toBe("/admin");
  });

  it("defaults next to /admin", async () => {
    expect(storedNext(await login())).toBe("/admin");
  });

  it("keeps a safe path with query", async () => {
    expect(storedNext(await login("/admin/edit?slug=a"))).toBe(
      "/admin/edit?slug=a"
    );
  });
});
