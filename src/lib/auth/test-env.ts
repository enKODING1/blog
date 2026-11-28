import { resetConfigForTests } from "@/lib/config";

export const TEST_ENV = {
  BLOG_AWS_REGION: "ap-northeast-2",
  BLOG_API_URL: "https://abc123.execute-api.ap-northeast-2.amazonaws.com",
  BLOG_SITE_URL: "https://blog.example.com",
  COGNITO_USER_POOL_ID: "ap-northeast-2_abc",
  COGNITO_CLIENT_ID: "client123",
  COGNITO_DOMAIN: "https://x.auth.ap-northeast-2.amazoncognito.com",
};

/** Test-only: sets the full app env and clears memoized config. */
export function setTestEnv(): void {
  for (const [k, v] of Object.entries(TEST_ENV)) process.env[k] = v;
  resetConfigForTests();
}

export function clearTestEnv(): void {
  for (const k of Object.keys(TEST_ENV)) delete process.env[k];
  resetConfigForTests();
}
