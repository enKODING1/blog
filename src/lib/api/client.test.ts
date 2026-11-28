import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fromNodeProviderChain } = vi.hoisted(() => ({
  fromNodeProviderChain: vi.fn(() => async () => ({
    accessKeyId: "AKIDTEST",
    secretAccessKey: "secret",
  })),
}));

vi.mock("@aws-sdk/credential-providers", () => ({ fromNodeProviderChain }));

import { resetConfigForTests } from "@/lib/config";
import { apiRequest } from "@/lib/api/client";

const API = "https://abc123.execute-api.ap-northeast-2.amazonaws.com";
const fetchMock = vi.fn();

function reply(status: number, body?: unknown): Response {
  return new Response(
    body === undefined ? null : JSON.stringify(body),
    body === undefined
      ? { status }
      : { status, headers: { "content-type": "application/json" } }
  );
}

function lastCall(): { url: string; init: RequestInit } {
  const [url, init] = fetchMock.mock.calls.at(-1)!;
  return { url: String(url), init: init as RequestInit };
}

function headersOf(init: RequestInit): Record<string, string> {
  return Object.fromEntries(
    Object.entries(init.headers as Record<string, string>).map(([k, v]) => [
      k.toLowerCase(),
      v,
    ])
  );
}

beforeEach(() => {
  process.env.BLOG_AWS_REGION = "ap-northeast-2";
  process.env.BLOG_API_URL = API;
  resetConfigForTests();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  delete process.env.BLOG_AWS_REGION;
  delete process.env.BLOG_API_URL;
  resetConfigForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("apiRequest", () => {
  it("does not create credentials at import time", () => {
    expect(fromNodeProviderChain).not.toHaveBeenCalled();
  });

  it("signs a GET for execute-api and returns status and JSON", async () => {
    fetchMock.mockResolvedValue(reply(200, [{ slug: "a" }]));
    const res = await apiRequest("GET", "/posts");
    expect(res).toEqual({ status: 200, body: [{ slug: "a" }] });

    const { url, init } = lastCall();
    expect(url).toBe(`${API}/posts`);
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
    expect(init.cache).toBe("no-store");
    const h = headersOf(init);
    expect(h.authorization).toMatch(/^AWS4-HMAC-SHA256 /);
    expect(h.authorization).toContain(
      "Credential=AKIDTEST/" // date/region/service follow
    );
    expect(h.authorization).toContain(
      "/ap-northeast-2/execute-api/aws4_request"
    );
    expect(h["x-amz-date"]).toMatch(/^\d{8}T\d{6}Z$/);
    expect(h.host).toBe("abc123.execute-api.ap-northeast-2.amazonaws.com");
    expect(h).not.toHaveProperty("x-user-token");
    expect(h).not.toHaveProperty("content-type");
  });

  it("creates the credential provider once", async () => {
    fetchMock.mockImplementation(async () => reply(200, []));
    await apiRequest("GET", "/posts");
    await apiRequest("GET", "/posts");
    expect(fromNodeProviderChain).toHaveBeenCalledTimes(1);
  });

  it("sends a JSON body and signs x-user-token and content-type", async () => {
    fetchMock.mockResolvedValue(reply(201, { slug: "a" }));
    const res = await apiRequest("POST", "/admin/posts", {
      body: { slug: "a" },
      userToken: "id.token.value",
    });
    expect(res).toEqual({ status: 201, body: { slug: "a" } });
    const { url, init } = lastCall();
    expect(url).toBe(`${API}/admin/posts`);
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ slug: "a" }));
    const h = headersOf(init);
    expect(h["x-user-token"]).toBe("id.token.value");
    expect(h["content-type"]).toBe("application/json");
    const signed = /SignedHeaders=([^,]+)/.exec(h.authorization)![1].split(";");
    expect(signed).toContain("host");
    expect(signed).toContain("x-user-token");
    expect(signed).toContain("content-type");
  });

  it("returns null body for 204", async () => {
    fetchMock.mockResolvedValue(reply(204));
    await expect(
      apiRequest("DELETE", "/admin/posts/a", { userToken: "t" })
    ).resolves.toEqual({ status: 204, body: null });
  });

  it.each([
    [400, { errors: { title: "x" } }],
    [401, { error: "unauthorized" }],
    [403, { error: "forbidden" }],
    [404, { error: "not_found" }],
    [409, { errors: { slug: "이미 있는 주소입니다" } }],
  ])("returns %i with its JSON body", async (status, body) => {
    fetchMock.mockResolvedValue(reply(status, body));
    await expect(apiRequest("GET", "/posts/a")).resolves.toEqual({
      status,
      body,
    });
  });

  it.each([500, 502, 503, 429])("throws on %i", async status => {
    fetchMock.mockResolvedValue(reply(status, { error: "internal" }));
    await expect(apiRequest("GET", "/posts")).rejects.toThrow(`API ${status}`);
  });

  it("uses an 8s timeout signal and rethrows on timeout", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    fetchMock.mockRejectedValue(
      new DOMException(
        "The operation was aborted due to timeout",
        "TimeoutError"
      )
    );
    await expect(apiRequest("GET", "/posts")).rejects.toThrow();
    expect(timeout).toHaveBeenCalledWith(8000);
    expect(lastCall().init.signal).toBeInstanceOf(AbortSignal);
    expect(fetchMock).toHaveBeenCalledTimes(1); // no retry
  });

  it("throws on network errors without retrying", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(apiRequest("GET", "/posts")).rejects.toThrow("fetch failed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws when BLOG_API_URL is missing", async () => {
    delete process.env.BLOG_API_URL;
    resetConfigForTests();
    await expect(apiRequest("GET", "/posts")).rejects.toThrow(
      /Missing env: BLOG_API_URL/
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
