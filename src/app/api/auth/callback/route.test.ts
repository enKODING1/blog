import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { exchangeCode } = vi.hoisted(() => ({ exchangeCode: vi.fn() }));

vi.mock("@/lib/auth/cognito", async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/auth/cognito")>()),
  exchangeCode,
}));

import { GET } from "@/app/api/auth/callback/route";
import { OAUTH_COOKIE } from "@/lib/auth/session";
import { clearTestEnv, setTestEnv } from "@/lib/auth/test-env";

const oauth = (v: unknown) =>
  `${OAUTH_COOKIE}=${encodeURIComponent(JSON.stringify(v))}`;

function req(query: string, cookie?: string) {
  return new NextRequest(
    `https://blog.example.com/api/auth/callback?${query}`,
    { headers: cookie ? { cookie } : {} }
  );
}

const good = { state: "s1", verifier: "v1", next: "/admin/posts" };

describe("GET /api/auth/callback", () => {
  beforeEach(() => {
    setTestEnv();
    exchangeCode.mockReset();
  });
  afterEach(clearTestEnv);

  it("400 on state mismatch without calling exchangeCode", async () => {
    const res = await GET(req("code=c&state=other", oauth(good)));
    expect(res.status).toBe(400);
    expect(exchangeCode).not.toHaveBeenCalled();
    expect(res.headers.get("set-cookie") ?? "").not.toContain("blog_id_token=");
  });

  it("400 when the OAUTH cookie is missing", async () => {
    const res = await GET(req("code=c&state=s1"));
    expect(res.status).toBe(400);
    expect(exchangeCode).not.toHaveBeenCalled();
  });

  it("400 when the OAUTH cookie is unparseable", async () => {
    const res = await GET(req("code=c&state=s1", `${OAUTH_COOKIE}=%7Bnope`));
    expect(res.status).toBe(400);
    expect(exchangeCode).not.toHaveBeenCalled();
  });

  it("400 when code or state is missing", async () => {
    expect((await GET(req("state=s1", oauth(good)))).status).toBe(400);
    expect((await GET(req("code=c", oauth(good)))).status).toBe(400);
    expect(exchangeCode).not.toHaveBeenCalled();
  });

  it("400 when Cognito returns an error", async () => {
    const res = await GET(
      req("error=access_denied&state=s1&code=c", oauth(good))
    );
    expect(res.status).toBe(400);
    expect(exchangeCode).not.toHaveBeenCalled();
  });

  it("502 without a session cookie when the code exchange fails", async () => {
    exchangeCode.mockRejectedValue(new Error("invalid_grant"));
    const res = await GET(req("code=c&state=s1", oauth(good)));
    expect(res.status).toBe(502);
    expect(res.headers.get("set-cookie") ?? "").not.toContain("blog_id_token=");
  });

  it("302 to next with the session cookie on success", async () => {
    exchangeCode.mockResolvedValue({ idToken: "the.id.token" });
    const res = await GET(req("code=c&state=s1", oauth(good)));
    expect(exchangeCode).toHaveBeenCalledWith("c", "v1");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "https://blog.example.com/admin/posts"
    );
    const setCookie = res.headers.getSetCookie();
    const session = setCookie.find(c => c.startsWith("blog_id_token="));
    expect(session).toBeDefined();
    expect(session).toContain("blog_id_token=the.id.token");
    expect(session).toMatch(/HttpOnly/i);
    expect(session).toMatch(/Secure/i);
    expect(session).toMatch(/SameSite=Lax/i);
    expect(session).toMatch(/Path=\//);
    expect(session).toMatch(/Max-Age=43200/);
    const cleared = setCookie.find(c => c.startsWith(`${OAUTH_COOKIE}=`));
    expect(cleared).toMatch(/Max-Age=0/);
    expect(cleared).toMatch(/Path=\/api\/auth/);
  });

  it("falls back to /admin when the stored next is unsafe", async () => {
    exchangeCode.mockResolvedValue({ idToken: "t" });
    const res = await GET(
      req("code=c&state=s1", oauth({ ...good, next: "//evil.com" }))
    );
    expect(res.headers.get("location")).toBe("https://blog.example.com/admin");
  });
});
