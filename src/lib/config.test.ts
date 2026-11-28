import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getConfig, getDataConfig, resetConfigForTests } from "@/lib/config";

const VARS = [
  "BLOG_AWS_REGION",
  "BLOG_POSTS_TABLE",
  "BLOG_MEDIA_BUCKET",
  "BLOG_SITE_URL",
  "COGNITO_USER_POOL_ID",
  "COGNITO_CLIENT_ID",
  "COGNITO_DOMAIN",
];

const dataEnv = {
  BLOG_AWS_REGION: "ap-northeast-2",
  BLOG_POSTS_TABLE: "blog-prod-posts-table",
  BLOG_MEDIA_BUCKET: "blog-prod-media-bucket",
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

  it("getConfig throws when BLOG_POSTS_TABLE is missing", () => {
    setEnv(fullEnv);
    delete process.env.BLOG_POSTS_TABLE;
    expect(() => getConfig()).toThrow(/Missing env: BLOG_POSTS_TABLE/);
  });

  it("getConfig maps all values", () => {
    setEnv(fullEnv);
    expect(getConfig()).toEqual({
      region: "ap-northeast-2",
      postsTable: "blog-prod-posts-table",
      mediaBucket: "blog-prod-media-bucket",
      siteUrl: "https://blog.example.com",
      cognito: {
        userPoolId: "ap-northeast-2_abc",
        clientId: "client123",
        domain: "https://x.auth.ap-northeast-2.amazoncognito.com",
      },
    });
  });

  it("getDataConfig works with only the three data vars", () => {
    setEnv(dataEnv);
    expect(getDataConfig()).toEqual({
      region: "ap-northeast-2",
      postsTable: "blog-prod-posts-table",
      mediaBucket: "blog-prod-media-bucket",
    });
  });

  it("getDataConfig throws on missing var", () => {
    setEnv({ BLOG_AWS_REGION: "ap-northeast-2" });
    expect(() => getDataConfig()).toThrow(/Missing env: BLOG_POSTS_TABLE/);
  });

  it("memoizes results", () => {
    setEnv(fullEnv);
    const a = getConfig();
    process.env.BLOG_POSTS_TABLE = "changed";
    expect(getConfig()).toBe(a);
  });
});
