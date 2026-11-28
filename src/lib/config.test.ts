import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getConfig, getDataConfig, resetConfigForTests } from "@/lib/config";

const VARS = [
  "BLOG_AWS_REGION",
  "BLOG_API_URL",
  "BLOG_SITE_URL",
  "COGNITO_USER_POOL_ID",
  "COGNITO_CLIENT_ID",
  "COGNITO_DOMAIN",
];

const dataEnv = {
  BLOG_AWS_REGION: "ap-northeast-2",
  BLOG_API_URL: "https://abc123.execute-api.ap-northeast-2.amazonaws.com",
};

const fullEnv = {
  ...dataEnv,
  BLOG_SITE_URL: "https://blog.example.com",
  COGNITO_USER_POOL_ID: "ap-northeast-2_abc",
  COGNITO_CLIENT_ID: "client123",
  COGNITO_DOMAIN: "https://x.auth.ap-northeast-2.amazoncognito.com",
};

function setEnv(env: Record<string, string>) {
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
}

describe("config", () => {
  beforeEach(() => {
    for (const k of VARS) delete process.env[k];
    resetConfigForTests();
  });
  afterEach(() => {
    for (const k of VARS) delete process.env[k];
    resetConfigForTests();
  });

  it("importing does not throw without env", async () => {
    await expect(import("@/lib/config")).resolves.toBeDefined();
  });

  it("getConfig throws when BLOG_API_URL is missing", () => {
    setEnv(fullEnv);
    delete process.env.BLOG_API_URL;
    expect(() => getConfig()).toThrow(/Missing env: BLOG_API_URL/);
  });

  it("getConfig maps all values", () => {
    setEnv(fullEnv);
    expect(getConfig()).toEqual({
      region: "ap-northeast-2",
      apiUrl: "https://abc123.execute-api.ap-northeast-2.amazonaws.com",
      siteUrl: "https://blog.example.com",
      cognito: {
        userPoolId: "ap-northeast-2_abc",
        clientId: "client123",
        domain: "https://x.auth.ap-northeast-2.amazoncognito.com",
      },
    });
  });

  it("getDataConfig works with only the two data vars", () => {
    setEnv(dataEnv);
    expect(getDataConfig()).toEqual({
      region: "ap-northeast-2",
      apiUrl: "https://abc123.execute-api.ap-northeast-2.amazonaws.com",
    });
  });

  it("getDataConfig throws when BLOG_API_URL is missing", () => {
    setEnv({ BLOG_AWS_REGION: "ap-northeast-2" });
    expect(() => getDataConfig()).toThrow(/Missing env: BLOG_API_URL/);
  });

  it("getDataConfig throws when BLOG_AWS_REGION is missing", () => {
    setEnv({ BLOG_API_URL: "https://x.example" });
    expect(() => getDataConfig()).toThrow(/Missing env: BLOG_AWS_REGION/);
  });

  it("memoizes results", () => {
    setEnv(fullEnv);
    const a = getConfig();
    process.env.BLOG_API_URL = "changed";
    expect(getConfig()).toBe(a);
  });
});
