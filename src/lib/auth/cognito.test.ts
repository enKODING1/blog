import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildAuthorizeUrl, exchangeCode } from "@/lib/auth/cognito";
import { clearTestEnv, setTestEnv, TEST_ENV } from "@/lib/auth/test-env";

describe("buildAuthorizeUrl", () => {
  beforeEach(setTestEnv);
  afterEach(clearTestEnv);

  it("builds the Managed Login authorize URL with PKCE", () => {
    const url = new URL(buildAuthorizeUrl({ state: "st", challenge: "ch" }));
    expect(`${url.origin}${url.pathname}`).toBe(
      `${TEST_ENV.COGNITO_DOMAIN}/oauth2/authorize`
    );
    const q = url.searchParams;
    expect(q.get("response_type")).toBe("code");
    expect(q.get("client_id")).toBe("client123");
    expect(q.get("redirect_uri")).toBe(
      "https://blog.example.com/api/auth/callback"
    );
    expect(q.get("scope")).toBe("openid email");
    expect(url.search).toContain("scope=openid+email");
    expect(q.get("state")).toBe("st");
    expect(q.get("code_challenge")).toBe("ch");
    expect(q.get("code_challenge_method")).toBe("S256");
  });
});

describe("exchangeCode", () => {
  beforeEach(setTestEnv);
  afterEach(() => {
    vi.unstubAllGlobals();
    clearTestEnv();
  });

  it("POSTs form-urlencoded with code_verifier and returns idToken", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ id_token: "idt", access_token: "a" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(exchangeCode("the-code", "the-verifier")).resolves.toEqual({
      idToken: "idt",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(`${TEST_ENV.COGNITO_DOMAIN}/oauth2/token`);
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("content-type")).toBe(
      "application/x-www-form-urlencoded"
    );
    const body = new URLSearchParams(String(init.body));
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("client_id")).toBe("client123");
    expect(body.get("code")).toBe("the-code");
    expect(body.get("code_verifier")).toBe("the-verifier");
    expect(body.get("redirect_uri")).toBe(
      "https://blog.example.com/api/auth/callback"
    );
  });

  it("throws on a 400 response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: "invalid_grant" }), {
            status: 400,
          })
      )
    );
    await expect(exchangeCode("c", "v")).rejects.toThrow();
  });

  it("throws when id_token is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }))
    );
    await expect(exchangeCode("c", "v")).rejects.toThrow();
  });
});
