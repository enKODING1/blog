export type DataConfig = {
  region: string;
  postsTable: string;
  mediaBucket: string;
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
    postsTable: required("BLOG_POSTS_TABLE"),
    mediaBucket: required("BLOG_MEDIA_BUCKET"),
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

/** Test-only: clears memoized config. */
export function resetConfigForTests(): void {
  dataCache = undefined;
  appCache = undefined;
}
