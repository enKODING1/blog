export type DataConfig = {
  region: string;
  /** API Gateway base URL, no trailing slash. */
  apiUrl: string;
};

export type AppConfig = DataConfig & {
  siteUrl: string;
  cognito: { userPoolId: string; clientId: string; domain: string };
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

let dataCache: DataConfig | undefined;
let appCache: AppConfig | undefined;

export function getDataConfig(): DataConfig {
  dataCache ??= {
    region: required("BLOG_AWS_REGION"),
    apiUrl: required("BLOG_API_URL"),
  };
  return dataCache;
}

export function getConfig(): AppConfig {
  appCache ??= {
    ...getDataConfig(),
    siteUrl: required("BLOG_SITE_URL"),
    cognito: {
      userPoolId: required("COGNITO_USER_POOL_ID"),
      clientId: required("COGNITO_CLIENT_ID"),
      domain: required("COGNITO_DOMAIN"),
    },
  };
  return appCache;
}

/** Public origin without a trailing slash, e.g. "https://blog.skang.dev". */
export function getSiteUrl(): string {
  return required("BLOG_SITE_URL").replace(/\/+$/, "");
}

/** Test-only: clears memoized config. */
export function resetConfigForTests(): void {
  dataCache = undefined;
  appCache = undefined;
}
